const express = require('express');
const router = express.Router();
const { verifyToken } = require('./auth.js');
const Gallery = require('../models/gallery.model.js');
const Fractal = require('../models/fractal.model.js');
const cacheService = require('../services/cacheService');
const s3Service = require('../services/s3Service');

const generateCacheKey = (userId, filters, sortBy, sortOrder, limit, offset) => {
    const filterString = JSON.stringify(filters || {});
    const actualLimit = limit !== undefined ? limit : '';
    const actualOffset = offset !== undefined ? offset : '';
    return `gallery:${userId}:${filterString}:${sortBy || ''}:${sortOrder || ''}:${actualLimit}:${actualOffset}`;
};

router.get('/gallery', verifyToken, async (req, res) => {
    const userId = req.user.id;
    const { limit = 5, offset = 0, sortBy = 'added_at', sortOrder = 'DESC', ...filters } = req.query;

    const cacheKey = generateCacheKey(userId, filters, sortBy, sortOrder, limit, offset);

    try {
        let cachedData = await cacheService.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const { rows, totalCount } = await Gallery.getGalleryForUser(
            userId,
            filters,
            sortBy,
            sortOrder,
            parseInt(limit),
            parseInt(offset)
        );

        const galleryWithUrls = await Promise.all(rows.map(async (entry) => {
            if (entry.s3_key) {
                entry.url = await s3Service.getPresignedUrl(entry.s3_key);
            }
            return entry;
        }));

        const responseData = {
            data: galleryWithUrls,
            totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
        };

        await cacheService.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error('Error in /gallery route:', error);
        res.status(500).send('Internal server error');
    }
});

router.delete('/gallery/:id', verifyToken, async (req, res) => {
    const galleryId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    try {
        const row = await Gallery.getGalleryEntry(galleryId, userId, isAdmin);
        if (!row) {
            if (!isAdmin) {
                return res.status(404).send("Gallery entry not found or you don't have permission to delete it.");
            } else {
                return res.status(404).send("Gallery entry not found.");
            }
        }

        const fractalId = row.fractal_id;
        const fractalHash = row.fractal_hash;

        await Gallery.deleteGalleryEntry(galleryId, userId, isAdmin);

        // Invalidate the default cache key for the user's gallery
        const userCacheKey = generateCacheKey(userId, {}, 'added_at', 'DESC', 5, 0);
        await cacheService.del(userCacheKey);

        // Invalidate the default cache key for the admin gallery
        const adminCacheKey = `admin:gallery:${JSON.stringify({})}:added_at:DESC:5:0`;
        await cacheService.del(adminCacheKey);

        const countRow = await Gallery.countGalleryByFractalHash(fractalHash);

        if (parseInt(countRow.count) === 0) {
            const fractalRow = await Fractal.getFractalS3Key(fractalId);
            if (fractalRow && fractalRow.s3_key) {
                const s3KeyToDelete = fractalRow.s3_key;
                await s3Service.deleteFile(s3KeyToDelete);
                await Fractal.deleteFractal(fractalId);
                res.send({ message: "Gallery entry and associated fractal deleted successfully" });
            } else {
                await Fractal.deleteFractal(fractalId);
                res.send({ message: "Gallery entry and associated fractal deleted successfully" });
            }
        } else {
            res.send({ message: "Gallery entry deleted successfully" });
        }
    } catch (error) {
        console.error(`Error deleting gallery entry ${galleryId}:`, error);
        res.status(500).send("Internal server error");
    }
});

router.get('/admin/gallery', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send('Access denied. Admin role required.');
    }

    const { limit = 5, offset = 0, sortBy = 'added_at', sortOrder = 'DESC', ...filters } = req.query;

    const cacheKey = `admin:gallery:${JSON.stringify(filters)}:${sortBy}:${sortOrder}:${limit}:${offset}`;

    try {
        let cachedData = await cacheService.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const { rows, totalCount } = await Gallery.getAllGallery(
            filters,
            sortBy,
            sortOrder,
            parseInt(limit),
            parseInt(offset)
        );

        const galleryWithUrls = await Promise.all(rows.map(async (entry) => {
            if (entry.s3_key) {
                entry.url = await s3Service.getPresignedUrl(entry.s3_key);
            }
            return entry;
        }));

        const responseData = {
            data: galleryWithUrls,
            totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            filters,
            sortBy,
            sortOrder,
        };

        await cacheService.set(cacheKey, responseData);
        res.json(responseData);

    } catch (error) {
        console.error('Error in /admin/gallery route:', error);
        res.status(500).send('Internal server error');
    }
});

module.exports = router;
