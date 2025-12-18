
# Unified Deployment Script for DeskShare

# 1. Frontend: Add, Commit, Push to Origin
Write-Host "🚀 Deploying Frontend..." -ForegroundColor Cyan
git add .
git commit -m "DEPLOY: Unified Update (Auto)"
git push origin main --force

# 2. Backend: Push to Railway (backend_origin)
Write-Host "🚀 Deploying to Backend (Railway)..." -ForegroundColor Cyan
git add .
git commit -m "DEPLOY: Unified Update (Auto)"
git push backend_origin main --force

Write-Host "✅ Deployment Complete!" -ForegroundColor Green
