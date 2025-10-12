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
        console.error('Failed to parse message body:', e);
        return;
    }

    const { options, hash, user } = job;

    try {
        const buffer = await generateFractal(options);
        if (!buffer) {
            console.error(`Fractal generation timed out or failed for hash: ${hash}`);
            return;
        }

        const s3Key = await s3Service.uploadFile(buffer, 'image/png', 'fractals', hash);
        const fractalData = { ...options, hash, s3Key };

        const { id: newFractalId } = await Fractal.createFractal(fractalData);
        await History.createHistoryEntry(user.id, user.username, newFractalId);
        await Gallery.addToGallery(user.id, newFractalId, hash);

        const userCacheKey = `gallery:${user.id}:${JSON.stringify({})}:added_at:DESC:5:0`;
        await cacheService.del(userCacheKey);
        const adminCacheKey = `admin:gallery:${JSON.stringify({})}:added_at:DESC:5:0`;
        await cacheService.del(adminCacheKey);

        console.log(`Successfully processed and stored fractal with hash: ${hash}`);

        const deleteCommand = new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle,
        });
        await sqsClient.send(deleteCommand);
        console.log(`Message for hash ${hash} deleted from queue.`);

    } catch (error) {
        console.error(`Failed to process job for hash ${hash}:`, error);
    }
}

(async () => {
    await initialise();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        await pollQueue();
    }
})();