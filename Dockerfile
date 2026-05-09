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
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=client-build /client/dist ./client-dist

EXPOSE 3000

CMD ["node", "app.js"]
