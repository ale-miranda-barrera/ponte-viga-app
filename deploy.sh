#!/bin/bash
set -e
KEY="C:/Users/alemi/OneDrive/Desktop/programming/mobil/trainingApp/ponteViga/viga-key.pem"
SERVER="ubuntu@44.214.37.40"
REMOTE="/home/ubuntu/ponte-viga"
LOCAL="C:/Users/alemi/OneDrive/Desktop/programming/mobil/trainingApp/ponteViga"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

echo "Subiendo index.html..."
scp -i "$KEY" $SSH_OPTS "$LOCAL/index.html" "$SERVER:$REMOTE/"

echo "Subiendo sw.js..."
scp -i "$KEY" $SSH_OPTS "$LOCAL/sw.js" "$SERVER:$REMOTE/"

echo "Subiendo server.js..."
scp -i "$KEY" $SSH_OPTS "$LOCAL/server.js" "$SERVER:$REMOTE/"

echo "Reiniciando PM2..."
ssh -i "$KEY" $SSH_OPTS "$SERVER" "cd $REMOTE && pm2 restart all"

echo "Verificando /admin..."
curl -sSf -o /dev/null -w "  /admin → HTTP %{http_code}\n" https://ponteviga.duckdns.org/admin || true
curl -sSf -o /dev/null -w "  /       → HTTP %{http_code}\n" https://ponteviga.duckdns.org/ || true
echo "Listo."
