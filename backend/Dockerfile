FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npx", "nodemon", "app.js"]
