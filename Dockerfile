FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev pango-dev jpeg-dev freetype-dev fontconfig-dev harfbuzz-dev pixman-dev giflib-dev

RUN npm install --omit=dev

COPY src/workers/fractal.worker.js src/workers/
COPY src/services/fractalGenerationService.js src/services/
COPY src/services/s3Service.js src/services/
COPY src/services/cacheService.js src/services/
COPY src/services/awsConfigService.js src/services/
COPY src/models/fractal.model.js src/models/
COPY src/models/history.model.js src/models/
COPY src/models/gallery.model.js src/models/
COPY src/database.js src/

CMD ["node", "src/workers/fractal.worker.js"]