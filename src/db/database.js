'use strict';

require('dotenv').config();
const { Pool, types } = require('pg');

// Retornar timestamps como strings para mantener compatibilidad con .substring() en los renderers
types.setTypeParser(1114, v => v); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, v => v); // TIMESTAMP WITH TIME ZONE

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
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
`;

pool.query(SCHEMA).then(() => {
  console.log('[DB] Schema inicializado correctamente.');
}).catch(err => {
  console.error('[DB] Error al inicializar schema:', err.message);
  process.exit(1);
});

module.exports = pool;
