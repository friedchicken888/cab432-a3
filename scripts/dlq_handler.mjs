import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import https from 'https';
import http from 'http';
import { URL } from 'url';

export const handler = async (event) => {
    const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

    let dlqApiKey;
    try {
        const paramCommand = new GetParameterCommand({
            Name: '/a3/group123/dlq_api_key',
            WithDecryption: true,
        });
        const paramResponse = await ssmClient.send(paramCommand);
        dlqApiKey = paramResponse.Parameter.Value;
    } catch (error) {
        console.error("Error retrieving API key from Parameter Store:", error);
        throw new Error("Failed to retrieve API key. Check IAM permissions and parameter name.");
    }

    const backendUrl = process.env.BACKEND_API_URL;
    if (!backendUrl) {
        console.error("BACKEND_API_URL environment variable not set in Lambda.");
        throw new Error("Backend API URL is not configured.");
    }

    const processingResults = [];

    for (const record of event.Records) {
        try {
            const messageBody = JSON.parse(record.body);

            const originalPayload = messageBody;

            const fractalHash = originalPayload.hash;
            const historyId = originalPayload.historyId;

            if (!fractalHash || !historyId) {
                console.warn(`DLQ message missing 'hash' or 'historyId'. Skipping record: ${JSON.stringify(originalPayload)}`);
                processingResults.push({ status: 'skipped', reason: 'missing hash or historyId', recordId: record.messageId });
                continue;
            }

            console.log(`Processing DLQ message for hash: ${fractalHash}, historyId: ${historyId}`);

            const postData = JSON.stringify({ hash: fractalHash, historyId: historyId });
            const requestUrl = new URL(`${backendUrl}/api/fractal/dlq-failed`);

            const requestModule = requestUrl.protocol === 'https:' ? https : http;

            const options = {
                hostname: requestUrl.hostname,
                port: requestUrl.port || (requestUrl.protocol === 'https:' ? 443 : 80),
                path: requestUrl.pathname + requestUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'x-api-key': dlqApiKey,
                },
            };

            await new Promise((resolve, reject) => {
                const req = requestModule.request(options, (res) => {
                    let responseBody = '';
                    res.on('data', (chunk) => (responseBody += chunk));
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log(`Successfully updated fractal status for hash ${fractalHash}: ${responseBody}`);
                            processingResults.push({ status: 'success', recordId: record.messageId, response: responseBody });
                            resolve();
                        } else {
                            console.error(`Backend responded with status ${res.statusCode} for hash ${fractalHash}: ${responseBody}`);
                            processingResults.push({ status: 'failed', recordId: record.messageId, statusCode: res.statusCode, response: responseBody });
                            reject(new Error(`Backend error: ${res.statusCode} - ${responseBody}`));
                        }
                    });
                });

                req.on('error', (e) => {
                    console.error(`HTTP request failed for hash ${fractalHash}: ${e.message}`);
                    processingResults.push({ status: 'failed', recordId: record.messageId, error: e.message });
                    reject(e);
                });

                req.write(postData);
                req.end();
            });

        } catch (error) {
            console.error(`Error processing DLQ record ${record.messageId}:`, error);
            processingResults.push({ status: 'failed', recordId: record.messageId, error: error.message });
        }
    }

    const failedRecords = processingResults.filter(r => r.status === 'failed');
    if (failedRecords.length > 0) {
        console.error(`Lambda invocation completed with ${failedRecords.length} failed records.`);
    }

    return {
        statusCode: 200,
        body: JSON.stringify(processingResults),
    };
};