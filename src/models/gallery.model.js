const db = require('../database.js');

exports.addToGallery = (userId, fractalId, fractalHash) => {
    return new Promise((resolve, reject) => {
        const insertSql = "INSERT INTO gallery (user_id, fractal_id, fractal_hash) VALUES ($1, $2, $3) ON CONFLICT (user_id, fractal_hash) DO NOTHING";
        db.query(insertSql, [userId, fractalId, fractalHash], (err) => {
            if (err) return reject(err);
            const selectSql = "SELECT id FROM gallery WHERE user_id = $1 AND fractal_hash = $2";
            db.query(selectSql, [userId, fractalHash], (err, result) => {
                if (err) return reject(err);
                resolve(result.rows[0].id);
            });
        });
    });
};

exports.getGalleryForUser = (userId, filters, sortBy, sortOrder, limit, offset) => {
    return new Promise((resolve, reject) => {
        let whereClauses = [`g.user_id = $1`];
        let params = [userId];
        let paramIndex = 2;

        if (filters.colourScheme) {
            whereClauses.push(`f."colourScheme" = $${paramIndex++}`);
            params.push(filters.colourScheme);
        }
        if (filters.power) {
            whereClauses.push(`f.power = $${paramIndex++}`);
            params.push(filters.power);
        }
        if (filters.iterations) {
            whereClauses.push(`f.iterations = $${paramIndex++}`);
            params.push(filters.iterations);
        }
        if (filters.width) {
            whereClauses.push(`f.width = $${paramIndex++}`);
            params.push(filters.width);
        }
        if (filters.height) {
            whereClauses.push(`f.height = $${paramIndex++}`);
            params.push(filters.height);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ` + whereClauses.join(` AND `) : ``;

        const validSortColumns = ['id', 'hash', 'width', 'height', 'iterations', 'power', 'c_real', 'c_imag', 'scale', 'offsetX', 'offsetY', 'colourScheme', 'added_at'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'added_at';
        const order = (sortOrder && sortOrder.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

        const countSql = `SELECT COUNT(*) as "totalCount" FROM gallery g JOIN fractals f ON g.fractal_id = f.id ${whereSql}`;
        db.query(countSql, params, (err, countResult) => {
            if (err) return reject(err);
            const totalCount = parseInt(countResult.rows[0].totalCount);

            const dataSql = `
                SELECT g.id, f.hash, f.width, f.height, f.iterations, f.power, f.c_real, f.c_imag, f.scale, f."offsetX", f."offsetY", f."colourScheme", g.added_at, g.fractal_hash, f.s3_key
                FROM gallery g
                JOIN fractals f ON g.fractal_id = f.id
                ${whereSql}
                ORDER BY ${sortColumn} ${order}
                LIMIT $${paramIndex++} OFFSET $${paramIndex++}
            `;
            db.query(dataSql, [...params, limit, offset], (err, dataResult) => {
                if (err) return reject(err);
                resolve({ rows: dataResult.rows, totalCount: totalCount });
            });
        });
    });
};

exports.getGalleryEntry = (id, userId, isAdmin) => {
    return new Promise((resolve, reject) => {
        let sql;
        let params;
        if (isAdmin) {
            sql = "SELECT fractal_id, fractal_hash FROM gallery WHERE id = $1";
            params = [id];
        } else {
            sql = "SELECT fractal_id, fractal_hash FROM gallery WHERE id = $1 AND user_id = $2";
            params = [id, userId];
        }
        db.query(sql, params, (err, result) => {
            if (err) return reject(err);
            resolve(result.rows[0]);
        });
    });
};

exports.deleteGalleryEntry = (id, userId, isAdmin) => {
    return new Promise((resolve, reject) => {
        let sql;
        let params;
        if (isAdmin) {
            sql = "DELETE FROM gallery WHERE id = $1";
            params = [id];
        } else {
            sql = "DELETE FROM gallery WHERE id = $1 AND user_id = $2";
            params = [id, userId];
        }
        db.query(sql, params, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
};

exports.countGalleryByFractalHash = (fractalHash) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT COUNT(*) as count FROM gallery WHERE fractal_hash = $1";
        db.query(sql, [fractalHash], (err, result) => {
            if (err) return reject(err);
            resolve(result.rows[0]);
        });
    });
};

exports.findGalleryEntryByFractalHashAndUserId = (userId, fractalHash) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT id FROM gallery WHERE user_id = $1 AND fractal_hash = $2";
        db.query(sql, [userId, fractalHash], (err, result) => {
            if (err) return reject(err);
            resolve(result.rows[0]);
        });
    });
};

exports.getAllGallery = (filters, sortBy, sortOrder, limit, offset) => {
    return new Promise((resolve, reject) => {
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        if (filters.colourScheme) {
            whereClauses.push(`f."colourScheme" = $${paramIndex++}`);
            params.push(filters.colourScheme);
        }
        if (filters.power) {
            whereClauses.push(`f.power = $${paramIndex++}`);
            params.push(filters.power);
        }
        if (filters.iterations) {
            whereClauses.push(`f.iterations = $${paramIndex++}`);
            params.push(filters.iterations);
        }
        if (filters.width) {
            whereClauses.push(`f.width = $${paramIndex++}`);
            params.push(filters.width);
        }
        if (filters.height) {
            whereClauses.push(`f.height = $${paramIndex++}`);
            params.push(filters.height);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ` + whereClauses.join(` AND `) : ``;

        const validSortColumns = ['id', 'user_id', 'hash', 'width', 'height', 'iterations', 'power', 'c_real', 'c_imag', 'scale', 'offsetX', 'offsetY', 'colourScheme', 'added_at'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'added_at';
        const order = (sortOrder && sortOrder.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

        const countSql = `SELECT COUNT(*) as "totalCount" FROM gallery g JOIN fractals f ON g.fractal_id = f.id ${whereSql}`;
        db.query(countSql, params, (err, countResult) => {
            if (err) return reject(err);
            const totalCount = parseInt(countResult.rows[0].totalCount);

            const dataSql = `
                SELECT g.id, g.user_id, (SELECT DISTINCT h_sub.username FROM history h_sub WHERE h_sub.user_id = g.user_id LIMIT 1) AS username, f.hash, f.width, f.height, f.iterations, f.power, f.c_real, f.c_imag, f.scale, f."offsetX", f."offsetY", f."colourScheme", g.added_at, g.fractal_hash, f.s3_key
                FROM gallery g
                JOIN fractals f ON g.fractal_id = f.id
                ${whereSql}
                ORDER BY ${sortColumn} ${order}
                LIMIT $${paramIndex++} OFFSET $${paramIndex++}
            `;
            db.query(dataSql, [...params, limit, offset], (err, dataResult) => {
                if (err) return reject(err);
                resolve({ rows: dataResult.rows, totalCount: totalCount });
            });
        });
    });
};