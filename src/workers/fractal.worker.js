require('dotenv').config();
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { generateFractal } = require('../services/fractalGenerationService');
const s3Service = require('../services/s3Service');
const Fractal = require('../models/fractal.model');
const History = require('../models/history.model');
const Gallery = require('../models/gallery.model');
const cacheService = require('../services/cacheService');
const awsConfigService = require('../services/awsConfigService');

let sqsClient;
let queueUrl;

async function initialise() {
    const region = await awsConfigService.getAwsRegion();
    sqsClient = new SQSClient({ region });
    queueUrl = await awsConfigService.getParameter('/n11051337/sqs_queue_url');
    if (!queueUrl) {
        console.error('SQS_QUEUE_URL not found in Parameter Store. Exiting worker.');
        process.exit(1);
    }
    await s3Service.ensureBucketAndTags();
    await cacheService.init();
    console.log('Fractal worker initialised and ready to poll SQS.');
}

async function pollQueue() {
    try {
        const command = new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20,
            MessageAttributeNames: ["All"]
        });
        const response = await sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
            const message = response.Messages[0];
            console.log('Message received:', message.Body);
            await processMessage(message);
        }
    } catch (error) {
        console.error('Error polling SQS:', error);
    }
}

async function processMessage(message) {
    let job;
    try {
        job = JSON.parse(message.Body);
    } catch (e) {
        console.error('\n--- ERROR ---\nFailed to parse message body:', e);
        return;
    }

    const { options, hash, user, historyId } = job;
    console.log(`Generation request received for hash ${hash} from user ${user.username}`);

    try {
        let existingFractal = await Fractal.findFractalByHash(hash);

        if (existingFractal && (existingFractal.status === 'complete' || existingFractal.status === 'too_complex')) {
            console.log(`Fractal with hash ${hash} already ${existingFractal.status}. Skipping generation.`);
            const deleteCommand = new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: message.ReceiptHandle,
            });
            await sqsClient.send(deleteCommand);
            console.log(`[${new Date().toISOString()}] Message for hash ${hash} deleted from queue (already ${existingFractal.status}).\n----------------------------------------`);
            return;
        }

        await Fractal.updateFractalStatus(hash, 'generating', existingFractal ? existingFractal.retry_count : 0);
        await History.updateHistoryStatus(historyId, 'generating');

    try {
        const buffer = await generateFractal(options);
        if (!buffer) {
            console.error(`[${new Date().toISOString()}] Fractal generation timed out or failed for hash: ${hash}\n----------------------------------------`);
            await Fractal.updateFractalStatus(hash, 'too_complex', existingFractal ? existingFractal.retry_count : 0);
            await History.updateHistoryStatus(historyId, 'too_complex');
            return;
        }

        console.log(`Storing fractal image in S3 for hash ${hash}...`);
        const s3Key = await s3Service.uploadFile(buffer, 'image/png', 'fractals', hash);
        console.log(`Storing fractal metadata in database for hash ${hash}...`);

        let fractalIdToUse;
        if (existingFractal) {
            await Fractal.updateFractalStatus(hash, 'complete', 0);
            await Fractal.updateFractalS3Key(hash, s3Key);
            fractalIdToUse = existingFractal.id;
        } else {
            const fractalData = { ...options, hash, s3Key };
            const { id: newFractalId } = await Fractal.createFractal(fractalData);
            fractalIdToUse = newFractalId;
        }

        await History.updateHistoryStatus(historyId, 'complete');
        await Gallery.addToGallery(user.id, fractalIdToUse, hash);

        const userCacheKey = `gallery:${user.id}:${JSON.stringify({})}:added_at:DESC:5:0`;
        await cacheService.del(userCacheKey);
        const adminCacheKey = `admin:gallery:${JSON.stringify({})}:added_at:DESC:5:0`;
        await cacheService.del(adminCacheKey);

        console.log(`[${new Date().toISOString()}] Successfully processed and stored fractal with hash: ${hash}`);

        const deleteCommand = new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
        });
        await sqsClient.send(deleteCommand);
        console.log(`[${new Date().toISOString()}] Message for hash ${hash} deleted from queue.\n----------------------------------------`);

    } catch (innerError) {
        console.error(`\n--- ERROR ---\n[${new Date().toISOString()}] Failed during fractal generation or storage for hash ${hash}:`, innerError);
        await Fractal.updateFractalStatus(hash, 'failed', (existingFractal ? existingFractal.retry_count : 0) + 1);
        await History.updateHistoryStatus(historyId, 'failed');
    }

    } catch (error) {
        console.error(`\n--- ERROR ---\n[${new Date().toISOString()}] Failed to process job for hash ${hash}:`, error);
        await Fractal.updateFractalStatus(hash, 'failed', (existingFractal ? existingFractal.retry_count : 0) + 1);
        await History.updateHistoryStatus(historyId, 'failed');
        console.error('----------------------------------------');
    }
}

(async () => {
    await initialise();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await pollQueue();
    }
})();