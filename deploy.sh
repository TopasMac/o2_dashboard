#!/bin/bash

echo "🔄 Pulling latest changes from main..."
git pull origin main || { echo "❌ Git pull failed"; exit 1; }

echo "🧹 Cleaning old cache manually..."
rm -rf var/cache/*

echo "📦 Installing PHP dependencies (prod only)..."
composer install --no-dev --optimize-autoloader --no-scripts || { echo "❌ Composer install failed"; exit 1; }

echo "🗃️ Running migrations..."
php bin/console doctrine:migrations:migrate --no-interaction --env=prod || { echo "❌ Migrations failed"; exit 1; }

echo "🧹 Clearing and warming up cache..."
php bin/console cache:clear --env=prod || { echo "❌ Cache clear failed"; exit 1; }
php bin/console cache:warmup --env=prod || { echo "❌ Cache warmup failed"; exit 1; }

echo "🧼 Running auto-scripts manually..."
composer run-script --no-dev post-install-cmd || { echo "❌ Auto-scripts failed"; exit 1; }

echo "📦 Installing frontend dependencies..."
cd frontend || exit 1
npm install || { echo "❌ npm install failed"; exit 1; }

echo "🔨 Building frontend..."
npm run build || { echo "❌ Frontend build failed"; exit 1; }
cd ..

echo "🚀 Restarting Nginx..."
sudo systemctl restart nginx || { echo "❌ Nginx restart failed"; exit 1; }

echo "✅ Deployment complete!"