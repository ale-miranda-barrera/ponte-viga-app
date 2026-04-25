# AWS Setup — Ponte Viga
## Configuración mínima para desplegar CloudFormation desde tu máquina

---

## Tabla de contenido

1. [Dos opciones para empezar](#1-dos-opciones-para-empezar)
2. [Opción A — AWS CLI en tu máquina (recomendado)](#2-opción-a--aws-cli-en-tu-máquina-recomendado)
3. [Crear usuario IAM con permisos](#3-crear-usuario-iam-con-permisos)
4. [Configurar credenciales](#4-configurar-credenciales)
5. [Verificar que funciona](#5-verificar-que-funciona)
6. [Desplegar infrastructure.yaml en 3 comandos](#6-desplegar-infrastructureyaml-en-3-comandos)
7. [Comandos frecuentes](#7-comandos-frecuentes)
8. [Agregar los secrets a GitHub (para el pipeline CI/CD)](#8-agregar-los-secrets-a-github-para-el-pipeline-cicd)

---

## 1. Dos opciones para empezar

| Opción | Ventaja | Cuándo usarla |
|--------|---------|---------------|
| **AWS CLI en tu máquina** | Rápido, trabajas desde tu terminal normal | Si vas a desplegar frecuentemente |
| **AWS CloudShell (navegador)** | Sin instalar nada, ya tiene CLI lista | Para un despliegue puntual o prueba rápida |

**Para el pipeline de GitHub Actions el CLI en tu máquina es necesario** porque vas a configurar los secrets.

---

## 2. Opción A — AWS CLI en tu máquina (recomendado)

### Windows

```powershell
# Descarga e instala el MSI oficial (PowerShell como admin)
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi

# Verificar instalación (abre una terminal nueva)
aws --version
# → aws-cli/2.x.x Python/3.x ...
```

### Mac

```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
aws --version
```

### Opción B — CloudShell (sin instalar nada)

1. Abre la consola de AWS → busca **CloudShell** en la barra superior
2. Se abre una terminal en el navegador con AWS CLI ya configurado con tu sesión activa
3. Sube los archivos `.yaml` con el botón **Actions → Upload file**
4. Ejecuta los comandos directamente

---

## 3. Crear usuario IAM con permisos

Necesitas un usuario IAM con **acceso programático** (Access Key + Secret Key).
Nunca uses las credenciales de root de tu cuenta.

### En la consola de AWS

1. Ve a **IAM → Users → Create user**
2. Nombre: `ponte-viga-deploy`
3. **No** marques "AWS Management Console access" (es solo para CLI/API)
4. Adjunta permisos:
   - Si es para aprender / dev: `AdministratorAccess` (más fácil)
   - Si quieres mínimos permisos (recomendado a largo plazo):

```
CloudFormationFullAccess
AmazonDynamoDBFullAccess
AmazonS3FullAccess
AWSLambda_FullAccess
CloudWatchLogsFullAccess
IAMFullAccess          ← necesario para que CFn cree el rol de Lambda
AmazonEventBridgeFullAccess
EC2InstanceConnect
AmazonEC2FullAccess
```

5. Crea el usuario → ve a **Security credentials → Create access key**
6. Elige "CLI" como caso de uso
7. **Copia y guarda el Access Key ID y el Secret Access Key** — solo los ves una vez

---

## 4. Configurar credenciales

```bash
aws configure
```

Te pregunta 4 cosas:

```
AWS Access Key ID [None]:     AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]:   us-east-1
Default output format [None]: json
```

Esto guarda las credenciales en `~/.aws/credentials` y la región en `~/.aws/config`.

### Verificar que quedaron guardadas

```bash
aws sts get-caller-identity
```

Respuesta esperada:
```json
{
    "UserId": "AIDACKCEVSQ6C2EXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/ponte-viga-deploy"
}
```

Si ves tu cuenta y usuario, está configurado.

---

## 5. Verificar que funciona

```bash
# Listar tus stacks de CloudFormation (vacío si es la primera vez)
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Listar buckets S3
aws s3 ls

# Listar tablas DynamoDB
aws dynamodb list-tables
```

---

## 6. Desplegar infrastructure.yaml en 3 comandos

Desde la carpeta del proyecto (`ponte viga/`):

### Comando 1 — Validar el template (detecta errores de sintaxis)

```bash
aws cloudformation validate-template \
  --template-body file://infrastructure.yaml
```

### Comando 2 — Desplegar

```bash
aws cloudformation deploy \
  --template-file infrastructure.yaml \
  --stack-name ponte-viga-dev \
  --parameter-overrides \
      Environment=dev \
      AppName=ponte-viga \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

> CloudFormation tarda ~2-3 minutos. Puedes ver el progreso en la consola:
> AWS Console → CloudFormation → Stacks → `ponte-viga-dev` → Events

### Comando 3 — Ver los recursos creados

```bash
aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs' \
  --output table
```

---

## 7. Comandos frecuentes

```bash
# Ver eventos del stack en tiempo real (útil si falla el deploy)
aws cloudformation describe-stack-events \
  --stack-name ponte-viga-dev \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'

# Actualizar el stack (después de cambiar infrastructure.yaml)
aws cloudformation deploy \
  --template-file infrastructure.yaml \
  --stack-name ponte-viga-dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset   # no falla si no hubo cambios

# Ver qué cambiaría antes de aplicar (change set)
aws cloudformation create-change-set \
  --stack-name ponte-viga-dev \
  --template-body file://infrastructure.yaml \
  --change-set-name preview-cambios \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation describe-change-set \
  --stack-name ponte-viga-dev \
  --change-set-name preview-cambios

# Eliminar el stack completo (borra TODO, incluyendo datos)
# Primero vacía el bucket S3:
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
  --output text)
aws s3 rm s3://$BUCKET --recursive

aws cloudformation delete-stack --stack-name ponte-viga-dev
```

---

## 8. Agregar los secrets a GitHub (para el pipeline CI/CD)

El pipeline de GitHub Actions necesita las credenciales AWS y el acceso SSH a EC2.
Se guardan como **secrets** en el repositorio (nunca en el código).

### En GitHub: Settings → Secrets and variables → Actions → New repository secret

| Secret | Valor |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Tu Access Key ID del paso 3 |
| `AWS_SECRET_ACCESS_KEY` | Tu Secret Access Key del paso 3 |
| `AWS_REGION` | `us-east-1` (o la región que uses) |
| `EC2_HOST` | IP pública de tu instancia EC2 |
| `EC2_SSH_KEY` | Contenido completo del archivo `.pem` |

### Cómo copiar el contenido del .pem

```bash
# Mac/Linux
cat viga-key.pem | pbcopy    # Mac
cat viga-key.pem             # Linux — selecciona y copia todo, incluyendo ----BEGIN...

# Windows (PowerShell)
Get-Content viga-key.pem | Set-Clipboard
```

Pega el contenido completo (incluyendo `-----BEGIN RSA PRIVATE KEY-----` y `-----END RSA PRIVATE KEY-----`) como valor del secret `EC2_SSH_KEY`.

---

## Resumen rápido

```
1. Instalar AWS CLI
2. Crear usuario IAM → Access Key + Secret Key
3. aws configure  →  pegar las keys + region us-east-1
4. aws sts get-caller-identity  →  verificar
5. aws cloudformation deploy ...  →  desplegar infrastructure.yaml
6. Agregar los 5 secrets en GitHub para el pipeline automático
```

---

> **Siguiente paso:** Con esto configurado, el pipeline de GitHub Actions
> (ver sección 11 en EVENTBRIDGE-ARCHITECTURE.md) se encargará de desplegar
> automáticamente cada vez que hagas push a `main`.
