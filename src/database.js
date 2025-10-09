const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { getAwsRegion } = require("./services/awsConfigService");

const secret_name = "n11051337-A2-DB";

let dbSecrets = {};

async function getDbSecrets() {
    const region = await getAwsRegion();
    const client = new SecretsManagerClient({ region: region });
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secret_name
            })
        );
        if (response.SecretString) {
            dbSecrets = JSON.parse(response.SecretString);
        }
    } catch (error) {
        console.error("Error retrieving database secrets:", error);
        process.exit(1);
    }
}

async function initialiseDatabase() {
    try {
        const client = await pool.connect();

        const fractalsTable = `
        CREATE TABLE IF NOT EXISTS fractals (
            id SERIAL PRIMARY KEY,
            hash TEXT UNIQUE NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            iterations INTEGER NOT NULL,
            power REAL NOT NULL,
            c_real REAL NOT NULL,
            c_imag REAL NOT NULL,
            scale REAL NOT NULL,
            "offsetX" REAL NOT NULL,
            "offsetY" REAL NOT NULL,
            "colourScheme" TEXT NOT NULL,
            s3_key TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`;

        await client.query(fractalsTable);
        const historyTable = `
        CREATE TABLE IF NOT EXISTS history (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            fractal_id INTEGER,
            generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fractal_id) REFERENCES fractals (id) ON DELETE SET NULL
        )`;

        await client.query(historyTable);

        const galleryTable = `
        CREATE TABLE IF NOT EXISTS gallery (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            fractal_id INTEGER NOT NULL,
            fractal_hash TEXT NOT NULL,
            added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, fractal_hash),
            FOREIGN KEY (fractal_id) REFERENCES fractals (id) ON DELETE CASCADE
        )`;

        await client.query(galleryTable);



        client.release();
    } catch (err) {
        console.error('Error initialising database:', err.message);
        process.exit(-1);
    }
}



let pool;
let initialised;
let _resolveDbInitialised;

async function initDbAndPool() {
    await getDbSecrets();

    pool = new Pool({
        host: dbSecrets.host,
        user: dbSecrets.username,
        password: dbSecrets.password,
        database: dbSecrets.dbname,
        port: dbSecrets.port,
        ssl: {
            rejectUnauthorized: false
        }
    });

    pool.on('error', (err) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
    });

    await initialiseDatabase();

    if (_resolveDbInitialised) _resolveDbInitialised();
}

initialised = new Promise(resolve => {
    _resolveDbInitialised = resolve;
});

initDbAndPool();

module.exports = {
    query: async (text, params, callback) => {
        await initialised;
        return pool.query(text, params, callback);
    },
    getClient: async () => {
        await initialised;
        return pool.connect();
    },
    initialised: initialised
};