FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev && npm install typescript

# Copy source
COPY . .

# Build app
RUN npx tsc

# Create cache directory
RUN mkdir -p /app/cache

EXPOSE 3000

CMD ["node", "dist/index.js"]
