'use strict';

const cron = require('node-cron');
const queries = require('../db/queries');
const { sendWhatsAppMessage } = require('../handlers/messageHandler');

require('dotenv').config();

/**
 * Envía follow-ups pendientes cuyo scheduled_at ya pasó.
 * Se ejecuta cada 30 minutos.
 */
function startFollowUpJob() {
  cron.schedule('*/30 * * * *', async () => {
    const pending = await queries.getPendingFollowUps();

    if (pending.length === 0) return;

    console.log(`[Scheduler] Enviando ${pending.length} follow-up(s) pendiente(s).`);

    for (const followUp of pending) {
      try {
        await sendWhatsAppMessage(followUp.phone, followUp.message);
        await queries.markFollowUpSent(followUp.id);
        console.log(`[Scheduler] Follow-up enviado a ${followUp.phone}`);
      } catch (err) {
        console.error(`[Scheduler] Error enviando follow-up a ${followUp.phone}:`, err.message);
      }
    }
  });

  console.log('[Scheduler] Job follow-ups iniciado (cada 30 min).');
}

/**
 * Programa follow-ups para leads sin actividad reciente.
 * Se ejecuta todos los días a las 9:00.
 */
function startInactivityReminderJob() {
  cron.schedule('0 9 * * 1-5', async () => {
    const inactiveLeads = await queries.getLeadsWithoutRecentActivity();

    if (inactiveLeads.length === 0) return;

    console.log(`[Scheduler] Programando recordatorios para ${inactiveLeads.length} lead(s) inactivo(s).`);

    for (const lead of inactiveLeads) {
      const message = buildInactivityMessage(lead.name);
      const scheduledAt = new Date();
      scheduledAt.setMinutes(scheduledAt.getMinutes() + 10); // enviar en 10 min

      await queries.createFollowUp({
        lead_id:      lead.id,
        message,
        scheduled_at: scheduledAt.toISOString().replace('T', ' ').substring(0, 19),
      });
    }
  });

  console.log('[Scheduler] Job recordatorios de inactividad iniciado (lun-vie 9:00).');
}

/**
 * Marca como cerrados los leads sin actividad > 7 días.
 * Se ejecuta todos los lunes a las 8:00.
 */
function startStaleLeadsCleanupJob() {
  cron.schedule('0 8 * * 1', async () => {
    const pool = require('../db/database');

    const result = await pool.query(`
      UPDATE leads
      SET status = 'cerrado', updated_at = NOW()
      WHERE status IN ('nuevo', 'activo', 'seguimiento')
        AND updated_at < NOW() - INTERVAL '7 days'
    `);

    if (result.rowCount > 0) {
      console.log(`[Scheduler] ${result.rowCount} lead(s) marcados como cerrados por inactividad.`);
    }
  });

  console.log('[Scheduler] Job limpieza de leads obsoletos iniciado (lunes 8:00).');
}

function buildInactivityMessage(name) {
  const greeting = name ? `Hola ${name}!` : 'Hola!';
  const estudio = process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico Lafranconi';
  return (
    `${greeting} Te contactamos desde el ${estudio}. ` +
    `¿Pudimos ayudarte con tu consulta? Si necesitás más información o querés coordinar una cita, ` +
    `respondé este mensaje o comunicate con nosotros. 🏛️`
  );
}

function startAllJobs() {
  startFollowUpJob();
  startInactivityReminderJob();
  startStaleLeadsCleanupJob();

  const { startReactivacionQueue } = require('./reactivacionQueue');
  startReactivacionQueue();
}

module.exports = { startAllJobs };
