
# Unified Deployment Script for DeskShare

# 1. Frontend: Add, Commit, Push to Origin
Write-Host "🚀 Deploying Frontend..." -ForegroundColor Cyan
git add .
git commit -m "DEPLOY: Unified Update (Auto)"
git push origin main --force

# 2. Backend: Push to Railway (backend_origin & production)
Write-Host "🚀 Deploying to Backend (Railway)..." -ForegroundColor Cyan
git add .
git add -f agent/dist-webrtc-alpha/DeskShareWebRTC-win32-x64/resources/app/main.js
git commit -m "DEPLOY: Unified Update + Absolute Fluidity (v16.0)"
git push backend_origin main --force
git push production main --force

Write-Host "✅ Deployment Complete!" -ForegroundColor Green
