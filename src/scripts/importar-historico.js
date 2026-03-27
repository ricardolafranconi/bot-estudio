'use strict';

/**
 * Importa chats históricos a la base de datos desde un archivo JSON.
 *
 * Formato JSON esperado:
 * [
 *   {
 *     "phone": "5493755123456",
 *     "name": "Juan Pérez",          (opcional)
 *     "messages": [
 *       { "direction": "inbound",  "content": "Hola...", "created_at": "2024-01-15T10:30:00Z" },
 *       { "direction": "outbound", "content": "Buen día...", "created_at": "2024-01-15T10:31:00Z" }
 *     ]
 *   }
 * ]
 *
 * También acepta direction como "from": "client"|"bot"|"inbound"|"outbound"
 *
 * Uso CLI:
 *   node src/scripts/importar-historico.js <ruta-al-archivo.json>
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs   = require('fs');
const path = require('path');
const pool = require('../db/database');

// ─── Normalizar direction ─────────────────────────────────────────────────────

function normalizeDirection(dir) {
  if (!dir) return 'inbound';
  const d = String(dir).toLowerCase();
  if (d === 'client' || d === 'inbound' || d === 'in') return 'inbound';
  if (d === 'bot' || d === 'outbound' || d === 'out' || d === 'studio') return 'outbound';
  return 'inbound';
}

// ─── Importar un único lead con sus mensajes ──────────────────────────────────

async function importarLead(client, entry) {
  const phone    = String(entry.phone || '').trim();
  const name     = entry.name || entry.nombre || null;
  const messages = Array.isArray(entry.messages) ? entry.messages : [];

  if (!phone) throw new Error('Entrada sin campo phone');

  // Upsert lead
  const { rows } = await client.query(`
    INSERT INTO leads (phone, name, status, priority)
    VALUES ($1, $2, 'nuevo', 'MEDIA')
    ON CONFLICT (phone) DO UPDATE
      SET name = COALESCE(EXCLUDED.name, leads.name)
    RETURNING id
  `, [phone, name]);

  const leadId = rows[0].id;

  // Insertar mensajes
  let importados = 0;
  for (const msg of messages) {
    const direction  = normalizeDirection(msg.direction || msg.from);
    const content    = String(msg.content || msg.text || msg.body || '').trim();
    const createdAt  = msg.created_at || msg.timestamp || msg.fecha || new Date().toISOString();

    if (!content) continue;

    await client.query(`
      INSERT INTO messages (lead_id, direction, content, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [leadId, direction, content, createdAt]);

    importados++;
  }

  // Actualizar updated_at del lead según el último mensaje
  if (messages.length > 0) {
    const timestamps = messages
      .map(m => m.created_at || m.timestamp || null)
      .filter(Boolean)
      .sort()
      .reverse();

    if (timestamps[0]) {
      await client.query(
        'UPDATE leads SET updated_at = $1 WHERE id = $2',
        [timestamps[0], leadId]
      );
    }
  }

  return { leadId, importados };
}

// ─── Función principal ────────────────────────────────────────────────────────

async function importarHistorico(rutaArchivo) {
  if (!rutaArchivo) throw new Error('Se requiere la ruta del archivo JSON.');

  const absPath = path.isAbsolute(rutaArchivo)
    ? rutaArchivo
    : path.join(process.cwd(), rutaArchivo);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Archivo no encontrado: ${absPath}`);
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error('El JSON debe ser un array de conversaciones.');
  }

  let leadsCreados     = 0;
  let leadsActualizados = 0;
  let mensajesImportados = 0;
  let errores          = 0;

  for (const entry of data) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ver si ya existe
      const { rows: existing } = await client.query(
        'SELECT id FROM leads WHERE phone = $1',
        [String(entry.phone || '').trim()]
      );
      const esNuevo = existing.length === 0;

      const { importados } = await importarLead(client, entry);

      await client.query('COMMIT');

      if (esNuevo) leadsCreados++;
      else leadsActualizados++;
      mensajesImportados += importados;

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Importar] Error en entrada phone=${entry.phone}:`, err.message);
      errores++;
    } finally {
      client.release();
    }
  }

  const resultado = {
    total:               data.length,
    leadsCreados,
    leadsActualizados,
    mensajesImportados,
    errores,
  };

  console.log('[Importar] Resultado:', resultado);
  return resultado;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { importarHistorico };

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error('Uso: node src/scripts/importar-historico.js <ruta-al-archivo.json>');
    process.exit(1);
  }

  importarHistorico(ruta)
    .then(r => {
      console.log(`\nImportación completada:`);
      console.log(`  Leads creados:      ${r.leadsCreados}`);
      console.log(`  Leads actualizados: ${r.leadsActualizados}`);
      console.log(`  Mensajes:           ${r.mensajesImportados}`);
      console.log(`  Errores:            ${r.errores}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[Importar] Error fatal:', err.message);
      process.exit(1);
    });
}
