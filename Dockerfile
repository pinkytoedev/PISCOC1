FROM node:20-slim

# Install PostgreSQL client for database operations
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Create necessary directories
RUN mkdir -p uploads temp certs uploads/instagram

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]