const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { verifyToken } = require('./auth.js');
const Fractal = require('../models/fractal.model.js');
const History = require('../models/history.model.js');
const Gallery = require('../models/gallery.model.js');
const s3Service = require('../services/s3Service');
const cacheService = require('../services/cacheService');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const awsConfigService = require('../services/awsConfigService');

let sqsClient;
let queueUrl;

(async () => {
    const region = await awsConfigService.getAwsRegion();
    sqsClient = new SQSClient({ region });
    queueUrl = await awsConfigService.getParameter('/n11051337/sqs_queue_url');
})();


const generateCacheKey = (userId, filters, sortBy, sortOrder, limit, offset) => {
    const filterString = JSON.stringify(filters || {});
    const actualLimit = limit !== undefined ? limit : '';
    const actualOffset = offset !== undefined ? offset : '';
    return `gallery:${userId}:${filterString}:${sortBy || ''}:${sortOrder || ''}:${actualLimit}:${actualOffset}`;
};

router.get('/fractal', verifyToken, async (req, res) => {
    const options = {
        width: parseInt(req.query.width) || 1920,
        height: parseInt(req.query.height) || 1080,
        maxIterations: parseInt(req.query.iterations) || 500,
        power: parseFloat(req.query.power) || 2,
        c: {
            real: parseFloat(req.query.real) || 0.285,
            imag: parseFloat(req.query.imag) || 0.01
        },
        scale: parseFloat(req.query.scale) || 1,
        offsetX: parseFloat(req.query.offsetX) || 0,
        offsetY: parseFloat(req.query.offsetY) || 0,
        colourScheme: req.query.color || 'rainbow',
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(options)).digest('hex');
    console.log(`Fractal generation request received for hash ${hash} from user ${req.user.username}`);

    try {
        let row = await Fractal.findFractalByHash(hash);

        if (row) {
            const verifiedFractal = await Fractal.getFractalById(row.id);
            if (!verifiedFractal) {
                row = null;
            } else {
                row = verifiedFractal;
            }
        }

        if (row) {
            const fractalUrl = await s3Service.getPresignedUrl(row.s3_key);
            let galleryEntry = await Gallery.findGalleryEntryByFractalHashAndUserId(req.user.id, row.hash);
            if (!galleryEntry) {
                await History.createHistoryEntry(req.user.id, req.user.username, row.id);
                await Gallery.addToGallery(req.user.id, row.id, row.hash);
                const userCacheKey = generateCacheKey(req.user.id, {}, 'added_at', 'DESC', 5, 0);
                await cacheService.del(userCacheKey);
                const adminCacheKey = `admin:gallery:${JSON.stringify({})}:added_at:DESC:5:0`;
                await cacheService.del(adminCacheKey);
            }
            return res.json({ hash: row.hash, url: fractalUrl, message: 'Fractal already exists.' });
        } else {
            if (!queueUrl) {
                return res.status(500).send('Service is not initialised correctly.');
            }
            const job = {
                options,
                hash,
                user: req.user
            };

            const command = new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: JSON.stringify(job),
            });

            await sqsClient.send(command);

            console.log(`Fractal generation request for hash ${hash} by user ${req.user.username} sent to queue.`);
            res.status(202).json({ hash, message: 'Fractal generation has been queued.' });
        }
    } catch (error) {
        console.error("Error in /fractal route:", error);
        res.status(500).send("Internal server error");
    }
});

router.get('/fractal/status/:hash', verifyToken, async (req, res) => {
    const { hash } = req.params;

    try {
        const row = await Fractal.findFractalByHash(hash);

        if (row) {
            const fractalUrl = await s3Service.getPresignedUrl(row.s3_key);
            res.json({ status: 'complete', url: fractalUrl });
        } else {
            res.json({ status: 'pending' });
        }
    } catch (error) {
        console.error(`Error checking status for hash ${hash}:`, error);
        res.status(500).send("Internal server error");
    }
});

module.exports = router;