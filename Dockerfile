FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache python3 make g++

RUN npm install --omit=dev

COPY . .

CMD ["node", "src/workers/fractal.worker.js"]