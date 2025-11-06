FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Create data directory mount point
RUN mkdir -p /app/data

# Expose port
EXPOSE 5178

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5178

# Start the server
CMD ["node", "server.js"]

