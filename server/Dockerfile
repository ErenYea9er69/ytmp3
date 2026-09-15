FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "yt-dlp[default]"

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . ./

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
