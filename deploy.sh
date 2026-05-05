#!/bin/bash
KEY="C:/Users/alemi/OneDrive/Desktop/programming/mobil/trainingApp/ponteViga/viga-key.pem"
SERVER="ubuntu@44.214.37.40"
REMOTE="/home/ubuntu/ponte-viga"
LOCAL="C:/Users/alemi/OneDrive/Desktop/programming/mobil/trainingApp/ponteViga"

echo "Subiendo index.html..."
scp -i "$KEY" "$LOCAL/index.html" "$SERVER:$REMOTE/"

echo "Subiendo sw.js..."
scp -i "$KEY" "$LOCAL/sw.js" "$SERVER:$REMOTE/"

echo "Listo. Reinicia el servidor en la SSH con: pm2 restart all"
