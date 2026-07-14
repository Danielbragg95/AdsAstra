FROM node:22-slim
WORKDIR /app

# install deps with layer caching
COPY package*.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# build the dashboard (engine is transpiled into it)
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    SIGNALWORK_DB=/data/signalwork.db \
    SIGNALWORK_ASSETS=/data/assets
VOLUME /data
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "web"]
