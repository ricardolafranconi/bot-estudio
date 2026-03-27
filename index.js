'use strict';

require('dotenv').config();

const express = require('express');
const webhookRouter      = require('./src/webhooks');
const adminRouter        = require('./src/admin/panel');
const reactivacionRouter = require('./src/admin/reactivacion');
const { startAllJobs }   = require('./src/scheduler/cronJobs');

// Inicializar DB (ejecuta el schema al importar)
require('./src/db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    estudio: process.env.ESTUDIO_NOMBRE,
    timestamp: new Date().toISOString(),
  });
});

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.use('/webhook', webhookRouter);
app.use('/admin',   reactivacionRouter);
app.use('/admin',   adminRouter);

// ─── Endpoint de prueba (sin WhatsApp) ───────────────────────────────────────
// Útil para testear Claude antes de configurar la API de Meta.
// Eliminar o proteger en producción si se desea.

app.post('/test', async (req, res) => {
  const { mensaje, telefono } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Falta el campo "mensaje".' });

  const { askClaude } = require('./src/claude/client');
  const queries = require('./src/db/queries');

  const phone = telefono || '5490000000000';

  try {
    const lead    = await queries.findLeadByPhone(phone);
    const history = lead ? await queries.getConversationHistory(lead.id) : [];
    const result  = await askClaude(mensaje, history);

    const updatedLead = await queries.upsertLeadAndSaveMessage(
      { phone, name: result.lead_name, intent: result.intent,
        priority: result.priority, needs_lawyer: result.needs_lawyer, notes: result.notes },
      { wamid: `test_${Date.now()}`, direction: 'inbound', content: mensaje, intent: result.intent }
    );
    await queries.saveMessage({
      lead_id: updatedLead.id, wamid: null,
      direction: 'outbound', content: result.reply, intent: result.intent,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Error handler global
app.use((err, req, res, _next) => {
  console.error('[Server] Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ─── Arranque ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Bot WhatsApp — ${(process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico').padEnd(32)}║`);
  console.log(`║  Servidor en http://localhost:${PORT}              ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('  📡 Webhook:  /webhook');
  console.log('  🖥️  Panel:    /admin');
  console.log('  💚 Health:   /health');
  console.log('');

  startAllJobs();
});

module.exports = app;
