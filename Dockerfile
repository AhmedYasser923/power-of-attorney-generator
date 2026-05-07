# Use Playwright image as the base
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Set the directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app code
COPY . .

# Expose the port your app runs on
EXPOSE 8080

# Start the application
CMD ["node", "app.js"]