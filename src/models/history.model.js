const db = require('../database.js');

exports.getHistoryForUser = (userId) => {
    return new Promise((resolve, reject) => {
        const sql = `
        SELECT h.id, h.username, f.hash, f.width, f.height, f.iterations, f.power, f.c_real, f.c_imag, f.scale, f."offsetX", f."offsetY", f."colourScheme", h.generated_at, (f.id IS NULL) AS fractal_deleted
        FROM history h
        LEFT JOIN fractals f ON h.fractal_id = f.id
        WHERE h.user_id = $1
        ORDER BY h.generated_at DESC
    `;
        db.query(sql, [userId], (err, result) => {
            if (err) return reject(err);
            resolve(result.rows);
        });
    });
};

exports.createHistoryEntry = (userId, username, fractalId) => {
    return new Promise((resolve, reject) => {
        const sql = "INSERT INTO history (user_id, username, fractal_id) VALUES ($1, $2, $3) RETURNING id";
        db.query(sql, [userId, username, fractalId], (err, result) => {
            if (err) return reject(err);
            resolve({ id: result.rows[0].id });
        });
    });
};

exports.getHistoryEntry = (id, userId) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT fractal_id FROM history WHERE id = $1 AND user_id = $2";
        db.query(sql, [id, userId], (err, result) => {
            if (err) return reject(err);
            resolve(result.rows[0]);
        });
    });
};

exports.countHistoryByFractalId = (fractalId) => {
    return new Promise((resolve, reject) => {
        const sql = "SELECT COUNT(*) as count FROM history WHERE fractal_id = $1";
        db.query(sql, [fractalId], (err, result) => {
            if (err) return reject(err);
            resolve(parseInt(result.rows[0].count));
        });
    });
};

exports.getAllHistory = (filters, sortBy, sortOrder, limit, offset) => {

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

        const validSortColumns = ['id', 'hash', 'width', 'height', 'iterations', 'power', 'c_real', 'c_imag', 'scale', 'offsetX', 'offsetY', 'colourScheme', 'generated_at', 'user_id', 'username'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'generated_at';
        const order = (sortOrder && sortOrder.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

        const countSql = `SELECT COUNT(*) as "totalCount" FROM history h LEFT JOIN fractals f ON h.fractal_id = f.id ${whereSql}`;

        db.query(countSql, params, (err, countResult) => {
            
            if (err) {
                return reject(err);
            }
            const totalCount = parseInt(countResult.rows[0].totalCount);

            const dataSql = `
                SELECT h.id, h.user_id, h.username, f.hash, f.width, f.height, f.iterations, f.power, f.c_real, f.c_imag, f.scale, f."offsetX", f."offsetY", f."colourScheme", h.generated_at, f.s3_key, (f.id IS NULL) AS fractal_deleted
                FROM history h
                LEFT JOIN fractals f ON h.fractal_id = f.id
                ${whereSql}
                ORDER BY ${sortColumn} ${order}
                LIMIT $${paramIndex++} OFFSET $${paramIndex++}
            `;
            const dataParams = [...params, limit, offset];
            db.query(dataSql, dataParams, (err, dataResult) => {
                if (err) {
                    return reject(err);
                }
                resolve({ rows: dataResult.rows, totalCount: totalCount });
            });
        });
    });
};