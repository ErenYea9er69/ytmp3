# Use official combined Python and Node.js image
FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

# Install system dependencies: ffmpeg for audio transcoding
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp with recommended dependencies
RUN pip install --no-cache-dir "yt-dlp[default]"

# Set working directory
WORKDIR /app

# Copy server dependency definitions
COPY server/package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy server source files
COPY server/ ./

# Expose default port (Render dynamically assigns $PORT)
ENV PORT=10000
EXPOSE 10000

# Start server
CMD ["node", "server.js"]
