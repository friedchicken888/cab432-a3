const Memcached = require("memcached");
const util = require("node:util");
const { getParameter } = require("./awsConfigService");

let memcachedClient = null;
let memcachedAddress = null;

const initCache = async () => {
    if (memcachedClient) return; // Already initialized

    memcachedAddress = await getParameter('/n11051337/memcached_address');

    if (!memcachedAddress) {
        console.error("MEMCACHED_ADDRESS not found in Parameter Store. Caching will be disabled.");
        return;
    }

    memcachedClient = new Memcached(memcachedAddress);

    memcachedClient.on("failure", (details) => {
        console.error("Memcached server failure:", details);
    });
    memcachedClient.on("reconnecting", (details) => {

    });
    memcachedClient.on("issue", (details) => {
        console.error("Memcached issue:", details);
    });
    memcachedClient.on("remove", (details) => {

    });

    memcachedClient.aGet = util.promisify(memcachedClient.get);
    memcachedClient.aSet = util.promisify(memcachedClient.set);
    memcachedClient.aDel = util.promisify(memcachedClient.del);
};

const cacheService = {
    init: initCache,
    get: async (key) => {
        if (!memcachedClient) return null;
        try {
            const value = await memcachedClient.aGet(key);
            if (value) {

            } else {

            }
            return value;
        } catch (error) {
            console.error("Error getting from Memcached:", error);
            return null;
        }
    },

    set: async (key, value, ttl = 60) => {
        if (!memcachedClient) return;
        try {
            await memcachedClient.aSet(key, value, ttl);

        } catch (error) {
            console.error("Error setting to Memcached:", error);
        }
    },

    del: async (key) => {
        if (!memcachedClient) return;
        try {
            await memcachedClient.aDel(key);

        } catch (error) {
            console.error("Error deleting from Memcached:", error);
        }
    },

    client: memcachedClient
};

module.exports = cacheService;
