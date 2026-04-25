# Arquitectura Event-Driven — Ponte Viga
## EventBridge → Lambda → DynamoDB / S3 con CloudFormation

> **Propósito educativo.** Este documento explica paso a paso cómo diseñar,
> desplegar y probar un flujo serverless completo en AWS, usando como caso
> real los datos de la app Ponte Viga.

---

## Tabla de contenido

1. [Visión general](#1-visión-general)
2. [Por qué EventBridge](#2-por-qué-eventbridge)
3. [Diseño de eventos](#3-diseño-de-eventos)
4. [Tablas DynamoDB](#4-tablas-dynamodb)
5. [Arquitectura completa](#5-arquitectura-completa)
6. [CloudFormation — template completo](#6-cloudformation--template-completo)
7. [Código Lambda](#7-código-lambda)
8. [Despliegue paso a paso](#8-despliegue-paso-a-paso)
9. [Probar el flujo](#9-probar-el-flujo)
10. [Conceptos clave aprendidos](#10-conceptos-clave-aprendidos)

---

## 1. Visión general

```
                   ┌─────────────────────────────────────────────┐
                   │               AWS Cloud                      │
                   │                                              │
  App (iPhone) ───►│  EventBridge     Lambda         DynamoDB    │
  o EC2 server     │  Event Bus   ──► Router ──►  Sessions       │
                   │                    │         Measures       │
                   │                    │         Profiles       │
                   │                    │         Routines       │
                   │                    │                        │
                   │                    └──► S3 (respaldo raw)   │
                   └─────────────────────────────────────────────┘
```

**Flujo resumido:**

1. Algo ocurre en la app (se guarda una sesión, se registra una medida…)
2. Se publica un **evento** al **Event Bus** de EventBridge
3. Una **Regla** de EventBridge detecta el tipo de evento
4. La regla **invoca una Lambda**
5. La Lambda **escribe en DynamoDB** y **archiva el evento crudo en S3**

---

## 2. Por qué EventBridge

| Concepto | Explicación |
|----------|-------------|
| **Event Bus** | Canal central donde cualquier productor publica mensajes |
| **Desacoplamiento** | El productor no sabe quién consume; añadir nuevos consumidores no rompe nada |
| **Filtrado declarativo** | Las Reglas filtran por `source`, `detail-type` o campos del payload — sin código |
| **Retry automático** | Si Lambda falla, EventBridge reintenta con back-off exponencial |
| **Múltiples targets** | Una regla puede invocar Lambda, SNS, SQS, Step Functions, etc. a la vez |

### EventBridge vs SQS vs SNS

```
SNS  → "Broadcast" de 1 a muchos. Notificaciones push.
SQS  → Cola FIFO/standard. El consumidor jala los mensajes.
EventBridge → Bus de eventos con enrutamiento por contenido. Orquestación.
```

Para Ponte Viga usamos **EventBridge** porque:
- Queremos enrutar distintos tipos de evento (sesión vs medida) con reglas diferentes
- Permite agregar en el futuro un target de email (SNS), una cola de analytics (SQS)
  o un Step Function sin tocar el productor

---

## 3. Diseño de eventos

Cada evento publicado al bus sigue la estructura estándar de EventBridge:

```json
{
  "source": "ponte-viga.app",
  "detail-type": "SESSION_SAVED",
  "detail": {
    "userId": "alejo",
    "data": { ... }
  }
}
```

### Tipos de evento (`detail-type`)

| detail-type | Cuándo se dispara | Payload |
|-------------|-------------------|---------|
| `SESSION_SAVED` | El usuario termina un entrenamiento | sesión completa |
| `MEASURE_SAVED` | Se guarda peso / barriga / brazo | medida del día |
| `PROFILE_UPDATED` | Se cambia altura, edad, actividad | perfil físico |
| `ROUTINE_UPDATED` | Se edita la rutina de un día | día + ejercicios |

### Ejemplo `SESSION_SAVED`

```json
{
  "source": "ponte-viga.app",
  "detail-type": "SESSION_SAVED",
  "detail": {
    "userId": "alejo",
    "data": {
      "date": "2026-04-24",
      "dow": 4,
      "title": "Pierna",
      "mood": "strong",
      "exercises": [
        {
          "id": "j1",
          "weight": 115,
          "sets": 3,
          "targetSets": 3,
          "reps": 12,
          "done": true
        }
      ],
      "cardioDone": true,
      "cardioMinutes": 10,
      "completed": true
    }
  }
}
```

### Ejemplo `MEASURE_SAVED`

```json
{
  "source": "ponte-viga.app",
  "detail-type": "MEASURE_SAVED",
  "detail": {
    "userId": "alejo",
    "data": {
      "date": "2026-04-24",
      "peso": 84.5,
      "barriga": 98,
      "brazo": 39
    }
  }
}
```

---

## 4. Tablas DynamoDB

DynamoDB es una base de datos NoSQL **clave-valor + documento**.
Cada tabla tiene una **Partition Key (PK)** y opcionalmente una **Sort Key (SK)**.

```
PK  → "¿para quién?" → normalmente el userId
SK  → "¿qué instancia?" → normalmente la fecha o el tipo
```

### Tabla 1 — `PonteViga-Sessions`

Guarda cada sesión de entrenamiento completada.

| Atributo | Tipo | Rol |
|----------|------|-----|
| `userId` | String | **Partition Key** |
| `date` | String | **Sort Key** (YYYY-MM-DD) |
| `dow` | Number | Día de la semana (0-6) |
| `title` | String | Nombre del entrenamiento |
| `mood` | String | sick / normal / strong |
| `exercises` | List | Array de ejercicios completados |
| `cardioDone` | Boolean | ¿Se hizo cardio? |
| `cardioMinutes` | Number | Minutos de cardio |
| `completed` | Boolean | ¿Sesión completa? |
| `savedAt` | String | ISO timestamp de cuando se guardó |

**Acceso típico:**
```
# Una sesión específica
PK = "alejo"  SK = "2026-04-24"

# Todas las sesiones de alejo (scan o query por PK)
PK = "alejo"

# Sesiones de abril (query con begins_with)
PK = "alejo"  SK begins_with "2026-04"
```

---

### Tabla 2 — `PonteViga-Measures`

Historial de medidas corporales (peso, barriga, brazo).

| Atributo | Tipo | Rol |
|----------|------|-----|
| `userId` | String | **Partition Key** |
| `date` | String | **Sort Key** (YYYY-MM-DD) |
| `peso` | Number | Peso en kg (nullable) |
| `barriga` | Number | Circunferencia barriga cm (nullable) |
| `brazo` | Number | Circunferencia brazo cm (nullable) |
| `savedAt` | String | ISO timestamp |

**Acceso típico:**
```
# Última medida (query DESC, limit 1)
PK = "alejo"  SK DESC

# Medidas de los últimos 3 meses
PK = "alejo"  SK between "2026-01-01" and "2026-04-24"
```

---

### Tabla 3 — `PonteViga-Profiles`

Datos físicos del usuario: altura, edad, sexo, nivel de actividad.

| Atributo | Tipo | Rol |
|----------|------|-----|
| `userId` | String | **Partition Key** (solo PK, no SK) |
| `height` | Number | Altura en cm |
| `age` | Number | Edad en años |
| `sex` | String | "m" / "f" |
| `activity` | Number | Multiplicador TDEE (1.2 – 1.6) |
| `updatedAt` | String | ISO timestamp de la última edición |

**Nota:** Esta tabla no necesita Sort Key porque un usuario tiene **un solo perfil**.
Se usa `UpdateItem` para hacer upsert (crear si no existe, actualizar si ya existe).

---

### Tabla 4 — `PonteViga-Routines`

Rutinas personalizadas por día de la semana.

| Atributo | Tipo | Rol |
|----------|------|-----|
| `userId` | String | **Partition Key** |
| `dow` | Number | **Sort Key** — día de la semana (0=Dom … 6=Sáb) |
| `title` | String | Nombre del día ("Pierna", "Pecho y tríceps"…) |
| `subtitle` | String | Subtítulo |
| `muscles` | List | Grupos musculares |
| `exercises` | List | Array de ejercicios con sets/reps/peso |
| `cardio` | Map | `{ name, detail, minutes }` |
| `updatedAt` | String | ISO timestamp |

**Acceso típico:**
```
# Rutina del lunes de alejo
PK = "alejo"  SK = 1

# Todas las rutinas de alejo
PK = "alejo"  (query, devuelve los 7 días)
```

---

### Resumen de tablas

```
┌────────────────────────┬────────────┬────────────┬─────────────────────┐
│ Tabla                  │ PK         │ SK         │ Propósito           │
├────────────────────────┼────────────┼────────────┼─────────────────────┤
│ PonteViga-Sessions     │ userId (S) │ date (S)   │ Historial sesiones  │
│ PonteViga-Measures     │ userId (S) │ date (S)   │ Medidas corporales  │
│ PonteViga-Profiles     │ userId (S) │ —          │ Perfil físico       │
│ PonteViga-Routines     │ userId (S) │ dow (N)    │ Rutinas por día     │
└────────────────────────┴────────────┴────────────┴─────────────────────┘
  S = String, N = Number
```

---

## 5. Arquitectura completa

```
┌──────────────────────────────────────────────────────────────────────┐
│                          AWS Account                                 │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  EventBridge                                 │    │
│  │                                                              │    │
│  │  ┌──────────────────────┐                                   │    │
│  │  │  Custom Event Bus    │ ponte-viga-bus                    │    │
│  │  │                      │                                   │    │
│  │  │  Rule: ponte-viga.*  │──► Lambda: PonteVigaRouter        │    │
│  │  └──────────────────────┘         │                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                       │                              │
│              ┌────────────────────────┼──────────────────────┐      │
│              │                        │                       │      │
│              ▼                        ▼                       ▼      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────┐        │
│  │    DynamoDB        │  │    DynamoDB        │  │   S3   │        │
│  │  Sessions          │  │  Measures          │  │ Bucket │        │
│  │  Profiles          │  │  Routines          │  │ (raw)  │        │
│  └────────────────────┘  └────────────────────┘  └────────┘        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  IAM Role  ──►  Lambda puede escribir en DynamoDB + S3       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**Recursos CloudFormation creados (14 en total):**

| # | Tipo | Nombre lógico |
|---|------|---------------|
| 1 | `AWS::Events::EventBus` | `PonteVigaBus` |
| 2 | `AWS::Events::Rule` | `PonteVigaRule` |
| 3 | `AWS::Lambda::Function` | `PonteVigaRouter` |
| 4 | `AWS::Lambda::Permission` | `EventBridgeInvoke` |
| 5 | `AWS::IAM::Role` | `LambdaExecutionRole` |
| 6 | `AWS::S3::Bucket` | `PonteVigaRawEvents` |
| 7 | `AWS::DynamoDB::Table` | `SessionsTable` |
| 8 | `AWS::DynamoDB::Table` | `MeasuresTable` |
| 9 | `AWS::DynamoDB::Table` | `ProfilesTable` |
| 10 | `AWS::DynamoDB::Table` | `RoutinesTable` |
| 11 | `AWS::Logs::LogGroup` | `LambdaLogGroup` |

---

## 6. CloudFormation — template completo

Guarda este archivo como `infrastructure.yaml` en la raíz del proyecto.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: >
  Ponte Viga — Infraestructura event-driven.
  EventBridge Bus → Lambda Router → DynamoDB + S3
  EDUCATIVO: muestra el patrón completo de event-driven architecture en AWS.

# ─────────────────────────────────────────────────────────────────────────────
# PARAMETERS — valores que puedes cambiar sin tocar el template
# ─────────────────────────────────────────────────────────────────────────────
Parameters:

  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]
    Description: Ambiente de despliegue

  AppName:
    Type: String
    Default: ponte-viga
    Description: Prefijo para todos los recursos

  LogRetentionDays:
    Type: Number
    Default: 14
    Description: Días que se conservan los logs de Lambda en CloudWatch

# ─────────────────────────────────────────────────────────────────────────────
# RESOURCES
# ─────────────────────────────────────────────────────────────────────────────
Resources:

  # ───────────────────────────────────────────
  # 1. EVENTBRIDGE — Event Bus personalizado
  # ───────────────────────────────────────────
  PonteVigaBus:
    Type: AWS::Events::EventBus
    Properties:
      Name: !Sub "${AppName}-bus-${Environment}"
      # Tags opcionales para billing y organización
      Tags:
        - Key: Project
          Value: !Ref AppName
        - Key: Environment
          Value: !Ref Environment

  # ───────────────────────────────────────────
  # 2. EVENTBRIDGE RULE — enruta todos los eventos
  #    de la fuente "ponte-viga.app" a la Lambda
  # ───────────────────────────────────────────
  PonteVigaRule:
    Type: AWS::Events::Rule
    Properties:
      Name: !Sub "${AppName}-route-all-${Environment}"
      Description: "Enruta todos los eventos de Ponte Viga a la Lambda router"
      EventBusName: !Ref PonteVigaBus
      State: ENABLED
      # El patrón filtra qué eventos captura esta regla.
      # source: "ponte-viga.app" captura TODOS los eventos de nuestra app.
      # Para capturar solo sesiones usaríamos: detail-type: ["SESSION_SAVED"]
      EventPattern:
        source:
          - "ponte-viga.app"
      # Targets: a dónde van los eventos que coinciden
      Targets:
        - Id: "LambdaRouterTarget"
          Arn: !GetAtt PonteVigaRouterFunction.Arn
          # RetryPolicy: cuántos reintentos si Lambda falla
          RetryPolicy:
            MaximumRetryAttempts: 3
            MaximumEventAgeInSeconds: 3600  # 1 hora máximo en cola de reintentos
          # DeadLetterConfig: eventos que no pudieron procesarse van a SQS
          # (Opcional — descomenta si tienes una cola DLQ)
          # DeadLetterConfig:
          #   Arn: !GetAtt DeadLetterQueue.Arn

  # ───────────────────────────────────────────
  # 3. LAMBDA PERMISSION — permite que EventBridge
  #    invoque la función Lambda
  #    (sin esto EventBridge no puede llamar a Lambda)
  # ───────────────────────────────────────────
  LambdaInvokePermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref PonteVigaRouterFunction
      Action: "lambda:InvokeFunction"
      Principal: "events.amazonaws.com"
      SourceArn: !GetAtt PonteVigaRule.Arn

  # ───────────────────────────────────────────
  # 4. IAM ROLE — permisos que tiene la Lambda
  # ───────────────────────────────────────────
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "${AppName}-lambda-role-${Environment}"
      # AssumeRolePolicyDocument: quién puede "asumir" este rol
      # En este caso: el servicio Lambda
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      # ManagedPolicyArns: políticas pre-hechas por AWS que adjuntamos
      ManagedPolicyArns:
        # Permite escribir logs en CloudWatch (básico para cualquier Lambda)
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      # Policies: permisos específicos que creamos nosotros
      Policies:
        - PolicyName: !Sub "${AppName}-lambda-policy-${Environment}"
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              # Permiso para escribir en TODAS las tablas DynamoDB del proyecto
              - Sid: DynamoDBWriteAccess
                Effect: Allow
                Action:
                  - dynamodb:PutItem        # crear o reemplazar un ítem
                  - dynamodb:UpdateItem     # actualizar campos específicos
                  - dynamodb:GetItem        # leer un ítem por clave
                  - dynamodb:Query          # leer múltiples ítems por PK
                Resource:
                  - !GetAtt SessionsTable.Arn
                  - !GetAtt MeasuresTable.Arn
                  - !GetAtt ProfilesTable.Arn
                  - !GetAtt RoutinesTable.Arn
              # Permiso para escribir en el bucket S3 de eventos raw
              - Sid: S3WriteAccess
                Effect: Allow
                Action:
                  - s3:PutObject
                Resource: !Sub "${PonteVigaRawEventsBucket.Arn}/*"

  # ───────────────────────────────────────────
  # 5. CLOUDWATCH LOG GROUP — para los logs de Lambda
  #    Si no lo creas explícitamente, Lambda lo crea
  #    automáticamente pero sin política de retención.
  # ───────────────────────────────────────────
  LambdaLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub "/aws/lambda/${AppName}-router-${Environment}"
      RetentionInDays: !Ref LogRetentionDays

  # ───────────────────────────────────────────
  # 6. LAMBDA FUNCTION — el router central
  # ───────────────────────────────────────────
  PonteVigaRouterFunction:
    Type: AWS::Lambda::Function
    DependsOn: LambdaLogGroup  # asegura que el log group exista primero
    Properties:
      FunctionName: !Sub "${AppName}-router-${Environment}"
      Description: "Recibe eventos de EventBridge y los persiste en DynamoDB/S3"
      Runtime: nodejs20.x
      Handler: index.handler     # archivo index.js, función exportada handler
      Role: !GetAtt LambdaExecutionRole.Arn
      Timeout: 30                # segundos máximos de ejecución
      MemorySize: 256            # MB de RAM
      # Variables de entorno: accesibles como process.env.VARIABLE en el código
      Environment:
        Variables:
          SESSIONS_TABLE: !Ref SessionsTable
          MEASURES_TABLE: !Ref MeasuresTable
          PROFILES_TABLE: !Ref ProfilesTable
          ROUTINES_TABLE: !Ref RoutinesTable
          RAW_EVENTS_BUCKET: !Ref PonteVigaRawEventsBucket
          ENVIRONMENT: !Ref Environment
      # El código inline es útil para código corto en demos/educación.
      # En producción se sube un .zip a S3 y se usa S3Key/S3Bucket.
      Code:
        ZipFile: |
          // ─── Lambda Handler — Ponte Viga Router ──────────────────────────
          // Este código se despliega INLINE en el template de CloudFormation.
          // En producción lo normal es subir un .zip a S3.
          //
          // El handler recibe el evento de EventBridge y decide
          // a qué tabla de DynamoDB escribir según el detail-type.
          // ─────────────────────────────────────────────────────────────────

          const { DynamoDBClient, PutItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
          const { marshall } = require('@aws-sdk/util-dynamodb');
          const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

          const dynamo = new DynamoDBClient({});
          const s3     = new S3Client({});

          const TABLES = {
            SESSIONS_TABLE:  process.env.SESSIONS_TABLE,
            MEASURES_TABLE:  process.env.MEASURES_TABLE,
            PROFILES_TABLE:  process.env.PROFILES_TABLE,
            ROUTINES_TABLE:  process.env.ROUTINES_TABLE,
          };
          const BUCKET = process.env.RAW_EVENTS_BUCKET;

          // ── Handlers por tipo de evento ─────────────────────────────────

          async function handleSessionSaved(userId, data, eventTime) {
            const item = {
              userId,
              date:          data.date,
              dow:           data.dow,
              title:         data.title || '',
              mood:          data.mood  || 'normal',
              exercises:     data.exercises || [],
              cardioDone:    data.cardioDone    || false,
              cardioMinutes: data.cardioMinutes || 0,
              completed:     data.completed     || false,
              savedAt:       eventTime,
            };
            await dynamo.send(new PutItemCommand({
              TableName: TABLES.SESSIONS_TABLE,
              Item: marshall(item, { removeUndefinedValues: true }),
            }));
            console.log(`SESSION_SAVED → ${userId}/${data.date}`);
          }

          async function handleMeasureSaved(userId, data, eventTime) {
            // Solo guarda los campos que llegan (peso/barriga/brazo son opcionales)
            const item = { userId, date: data.date, savedAt: eventTime };
            if (data.peso    != null) item.peso    = data.peso;
            if (data.barriga != null) item.barriga = data.barriga;
            if (data.brazo   != null) item.brazo   = data.brazo;

            await dynamo.send(new PutItemCommand({
              TableName: TABLES.MEASURES_TABLE,
              Item: marshall(item, { removeUndefinedValues: true }),
            }));
            console.log(`MEASURE_SAVED → ${userId}/${data.date}`);
          }

          async function handleProfileUpdated(userId, data, eventTime) {
            // UpdateItem para no sobreescribir campos que no llegaron
            await dynamo.send(new PutItemCommand({
              TableName: TABLES.PROFILES_TABLE,
              Item: marshall({
                userId,
                height:    data.height    || 175,
                age:       data.age       || 0,
                sex:       data.sex       || 'm',
                activity:  data.activity  || 1.45,
                updatedAt: eventTime,
              }, { removeUndefinedValues: true }),
            }));
            console.log(`PROFILE_UPDATED → ${userId}`);
          }

          async function handleRoutineUpdated(userId, data, eventTime) {
            const item = {
              userId,
              dow:       data.dow,
              title:     data.title    || '',
              subtitle:  data.subtitle || '',
              muscles:   data.muscles  || [],
              exercises: data.exercises || [],
              cardio:    data.cardio   || null,
              updatedAt: eventTime,
            };
            await dynamo.send(new PutItemCommand({
              TableName: TABLES.ROUTINES_TABLE,
              Item: marshall(item, { removeUndefinedValues: true }),
            }));
            console.log(`ROUTINE_UPDATED → ${userId}/dow:${data.dow}`);
          }

          // ── Archivar evento crudo en S3 ─────────────────────────────────
          async function archiveToS3(event) {
            const { source, 'detail-type': detailType, detail, time } = event;
            const date  = (time || new Date().toISOString()).slice(0, 10);
            const ts    = Date.now();
            // Organizamos por año/mes/día para facilitar queries con Athena
            const key   = `events/${date}/${detailType}/${ts}.json`;

            await s3.send(new PutObjectCommand({
              Bucket:      BUCKET,
              Key:         key,
              Body:        JSON.stringify(event, null, 2),
              ContentType: 'application/json',
            }));
            console.log(`Archived to S3: s3://${BUCKET}/${key}`);
          }

          // ── Handler principal ────────────────────────────────────────────
          exports.handler = async (event) => {
            console.log('Event received:', JSON.stringify(event, null, 2));

            const detailType = event['detail-type'];
            const { userId, data } = event.detail || {};
            const eventTime  = event.time || new Date().toISOString();

            if (!userId || !data) {
              console.error('Evento malformado: falta userId o data', event.detail);
              return { statusCode: 400, body: 'Missing userId or data' };
            }

            // Archivamos SIEMPRE el evento crudo, sin importar el tipo
            await archiveToS3(event);

            // Enrutamos al handler correcto según el tipo
            switch (detailType) {
              case 'SESSION_SAVED':
                await handleSessionSaved(userId, data, eventTime);
                break;
              case 'MEASURE_SAVED':
                await handleMeasureSaved(userId, data, eventTime);
                break;
              case 'PROFILE_UPDATED':
                await handleProfileUpdated(userId, data, eventTime);
                break;
              case 'ROUTINE_UPDATED':
                await handleRoutineUpdated(userId, data, eventTime);
                break;
              default:
                console.warn(`Tipo de evento no manejado: ${detailType}`);
            }

            return { statusCode: 200, body: 'OK' };
          };

  # ───────────────────────────────────────────
  # 7. S3 BUCKET — archivo de eventos crudos
  # ───────────────────────────────────────────
  PonteVigaRawEventsBucket:
    Type: AWS::S3::Bucket
    Properties:
      # BucketName: si no lo pones, AWS genera uno automáticamente (recomendado
      # para evitar conflictos de nombres globales)
      BucketName: !Sub "${AppName}-raw-events-${Environment}-${AWS::AccountId}"
      # Encriptación en reposo con clave administrada por S3 (gratis)
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      # Bloquear acceso público (nunca queremos que los datos sean públicos)
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      # Ciclo de vida: mueve objetos a clases de almacenamiento más baratas
      LifecycleConfiguration:
        Rules:
          - Id: ArchiveOldEvents
            Status: Enabled
            Transitions:
              # Después de 90 días → Infrequent Access (más barato)
              - TransitionInDays: 90
                StorageClass: STANDARD_IA
              # Después de 365 días → Glacier (muy barato, recuperación lenta)
              - TransitionInDays: 365
                StorageClass: GLACIER
      Tags:
        - Key: Project
          Value: !Ref AppName
        - Key: Environment
          Value: !Ref Environment

  # ───────────────────────────────────────────
  # 8. DYNAMODB TABLES
  # ───────────────────────────────────────────

  # Tabla de sesiones de entrenamiento
  SessionsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AppName}-sessions-${Environment}"
      BillingMode: PAY_PER_REQUEST   # On-demand: pagas solo por lo que usas
                                      # Alternativa: PROVISIONED (throughput fijo)
      # KeySchema define las claves primarias
      KeySchema:
        - AttributeName: userId       # Partition Key
          KeyType: HASH
        - AttributeName: date         # Sort Key
          KeyType: RANGE
      # AttributeDefinitions: solo define los atributos usados en claves
      # (los demás atributos no se declaran aquí, son flexibles)
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S            # S = String
        - AttributeName: date
          AttributeType: S
      # Point-In-Time Recovery: permite restaurar a cualquier punto de las
      # últimas 35 días (como un backup continuo)
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      # TTL: elimina automáticamente ítems viejos (ahorra costo)
      # No habilitado aquí pero se podría poner un atributo "expiresAt"
      Tags:
        - Key: Project
          Value: !Ref AppName
        - Key: Environment
          Value: !Ref Environment

  # Tabla de medidas corporales
  MeasuresTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AppName}-measures-${Environment}"
      BillingMode: PAY_PER_REQUEST
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
        - AttributeName: date
          KeyType: RANGE
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: date
          AttributeType: S
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      Tags:
        - Key: Project
          Value: !Ref AppName

  # Tabla de perfiles físicos (sin Sort Key — un perfil por usuario)
  ProfilesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AppName}-profiles-${Environment}"
      BillingMode: PAY_PER_REQUEST
      KeySchema:
        - AttributeName: userId
          KeyType: HASH               # Solo PK, no SK
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      Tags:
        - Key: Project
          Value: !Ref AppName

  # Tabla de rutinas por día de la semana
  RoutinesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AppName}-routines-${Environment}"
      BillingMode: PAY_PER_REQUEST
      KeySchema:
        - AttributeName: userId
          KeyType: HASH
        - AttributeName: dow          # day of week (Number)
          KeyType: RANGE
      AttributeDefinitions:
        - AttributeName: userId
          AttributeType: S
        - AttributeName: dow
          AttributeType: N            # N = Number
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true
      Tags:
        - Key: Project
          Value: !Ref AppName

# ─────────────────────────────────────────────────────────────────────────────
# OUTPUTS — valores que CloudFormation expone después del despliegue
# Útiles para referencias cross-stack o para saber las ARNs/nombres creados
# ─────────────────────────────────────────────────────────────────────────────
Outputs:

  EventBusName:
    Description: "Nombre del Event Bus de EventBridge"
    Value: !Ref PonteVigaBus
    Export:
      Name: !Sub "${AppName}-bus-name-${Environment}"

  EventBusArn:
    Description: "ARN del Event Bus"
    Value: !GetAtt PonteVigaBus.Arn
    Export:
      Name: !Sub "${AppName}-bus-arn-${Environment}"

  LambdaFunctionName:
    Description: "Nombre de la función Lambda router"
    Value: !Ref PonteVigaRouterFunction

  LambdaFunctionArn:
    Description: "ARN de la función Lambda router"
    Value: !GetAtt PonteVigaRouterFunction.Arn

  S3BucketName:
    Description: "Nombre del bucket S3 de eventos raw"
    Value: !Ref PonteVigaRawEventsBucket

  SessionsTableName:
    Description: "Nombre de la tabla Sessions en DynamoDB"
    Value: !Ref SessionsTable

  MeasuresTableName:
    Description: "Nombre de la tabla Measures en DynamoDB"
    Value: !Ref MeasuresTable

  ProfilesTableName:
    Description: "Nombre de la tabla Profiles en DynamoDB"
    Value: !Ref ProfilesTable

  RoutinesTableName:
    Description: "Nombre de la tabla Routines en DynamoDB"
    Value: !Ref RoutinesTable
```

---

## 7. Código Lambda

El código está embebido inline en el template (sección `Code.ZipFile`), pero
para proyectos reales se extrae a un archivo separado.

### Estructura recomendada para producción

```
lambda/
├── index.js          ← handler principal + router
├── handlers/
│   ├── sessions.js   ← lógica de SESSION_SAVED
│   ├── measures.js   ← lógica de MEASURE_SAVED
│   ├── profiles.js   ← lógica de PROFILE_UPDATED
│   └── routines.js   ← lógica de ROUTINE_UPDATED
├── utils/
│   └── archive.js    ← lógica de archivado en S3
└── package.json
```

### Cómo subir código externo a Lambda (en lugar de inline)

```bash
# 1. Instalar dependencias
cd lambda
npm install

# 2. Empaquetar
zip -r function.zip . -x "*.git*"

# 3. Subir a S3
aws s3 cp function.zip s3://mi-bucket-de-deployment/lambda/function.zip

# 4. En el template, cambiar Code.ZipFile por:
#    Code:
#      S3Bucket: mi-bucket-de-deployment
#      S3Key: lambda/function.zip
```

---

## 8. Despliegue paso a paso

### Pre-requisitos

```bash
# Tener instalado AWS CLI
aws --version

# Configurar credenciales (necesitas un usuario IAM con permisos)
aws configure
# → AWS Access Key ID: [tu key]
# → AWS Secret Access Key: [tu secret]
# → Default region name: us-east-1   (o la que prefieras)
# → Default output format: json
```

### Paso 1 — Validar el template

```bash
aws cloudformation validate-template \
  --template-body file://infrastructure.yaml
```

Si hay errores de sintaxis YAML los verás aquí antes de desplegar.

### Paso 2 — Desplegar (primera vez)

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

> `--capabilities CAPABILITY_NAMED_IAM` es obligatorio cuando el template
> crea roles IAM con nombre específico. CloudFormation te lo exige como
> confirmación de que sabes que estás creando recursos de seguridad.

### Paso 3 — Ver el resultado

```bash
# Ver los outputs (nombres/ARNs creados)
aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs' \
  --output table
```

### Paso 4 — Ver recursos creados

```bash
aws cloudformation list-stack-resources \
  --stack-name ponte-viga-dev \
  --output table
```

### Actualizar el stack (después de cambios)

```bash
# Mismo comando deploy — CloudFormation detecta solo lo que cambió
aws cloudformation deploy \
  --template-file infrastructure.yaml \
  --stack-name ponte-viga-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM
```

### Eliminar todo (limpiar)

```bash
# CUIDADO: borra todos los recursos incluyendo datos en DynamoDB y S3
# Primero vacía el bucket S3 (CloudFormation no borra buckets con contenido)
aws s3 rm s3://ponte-viga-raw-events-dev-TUACCOUNT --recursive

aws cloudformation delete-stack --stack-name ponte-viga-dev
```

---

## 9. Probar el flujo

### Publicar un evento de prueba manualmente

```bash
# Primero obtén el nombre del bus
BUS_NAME=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`EventBusName`].OutputValue' \
  --output text)

echo "Bus: $BUS_NAME"

# Publicar un SESSION_SAVED de prueba
aws events put-events --entries '[
  {
    "Source": "ponte-viga.app",
    "DetailType": "SESSION_SAVED",
    "EventBusName": "'"$BUS_NAME"'",
    "Detail": "{\"userId\":\"alejo\",\"data\":{\"date\":\"2026-04-24\",\"dow\":4,\"title\":\"Pierna\",\"mood\":\"strong\",\"exercises\":[{\"id\":\"j1\",\"weight\":115,\"sets\":3,\"targetSets\":3,\"reps\":12,\"done\":true}],\"cardioDone\":true,\"cardioMinutes\":10,\"completed\":true}}"
  }
]'
```

### Ver los logs de Lambda en tiempo real

```bash
# Obtener el nombre de la función
FUNC_NAME=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionName`].OutputValue' \
  --output text)

# Tail de logs en CloudWatch
aws logs tail /aws/lambda/$FUNC_NAME --follow
```

### Verificar que el dato llegó a DynamoDB

```bash
# Obtener el nombre de la tabla
TABLE=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`SessionsTableName`].OutputValue' \
  --output text)

# Leer el ítem recién guardado
aws dynamodb get-item \
  --table-name $TABLE \
  --key '{"userId":{"S":"alejo"},"date":{"S":"2026-04-24"}}' \
  --output json
```

### Verificar el archivo raw en S3

```bash
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ponte-viga-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
  --output text)

# Listar archivos del día de hoy
aws s3 ls s3://$BUCKET/events/2026-04-24/ --recursive
```

### Probar un MEASURE_SAVED

```bash
aws events put-events --entries '[
  {
    "Source": "ponte-viga.app",
    "DetailType": "MEASURE_SAVED",
    "EventBusName": "'"$BUS_NAME"'",
    "Detail": "{\"userId\":\"alejo\",\"data\":{\"date\":\"2026-04-24\",\"peso\":84.5,\"barriga\":98,\"brazo\":39}}"
  }
]'
```

### Probar un ROUTINE_UPDATED

```bash
aws events put-events --entries '[
  {
    "Source": "ponte-viga.app",
    "DetailType": "ROUTINE_UPDATED",
    "EventBusName": "'"$BUS_NAME"'",
    "Detail": "{\"userId\":\"alejo\",\"data\":{\"dow\":3,\"title\":\"Pecho y tríceps\",\"subtitle\":\"Empuje horizontal\",\"muscles\":[\"Pectoral\",\"Tríceps\"],\"exercises\":[{\"id\":\"w1\",\"name\":\"Press plano\",\"sets\":3,\"reps\":12,\"weight\":70,\"unit\":\"lb\"}],\"cardio\":{\"name\":\"Caminadora\",\"minutes\":10}}}"
  }
]'
```

---

## 10. Conceptos clave aprendidos

### CloudFormation

| Concepto | Qué es |
|----------|--------|
| **Stack** | Colección de recursos AWS creados y gestionados como una unidad |
| **Template** | Archivo YAML/JSON que describe los recursos deseados |
| **Parameters** | Variables que se pasan al despliegue (env, nombre…) |
| **Outputs** | Valores que exporta el stack para uso externo o referencia |
| **!Ref** | Referencia el nombre/ID lógico de un recurso |
| **!GetAtt** | Obtiene un atributo específico de un recurso (ej: ARN) |
| **!Sub** | Interpolación de strings — `"${Nombre}-sufijo"` |
| **DependsOn** | Fuerza el orden de creación de recursos |
| **CAPABILITY_NAMED_IAM** | Permiso explícito para crear roles IAM con nombre |

### EventBridge

| Concepto | Qué es |
|----------|--------|
| **Event Bus** | Canal central de mensajes (hay uno por defecto, puedes crear personalizados) |
| **Rule** | Patrón de filtrado + lista de targets (a dónde va el evento si hace match) |
| **Event Pattern** | JSON que describe qué eventos captura la regla |
| **Target** | Destino del evento: Lambda, SQS, SNS, Step Functions, etc. |
| **Retry Policy** | Cuántas veces reintenta si el target falla |
| **DLQ** | Dead Letter Queue — donde van los eventos que no pudieron procesarse |

### DynamoDB

| Concepto | Qué es |
|----------|--------|
| **Partition Key (PK)** | Clave que determina en qué partición física vive el ítem |
| **Sort Key (SK)** | Clave secundaria para ordenar y filtrar dentro de una partición |
| **PutItem** | Crear o reemplazar un ítem completo |
| **UpdateItem** | Actualizar solo campos específicos sin sobreescribir el resto |
| **Query** | Buscar por PK (obligatorio) + SK (opcional, con condición) |
| **Scan** | Leer toda la tabla (lento y caro — evitar en producción) |
| **PAY_PER_REQUEST** | Facturación por operación (ideal para cargas impredecibles) |
| **marshall()** | Convierte un objeto JS normal al formato de tipos de DynamoDB |

### IAM

| Concepto | Qué es |
|----------|--------|
| **Role** | Identidad que asume un servicio (Lambda, EC2…) para obtener permisos |
| **AssumeRolePolicyDocument** | Define quién puede asumir el rol |
| **Policy** | Documento que lista qué acciones están permitidas/denegadas |
| **Principle of Least Privilege** | Solo dar los permisos mínimos necesarios |

---

## Diagrama de flujo completo

```
iPhone/EC2
    │
    │  PUT /data/sessions.json  (modo actual)
    │           ó
    │  PutEvents → EventBridge  (modo event-driven)
    │
    ▼
EventBridge Bus (ponte-viga-bus)
    │
    │  Regla: source = "ponte-viga.app"
    │
    ▼
Lambda: PonteVigaRouter
    │
    ├── detailType === SESSION_SAVED  ──► DynamoDB: Sessions  +  S3: archive
    ├── detailType === MEASURE_SAVED  ──► DynamoDB: Measures  +  S3: archive
    ├── detailType === PROFILE_UPDATED ─► DynamoDB: Profiles  +  S3: archive
    └── detailType === ROUTINE_UPDATED ─► DynamoDB: Routines  +  S3: archive


CloudWatch Logs
    └── /aws/lambda/ponte-viga-router-dev  (logs de cada invocación)
```

---

> **Siguiente paso posible:** agregar una API Gateway delante de Lambda para que
> la app publique eventos vía HTTPS directamente, sin pasar por el servidor EC2.
> O agregar un segundo target en la regla de EventBridge que envíe un correo
> (SNS) cuando se complete una racha de 7 días seguidos.
