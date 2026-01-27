
# Unified Deployment Script for DeskShare

# 1. Frontend: Add, Commit, Push to Origin
Write-Host "🚀 Deploying Frontend..." -ForegroundColor Cyan
git add .
git commit -m "DEPLOY: Unified Update (Auto)"
git push origin main --force

# 2. Backend: Push to Railway (backend_origin & production)
Write-Host "🚀 Deploying to Backend (Railway)..." -ForegroundColor Cyan
git add .
git add -f agent/dist-webrtc-alpha/DeskShareWebRTC-win32-x64/resources/app/*.js
git add -f agent/dist-webrtc-alpha/DeskShareWebRTC-win32-x64/resources/app/*.html
# ZOMBIE KILLER (v23)
Stop-Process -Name "DeskShareWebRTC", "electron" -Force -ErrorAction SilentlyContinue
git commit -m "DEPLOY: Engine X NUCLEAR v23 (INTERNAL INFRASTRUCTURE RESTORED)"
git push backend_origin main --force
git push production main --force

Write-Host "✅ Deployment Complete!" -ForegroundColor Green
