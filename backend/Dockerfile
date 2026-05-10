FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && \
    python3 -m pip install --no-cache-dir zxing-cpp opencv-python-headless && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 3000

CMD ["npx", "nodemon", "app.js"]
