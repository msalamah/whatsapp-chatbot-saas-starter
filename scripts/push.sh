#!/usr/bin/env bash
set -euo pipefail
REPO_URL=${1:-https://github.com/USERNAME/whatsapp-chatbot-saas-starter.git}

git init
git add .
git commit -m "init: full WhatsApp SaaS starter (multi-tenant + calendar)"
git branch -M main
git remote add origin "$REPO_URL"
git push -u origin main
