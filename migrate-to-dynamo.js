// migrate-to-dynamo.js — Mueve los JSON existentes en /home/ubuntu/ponte-viga/data
// hacia la tabla DynamoDB. Idempotente: si la clave ya existe en DynamoDB con el
// mismo updatedAt-source, no la sobreescribe.
//
// Se ejecuta automáticamente desde el SSM Deploy Document tras cada deploy
// cuando aún hay archivos en /data/. También se puede correr manualmente:
//   AWS_REGION=us-east-1 PONTE_VIGA_TABLE=ponte-viga-data-prod node migrate-to-dynamo.js
const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.PONTE_VIGA_TABLE;
const REGION = process.env.AWS_REGION || 'us-east-1';

if (!TABLE) {
  console.error('❌ Falta env var PONTE_VIGA_TABLE');
  process.exit(1);
}

// Buscar el directorio data — en producción es /home/ubuntu/ponte-viga/data
const DATA_DIR = fs.existsSync('/home/ubuntu/ponte-viga/data')
  ? '/home/ubuntu/ponte-viga/data'
  : path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  console.log(`Sin datos que migrar (${DATA_DIR} no existe).`);
  process.exit(0);
}

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client);

async function migrate() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  console.log(`Encontrados ${files.length} archivo(s) en ${DATA_DIR}`);

  let migrated = 0, skipped = 0, failed = 0;

  for (const f of files) {
    const key = f.replace(/\.json$/, '');
    const fullPath = path.join(DATA_DIR, f);

    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      console.warn(`⚠ ${f}: JSON inválido (${e.message}). Saltando.`);
      failed++;
      continue;
    }

    try {
      // ¿Ya existe en DynamoDB?
      const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: key } }));
      if (existing.Item && existing.Item.migratedFromFile) {
        console.log(`= ${key}: ya migrado, skip`);
        skipped++;
        continue;
      }

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          pk: key,
          data,
          updatedAt: new Date().toISOString(),
          migratedFromFile: true,
        },
      }));
      console.log(`✓ ${key}: migrado`);
      migrated++;
    } catch (e) {
      console.error(`✗ ${key}: error (${e.message})`);
      failed++;
    }
  }

  console.log(`\nResumen: ${migrated} migrados, ${skipped} omitidos, ${failed} con error`);

  // Marcar el directorio como migrado (rename) para no re-procesar en deploys futuros
  if (migrated > 0 && failed === 0) {
    const archive = `${DATA_DIR}.migrated.${Date.now()}`;
    fs.renameSync(DATA_DIR, archive);
    console.log(`📦 Datos archivados en ${archive}`);
  }
}

migrate().catch(e => {
  console.error('❌ Migración falló:', e);
  process.exit(1);
});
