#!/bin/bash
# Deploy to production server

SERVER="root@172.238.175.82"
REMOTE_DIR="/var/www/famflix"

echo "🚀 Deploying to production server..."

# Build locally
echo "🔨 Building project..."
npm run build

# Sync code to production
echo "📦 Syncing files..."
rsync -avz --delete \
           --exclude='node_modules' \
           --exclude='.git' \
           --exclude='logs' \
           --exclude='uploads' \
           --exclude='.env' \
           ./dist "$SERVER:$REMOTE_DIR/"

rsync -avz package.json package-lock.json "$SERVER:$REMOTE_DIR/"
rsync -avz server/routes/templateVideos.ts "$SERVER:$REMOTE_DIR/server/routes/" # Backup source just in case

echo "📝 Installing dependencies and restarting services..."
ssh "$SERVER" << 'ENDSSH'
cd /var/www/famflix

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

# Restart PM2
echo "Restarting PM2..."
pm2 restart famflix

echo "✅ Deployment complete!"
ENDSSH

echo "🎉 Production server updated successfully!"
echo "Visit: https://fam-flix.com"
