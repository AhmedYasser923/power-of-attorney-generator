# Stage 1: build the React client
FROM node:24-alpine AS client-build

WORKDIR /client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Stage 2: production backend
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package*.json ./
COPY backend/scripts/requirements.txt ./scripts/requirements.txt
RUN npm ci --omit=dev
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && \
    python3 -m pip install --no-cache-dir -r ./scripts/requirements.txt && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY backend/ ./
COPY --from=client-build /client/dist ./client-dist

EXPOSE 3000

CMD ["node", "app.js"]
