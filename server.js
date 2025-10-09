
require('dotenv').config();

const express = require('express');
const { router: authRouter, verifyToken } = require('./src/routes/auth');
const fractalRouter = require('./src/routes/fractal');
const historyRouter = require('./src/routes/history');
const galleryRouter = require('./src/routes/gallery');

const s3Service = require('./src/services/s3Service');
const awsConfigService = require('./src/services/awsConfigService');
const cacheService = require('./src/services/cacheService');

const app = express();
let port;

app.use(express.json());
app.use('/fractals', express.static('fractals'));

app.use('/api/auth', authRouter);
app.use('/api', fractalRouter);
app.use('/api', historyRouter);
app.use('/api', galleryRouter);

(async () => {
  try {
    port = await awsConfigService.getParameter('/n11051337/port');
    if (!port) {
      console.error('Failed to retrieve port from Parameter Store. Exiting application.');
      process.exit(1);
    }
    await s3Service.ensureBucketAndTags();
    await cacheService.init();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to initialise application:', error);
    process.exit(1);
  }
})();