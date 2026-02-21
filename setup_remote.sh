#!/bin/bash
set -e

# Update and install dependencies
apt-get update
apt-get install -y curl ffmpeg

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Setup app directory
mkdir -p /var/www/voxtree
cd /var/www/voxtree

# Extract code
# Assuming deploy.tar.gz is in /root/
tar -xzf /root/deploy.tar.gz -C /var/www/voxtree

# Install dependencies
npm install

# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name voxtree --spa
pm2 save
pm2 startup
