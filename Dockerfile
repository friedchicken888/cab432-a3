FROM node:22-bullseye

WORKDIR /app

COPY package*.json ./

RUN apt-get update && \
    apt-get install -y \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev && \
    npm install

COPY . .

CMD ["node", "src/workers/fractal.worker.js"]