#!/bin/bash
set -e
cd /var/www/html

find . -maxdepth 2 -name "*.bak*" -delete 2>/dev/null || true

git add -A
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M') - $1" || echo "Nada para commitar"
git push origin main || git push origin HEAD
echo "Deploy e push concluídos"
