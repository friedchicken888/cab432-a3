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
            const now = new Date();
            const lastUpdated = new Date(row.last_updated);
            const created = new Date(row.created_at);
            const historyEntry = await History.getHistoryEntryByFractalIdAndUserId(row.id, req.user.id);
            const historyId = historyEntry ? historyEntry.id : null;

            if (row.status === 'complete') {
                const fractalUrl = await s3Service.getPresignedUrl(row.s3_key);
                let galleryEntry = await Gallery.findGalleryEntryByFractalHashAndUserId(req.user.id, row.hash);
                if (!galleryEntry) {
                    await History.createHistoryEntry(req.user.id, req.user.username, row.id, 'complete');
                    await Gallery.addToGallery(req.user.id, row.id, row.hash);
                    const userCacheKey = generateCacheKey(req.user.id, {}, 'added_at', 'DESC', 5, 0);
                    await cacheService.del(userCacheKey);
                    const adminCacheKey = `admin:gallery:${JSON.stringify({})}:added_at:DESC:5:0`;
                    await cacheService.del(adminCacheKey);
                }
                return res.json({ hash: row.hash, url: fractalUrl, status: row.status, message: 'Fractal already exists.' });
            } else if (row.status === 'too_complex') {
                return res.status(200).json({ hash: row.hash, status: row.status, message: 'Fractal is too complex to generate.' });
            } else if (row.status === 'failed') {
                if (row.retry_count === 1) {
                    return res.status(200).json({ hash: row.hash, status: row.status, message: 'Generation failed. Retrying soon...' });
                } else {
                    return res.status(200).json({ hash: row.hash, status: row.status, message: 'Generation failed after multiple attempts. Please try again later.' });
                
                }
            } else {
                return res.status(200).json({ hash: row.hash, status: row.status, message: `Fractal is ${row.status}. Check status endpoint for updates.` });
            }
        } else {
            if (!queueUrl) {
                return res.status(500).send('Service is not initialised correctly.');
            }

            const { id: newFractalId } = await Fractal.createFractal({ ...options, hash });

            const { id: historyId } = await History.createHistoryEntry(req.user.id, req.user.username, newFractalId);

            const job = {
                options,
                hash,
                user: req.user,
                historyId: historyId
            };

            const command = new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: JSON.stringify(job),
            });

            await sqsClient.send(command);

            console.log(`Fractal generation request for hash ${hash} by user ${req.user.username} sent to queue. History ID: ${historyId}`);
            res.status(202).json({ hash, status: 'pending', message: 'Fractal generation has been queued.' });
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
            if (row.status === 'complete') {
                const fractalUrl = await s3Service.getPresignedUrl(row.s3_key);
                res.json({ status: row.status, url: fractalUrl });
            } else {
                const now = new Date();
                const lastUpdated = new Date(row.last_updated);
                const created = new Date(row.created_at);
                const historyEntry = await History.getHistoryEntryByFractalIdAndUserId(row.id, req.user.id);
                const historyId = historyEntry ? historyEntry.id : null;

                if (row.status === 'pending') {
                    if ((now.getTime() - created.getTime()) > 10 * 1000) { // 10 seconds
                        await Fractal.updateFractalStatus(hash, 'failed', row.retry_count + 1);
                        if (historyId) {
                            console.log(`Attempting to update history status for historyId: ${historyId} to 'failed'`);
                            await History.updateHistoryStatus(historyId, 'failed');
                        } else {
                            console.log(`History entry not found for fractal ID ${row.id} and user ID ${req.user.id}. Cannot update history status.`);
                        }
                        return res.json({ status: 'failed', message: 'Fractal generation stuck in queue. Please try again later.' });
                    } else {
                        return res.json({ status: row.status, message: 'Fractal generation has been queued.' });
                    }
                } else if (row.status === 'generating') {
                    if ((now.getTime() - lastUpdated.getTime()) > 3 * 60 * 1000) { // 3 minutes
                        await Fractal.updateFractalStatus(hash, 'failed', row.retry_count + 1);
                        if (historyId) {
                            await History.updateHistoryStatus(historyId, 'failed');
                        }
                        if (row.retry_count + 1 === 1) {
                            return res.json({ status: 'failed', message: 'Worker crashed. Retrying soon...' });
                        } else {
                            return res.json({ status: 'failed', message: 'Worker crashed after multiple attempts. Please try again later.' });
                        }
                    } else {
                        return res.json({ status: row.status, message: 'Fractal is currently being generated.' });
                    }
                } else if (row.status === 'failed') {
                    if (row.retry_count === 1) {
                        return res.json({ status: row.status, message: 'Generation failed. Retrying soon...' });
                    } else {
                        return res.json({ status: row.status, message: 'Generation failed after multiple attempts. Please try again later.' });
                    }
                } else if (row.status === 'too_complex') {
                    return res.json({ status: row.status, message: 'Fractal is too complex to generate.' });
                } else {
                    res.json({ status: row.status });
                }
            }
        } else {
            res.json({ status: 'not_found' });
        }
    } catch (error) {
        console.error(`Error checking status for hash ${hash}:`, error);
        res.status(500).send("Internal server error");
    }
});

module.exports = router;