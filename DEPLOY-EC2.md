# Despliegue en EC2 — Ponte Viga App
## Todo con CloudFormation — sin pasos manuales en el servidor

La infraestructura completa se crea con **un solo comando** de CloudFormation.
Los deploys y actualizaciones se hacen con otro comando, sin SSH.

---

## Arquitectura

```
Tu máquina
    │
    │  node build.js  →  index.html (app completa)
    │  aws s3 sync    →  sube archivos al bucket S3
    │  aws ssm send-command  →  EC2 jala los archivos y reinicia PM2
    │
    ▼
S3 Bucket (ponte-viga-deploy-dev-ACCOUNTID)
    └── app/
        ├── index.html
        ├── server.js
        ├── sw.js
        ├── package.json
        └── ec2-config.json
    │
    ▼ (SSM Document descarga desde S3)
EC2 — Ubuntu 24.04 — t3.micro
    └── /home/ubuntu/ponte-viga/
        ├── index.html       ← la app completa
        ├── server.js        ← Express backend (puerto 3000)
        ├── sw.js            ← Service Worker
        ├── package.json
        ├── ec2-config.json  ← señala modo EC2
        ├── node_modules/
        └── data/
            ├── sessions.json
            ├── measures.json
            ├── profile.json
            └── routines.json
    │
    ▼
Nginx (puerto 80/443)  →  proxy a localhost:3000
    │
    ▼
iPhone → HTTPS → App PWA
```

**Recursos que CloudFormation crea automáticamente:**

| Recurso | Para qué sirve |
|---------|---------------|
| S3 Bucket | Almacena los archivos de la app para deploy |
| IAM Role + Profile | Permisos del EC2 para leer de S3 y usar SSM |
| Security Group | Abre puertos 22, 80, 443 |
| Elastic IP | IP fija que no cambia al reiniciar |
| EC2 Instance (Ubuntu 24.04) | El servidor con Node.js + PM2 + Nginx instalados |
| SSM Document | Comando que despliega la app desde S3 al servidor |

---

## Pre-requisitos

```bash
# AWS CLI instalado y configurado (ver AWS-SETUP.md)
aws --version
aws sts get-caller-identity   # debe mostrar tu cuenta

# Node.js instalado en tu máquina (para el build)
node --version   # necesitas v18 o superior

# Key Pair creado en AWS Console
# Si ya tienes viga-key.pem → el nombre es "viga-key"
viga-key
# Si no tienes uno: AWS Console → EC2 → Key Pairs → Create key pair
```

---

## Paso 1 — Build de la app

```bash
# Desde la carpeta del proyecto (ponte viga/)
node build.js
```

Esto genera el `index.html` con toda la app compilada. Verifica que el archivo se actualizó.

---

## Paso 2 — Desplegar el stack de infraestructura (primera vez)

```bash
aws cloudformation deploy \
  --template-file infrastructure-ec2.yaml \
  --stack-name ponte-viga-ec2 \
  --parameter-overrides \
      AppName=ponte-viga \
      Environment=dev \
      KeyPairName=viga-key \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

> CloudFormation tarda ~3-5 minutos en crear todos los recursos.
> Puedes seguir el progreso en: AWS Console → CloudFormation → Stacks → ponte-viga-ec2 → Events

### Ver los recursos creados

```bash
aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs' \
  --output table
```

Anota los valores de `PublicIP`, `InstanceId` y `DeploymentBucketName` — los usarás en los siguientes pasos.

---

## Paso 3 — Subir los archivos de la app al bucket S3

Obtén el nombre del bucket:
```bash
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' \
  --output text)

echo "Bucket: $BUCKET"
```

Sube los archivos:
```bash
aws s3 sync . s3://$BUCKET/app/ \
  --exclude "*" \
  --include "index.html" \
  --include "server.js" \
  --include "sw.js" \
  --include "package.json" \
  --include "ec2-config.json"
```

Verifica que subieron:
```bash
aws s3 ls s3://$BUCKET/app/
```

Deberías ver los 5 archivos listados.

---

## Paso 4 — Esperar a que EC2 termine su bootstrap

El servidor necesita ~3-4 minutos para instalar Node.js, PM2 y Nginx.
Puedes verificar cuando está listo:

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

# Ver el log del bootstrap (necesitas SSM conectado)
aws ssm start-session --target $INSTANCE_ID
# Una vez dentro del servidor:
# tail -f /var/log/ponte-viga-setup.log
```

O simplemente espera 4-5 minutos después del Paso 2.

---

## Paso 5 — Desplegar la app con SSM (sin SSH)

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' \
  --output text)

aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "ponte-viga-deploy-dev" \
  --parameters "BucketName=$BUCKET" \
  --comment "Deploy inicial" \
  --region us-east-1
```

Este comando le dice al EC2: "descarga los archivos de S3 y arranca el servidor".

### Verificar que el comando se ejecutó bien

```bash
# El send-command devuelve un CommandId, úsalo aquí:
aws ssm list-commands \
  --instance-id $INSTANCE_ID \
  --query 'Commands[0].[Status,CommandId]' \
  --output table

# Ver el output detallado del comando (reemplaza COMMAND_ID):
aws ssm get-command-invocation \
  --command-id COMMAND_ID \
  --instance-id $INSTANCE_ID \
  --query '[Status,StandardOutputContent,StandardErrorContent]' \
  --output text
```

---

## Paso 6 — Verificar que la app está corriendo

```bash
IP=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' \
  --output text)

echo "App URL: http://$IP"

# Probar que responde
curl -I http://$IP
# Debe devolver: HTTP/1.1 200 OK
```

Abre `http://TU_IP` en Safari → Compartir → **Agregar a pantalla de inicio** → lista.

---

## Actualizar la app (flujo normal de desarrollo)

Cada vez que cambias código y quieres actualizar el servidor, son 3 comandos:

```bash
# 1. Compilar los cambios
node build.js

# 2. Subir al bucket S3
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' \
  --output text)

aws s3 sync . s3://$BUCKET/app/ \
  --exclude "*" \
  --include "index.html" \
  --include "server.js" \
  --include "sw.js" \
  --include "package.json" \
  --include "ec2-config.json"

# 3. Decirle al EC2 que actualice
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "ponte-viga-deploy-dev" \
  --comment "Actualización" \
  --region us-east-1
```

> Los datos en `data/*.json` dentro del servidor **no se tocan** — solo se reemplaza el código.

---

## Script de deploy en un solo comando

Guarda esto como `deploy.sh` en la carpeta del proyecto:

```bash
#!/bin/bash
# deploy.sh — Build + Upload a S3 + Deploy a EC2
set -e

STACK="ponte-viga-ec2"
REGION="us-east-1"

echo "=== 1. Build de la app ==="
node build.js

echo "=== 2. Obtener bucket y instance ID ==="
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name $STACK \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' \
  --output text --region $REGION)

INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text --region $REGION)

echo "  Bucket: $BUCKET"
echo "  Instance: $INSTANCE_ID"

echo "=== 3. Subir archivos a S3 ==="
aws s3 sync . s3://$BUCKET/app/ \
  --exclude "*" \
  --include "index.html" \
  --include "server.js" \
  --include "sw.js" \
  --include "package.json" \
  --include "ec2-config.json" \
  --region $REGION

echo "=== 4. Deploy al EC2 vía SSM ==="
COMMAND_ID=$(aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "ponte-viga-deploy-dev" \
  --comment "Deploy $(date)" \
  --query 'Command.CommandId' \
  --output text \
  --region $REGION)

echo "  Command ID: $COMMAND_ID"
echo "  Esperando resultado..."

# Esperar a que termine (máx 2 minutos)
for i in $(seq 1 24); do
  sleep 5
  STATUS=$(aws ssm get-command-invocation \
    --command-id $COMMAND_ID \
    --instance-id $INSTANCE_ID \
    --query 'Status' --output text --region $REGION 2>/dev/null || echo "Pending")
  echo "  Estado: $STATUS"
  if [ "$STATUS" = "Success" ] || [ "$STATUS" = "Failed" ]; then
    break
  fi
done

if [ "$STATUS" = "Success" ]; then
  IP=$(aws cloudformation describe-stacks \
    --stack-name $STACK \
    --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' \
    --output text --region $REGION)
  echo ""
  echo "✓ Deploy exitoso"
  echo "✓ App disponible en: http://$IP"
else
  echo "✗ Deploy falló. Ver logs:"
  aws ssm get-command-invocation \
    --command-id $COMMAND_ID \
    --instance-id $INSTANCE_ID \
    --query 'StandardErrorContent' --output text --region $REGION
  exit 1
fi
```

Ejecutarlo:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## SSL con dominio (opcional — para HTTPS en iPhone)

El Service Worker y algunas funciones PWA requieren HTTPS. Si tienes un dominio:

```bash
# Conectarse al servidor (solo esta vez, para instalar certbot)
ssh -i viga-key.pem ubuntu@TU_IP

# En el servidor:
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
# Certbot configura HTTPS automáticamente y renueva cada 90 días
```

Si no tienes dominio, la app funciona en HTTP. Solo que en iPhone la instalación
como PWA (agregar a pantalla de inicio) puede tener limitaciones.

---

## Backup de los datos

Los datos viven en `/home/ubuntu/ponte-viga/data/` en el servidor.
Para hacer backup manual:

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

# Copiar datos a S3 (backup)
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["aws s3 sync /home/ubuntu/ponte-viga/data/ s3://BUCKET/backup/$(date +%Y%m%d)/ --region us-east-1"]' \
  --region us-east-1
```

---

## Diagnosticar problemas

```bash
# Ver logs del bootstrap (instalación inicial)
# Requiere SSM Session Manager:
aws ssm start-session --target $INSTANCE_ID --region us-east-1
# Dentro del servidor:
# cat /var/log/ponte-viga-setup.log
# sudo -u ubuntu pm2 logs ponte-viga
# sudo nginx -t
# systemctl status nginx

# Ver estado de la instancia
aws ec2 describe-instance-status \
  --instance-ids $INSTANCE_ID \
  --query 'InstanceStatuses[0].InstanceStatus.Status' \
  --output text
```

---

## Limpiar todo (borrar recursos)

```bash
# CUIDADO: esto borra EC2, IPs, S3 (con todos los datos)

# 1. Primero vacía el bucket S3 (CFn no puede borrar buckets con contenido)
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-ec2 \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' \
  --output text)
aws s3 rm s3://$BUCKET --recursive

# 2. Borrar el stack completo
aws cloudformation delete-stack --stack-name ponte-viga-ec2 --region us-east-1
```

---

## Costos estimados

| Recurso | Costo mensual |
|---------|--------------|
| t3.micro EC2 | ~$8.50 |
| EBS 10 GB gp3 | ~$0.80 |
| Elastic IP (asociada) | $0.00 |
| S3 bucket (pocos MB) | ~$0.01 |
| SSM / CloudWatch | ~$0 (free tier) |
| **Total** | **~$10/mes** |

---

## Resumen del flujo completo

```
Primera vez:
  1. node build.js                    ← compilar la app
  2. aws cloudformation deploy ...    ← crear EC2 + S3 + todo
  3. aws s3 sync ... s3://BUCKET/app/ ← subir archivos
  4. (esperar ~4 min el bootstrap)
  5. aws ssm send-command ...         ← arrancar la app en el servidor

Actualizaciones:
  1. node build.js                    ← compilar cambios
  2. aws s3 sync ... s3://BUCKET/app/ ← actualizar S3
  3. aws ssm send-command ...         ← EC2 jala los cambios
  
  O simplemente: ./deploy.sh          ← hace los 3 pasos en uno
```
