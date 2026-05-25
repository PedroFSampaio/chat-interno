FROM node:18-alpine

# Install build tools for native modules (like sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Install dependencies including native builds
RUN npm install --production

# Copy application source (ignoring node_modules via .dockerignore)
COPY . .

# Create the data directory if it doesn't exist
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]