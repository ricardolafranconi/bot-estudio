'use strict';

const pool = require('./database');

// ─── Leads ───────────────────────────────────────────────────────────────────

async function findLeadByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM leads WHERE phone = $1', [phone]);
  return rows[0];
}

async function createLead(data) {
  const { rows } = await pool.query(
    `INSERT INTO leads (phone, name, intent, status, priority, needs_lawyer, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.phone, data.name ?? null, data.intent ?? null, data.status ?? 'nuevo',
     data.priority ?? 'MEDIA', data.needs_lawyer ? 1 : 0, data.notes ?? null]
  );
  return rows[0];
}

async function updateLead(data) {
  await pool.query(
    `UPDATE leads
     SET name         = COALESCE($1, name),
         intent       = COALESCE($2, intent),
         status       = COALESCE($3, status),
         priority     = COALESCE($4, priority),
         needs_lawyer = COALESCE($5, needs_lawyer),
         notes        = COALESCE($6, notes),
         updated_at   = NOW()
     WHERE phone = $7`,
    [data.name ?? null, data.intent ?? null, data.status ?? null,
     data.priority ?? null,
     data.needs_lawyer != null ? (data.needs_lawyer ? 1 : 0) : null,
     data.notes ?? null, data.phone]
  );
}

async function getAllLeads() {
  const { rows } = await pool.query(`
    SELECT l.*,
      (SELECT content    FROM messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM messages WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*)   FROM messages WHERE lead_id = l.id) AS message_count
    FROM leads l
    ORDER BY l.updated_at DESC
  `);
  return rows;
}

async function getLeadsByStatus(status) {
  const { rows } = await pool.query(
    'SELECT * FROM leads WHERE status = $1 ORDER BY updated_at DESC',
    [status]
  );
  return rows;
}

async function getLeadStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'nuevo'         THEN 1 ELSE 0 END) AS nuevos,
      SUM(CASE WHEN status = 'activo'        THEN 1 ELSE 0 END) AS activos,
      SUM(CASE WHEN status = 'seguimiento'   THEN 1 ELSE 0 END) AS seguimiento,
      SUM(CASE WHEN status = 'cerrado'       THEN 1 ELSE 0 END) AS cerrados,
      SUM(CASE WHEN priority = 'ALTA'        THEN 1 ELSE 0 END) AS alta_prioridad,
      SUM(CASE WHEN intent LIKE 'CONSULTA_%' THEN 1 ELSE 0 END) AS consultas,
      SUM(CASE WHEN needs_lawyer = 1         THEN 1 ELSE 0 END) AS requieren_abogado
    FROM leads
  `);
  return rows[0];
}

// ─── Messages ─────────────────────────────────────────────────────────────────

async function saveMessage(data) {
  await pool.query(
    `INSERT INTO messages (lead_id, wamid, direction, content, intent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (wamid) DO NOTHING`,
    [data.lead_id, data.wamid ?? null, data.direction, data.content, data.intent ?? null]
  );
}

async function getConversationHistory(leadId) {
  const { rows } = await pool.query(
    `SELECT direction, content, created_at
     FROM messages
     WHERE lead_id = $1
     ORDER BY created_at ASC
     LIMIT 30`,
    [leadId]
  );
  return rows;
}

async function messageAlreadyProcessed(wamid) {
  const { rows } = await pool.query('SELECT id FROM messages WHERE wamid = $1', [wamid]);
  return rows[0];
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────

async function createFollowUp(data) {
  await pool.query(
    'INSERT INTO follow_ups (lead_id, message, scheduled_at) VALUES ($1, $2, $3)',
    [data.lead_id, data.message, data.scheduled_at]
  );
}

async function getPendingFollowUps() {
  const { rows } = await pool.query(`
    SELECT f.*, l.phone, l.name
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    WHERE f.status = 'pending'
      AND f.scheduled_at <= NOW()
  `);
  return rows;
}

async function markFollowUpSent(id) {
  await pool.query(
    "UPDATE follow_ups SET status = 'sent', sent_at = NOW() WHERE id = $1",
    [id]
  );
}

async function cancelPendingFollowUps(leadId) {
  await pool.query(
    "UPDATE follow_ups SET status = 'cancelled' WHERE lead_id = $1 AND status = 'pending'",
    [leadId]
  );
}

async function getLeadsWithoutRecentActivity() {
  const { rows } = await pool.query(`
    SELECT l.*
    FROM leads l
    WHERE l.status IN ('nuevo', 'activo')
      AND l.updated_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM follow_ups f
        WHERE f.lead_id = l.id AND f.status = 'pending'
      )
  `);
  return rows;
}

// ─── Transacción: upsert lead + guardar mensaje ────────────────────────────────

async function upsertLeadAndSaveMessage(leadData, messageData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let lead;
    const existing = await client.query(
      'SELECT * FROM leads WHERE phone = $1',
      [leadData.phone]
    );

    if (existing.rows.length === 0) {
      const result = await client.query(
        `INSERT INTO leads (phone, name, intent, status, priority, needs_lawyer, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [leadData.phone, leadData.name ?? null, leadData.intent ?? null, 'nuevo',
         leadData.priority ?? 'MEDIA', leadData.needs_lawyer ? 1 : 0, leadData.notes ?? null]
      );
      lead = result.rows[0];
    } else {
      lead = existing.rows[0];
      await client.query(
        `UPDATE leads
         SET name         = COALESCE($1, name),
             intent       = COALESCE($2, intent),
             status       = COALESCE($3, status),
             priority     = COALESCE($4, priority),
             needs_lawyer = COALESCE($5, needs_lawyer),
             notes        = COALESCE($6, notes),
             updated_at   = NOW()
         WHERE phone = $7`,
        [leadData.name ?? null, leadData.intent ?? null, leadData.status ?? null,
         leadData.priority ?? null,
         leadData.needs_lawyer != null ? (leadData.needs_lawyer ? 1 : 0) : null,
         leadData.notes ?? null, leadData.phone]
      );
    }

    if (messageData) {
      await client.query(
        `INSERT INTO messages (lead_id, wamid, direction, content, intent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (wamid) DO NOTHING`,
        [lead.id, messageData.wamid ?? null, messageData.direction,
         messageData.content, messageData.intent ?? null]
      );
    }

    await client.query('COMMIT');
    return lead;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findLeadByPhone,
  createLead,
  updateLead,
  getAllLeads,
  getLeadsByStatus,
  getLeadStats,
  saveMessage,
  getConversationHistory,
  messageAlreadyProcessed,
  createFollowUp,
  getPendingFollowUps,
  markFollowUpSent,
  cancelPendingFollowUps,
  getLeadsWithoutRecentActivity,
  upsertLeadAndSaveMessage,
};
