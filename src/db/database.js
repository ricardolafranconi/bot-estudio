'use strict';

require('dotenv').config();
const { Pool, types } = require('pg');

// Retornar timestamps como strings para mantener compatibilidad con .substring() en los renderers
types.setTypeParser(1114, v => v); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, v => v); // TIMESTAMP WITH TIME ZONE

// ─── Validar y limpiar DATABASE_URL ──────────────────────────────────────────

let DATABASE_URL = (process.env.DATABASE_URL || '').trim();

if (!DATABASE_URL) {
  console.error('[DB] ERROR: DATABASE_URL no está definida en el .env');
  process.exit(1);
}

// Railway a veces usa "postgres://" en lugar de "postgresql://".
// pg acepta ambas, pero algunos entornos solo aceptan el formato estándar.
// Normalizamos por consistencia.
if (DATABASE_URL.startsWith('postgres://')) {
  DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://');
}

// Verificar formato mínimo
if (!DATABASE_URL.startsWith('postgresql://')) {
  console.error('[DB] ERROR: DATABASE_URL tiene formato inválido.');
  console.error('[DB] Debe empezar con postgresql:// o postgres://');
  console.error('[DB] Valor recibido:', DATABASE_URL.substring(0, 40) + '...');
  process.exit(1);
}

const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS leads (
    id           SERIAL PRIMARY KEY,
    phone        TEXT NOT NULL UNIQUE,
    name         TEXT,
    intent       TEXT,
    status       TEXT DEFAULT 'nuevo',
    priority     TEXT DEFAULT 'MEDIA',
    needs_lawyer INTEGER DEFAULT 0,
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    lead_id    INTEGER NOT NULL REFERENCES leads(id),
    wamid      TEXT UNIQUE,
    direction  TEXT NOT NULL,
    content    TEXT NOT NULL,
    intent     TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS follow_ups (
    id           SERIAL PRIMARY KEY,
    lead_id      INTEGER NOT NULL REFERENCES leads(id),
    message      TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at      TIMESTAMPTZ,
    status       TEXT DEFAULT 'pending',
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_messages_lead_id  ON messages(lead_id);
  CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
  CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);

  CREATE TABLE IF NOT EXISTS casos (
    id             SERIAL PRIMARY KEY,
    expediente     TEXT NOT NULL UNIQUE,
    lead_id        INTEGER REFERENCES leads(id),
    nombre         TEXT NOT NULL,
    telefono       TEXT,
    email          TEXT,
    dni            TEXT,
    domicilio      TEXT,
    tipo_caso      TEXT,
    estado         TEXT DEFAULT 'Nuevo',
    actor          TEXT,
    demandado      TEXT,
    terceros       TEXT,
    resumen        TEXT,
    proxima_accion TEXT,
    proxima_fecha  TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS caso_movimientos (
    id          SERIAL PRIMARY KEY,
    caso_id     INTEGER NOT NULL REFERENCES casos(id),
    descripcion TEXT NOT NULL,
    fecha       TIMESTAMPTZ DEFAULT NOW(),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_casos_lead_id    ON casos(lead_id);
  CREATE INDEX IF NOT EXISTS idx_movimientos_caso ON caso_movimientos(caso_id);

  CREATE TABLE IF NOT EXISTS reactivacion_leads (
    id               SERIAL PRIMARY KEY,
    lead_id          INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    phone            TEXT NOT NULL UNIQUE,
    nombre           TEXT,
    categoria        CHAR(1),
    tipo_caso        TEXT,
    resumen          TEXT,
    ultimo_interes   TEXT,
    mensaje_sugerido TEXT,
    prioridad        INTEGER DEFAULT 2,
    estado           TEXT DEFAULT 'pendiente',
    last_contact_at  TIMESTAMPTZ,
    analizado_at     TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS reactivacion_envios (
    id          SERIAL PRIMARY KEY,
    reac_id     INTEGER NOT NULL REFERENCES reactivacion_leads(id) ON DELETE CASCADE,
    phone       TEXT NOT NULL,
    mensaje     TEXT NOT NULL,
    estado      TEXT DEFAULT 'pendiente',
    error_msg   TEXT,
    enviado_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_reac_leads_categoria ON reactivacion_leads(categoria);
  CREATE INDEX IF NOT EXISTS idx_reac_leads_estado    ON reactivacion_leads(estado);
  CREATE INDEX IF NOT EXISTS idx_reac_envios_estado   ON reactivacion_envios(estado);

  CREATE TABLE IF NOT EXISTS telegramas (
    id         SERIAL PRIMARY KEY,
    caso_id    INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    tipo       TEXT NOT NULL,
    estado     TEXT DEFAULT 'borrador',
    datos      JSONB,
    cuerpo     TEXT,
    pdf_path   TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_telegramas_caso ON telegramas(caso_id);
`;

pool.query(SCHEMA).then(() => {
  console.log('[DB] Schema inicializado correctamente.');
}).catch(err => {
  // Mostrar el error real de PostgreSQL para facilitar el diagnóstico
  console.error('[DB] ─── Error al inicializar schema ───────────────────');
  console.error('[DB] Mensaje:', err.message);
  console.error('[DB] Código:', err.code || '(sin código)');
  console.error('[DB] URL usada:', (process.env.DATABASE_URL || '').replace(/:([^@:]+)@/, ':***@'));
  console.error('[DB] ────────────────────────────────────────────────────');
  process.exit(1);
});

module.exports = pool;
