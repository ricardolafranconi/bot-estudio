'use strict';

const axios = require('axios');
const { askClaude } = require('../claude/client');
const queries = require('../db/queries');

require('dotenv').config();

const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// ─── Enviar mensaje por WhatsApp ──────────────────────────────────────────────

async function sendWhatsAppMessage(to, text) {
  try {
    const response = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[WhatsApp] Error enviando mensaje:', JSON.stringify(detail));
    throw err;
  }
}

// ─── Procesar mensaje de texto entrante ──────────────────────────────────────

async function handleTextMessage(from, wamid, text, contactName) {
  console.log(`[Handler] Mensaje de ${from}: "${text.substring(0, 60)}..."`);

  // 1. Evitar procesar duplicados
  const already = await queries.messageAlreadyProcessed(wamid);
  if (already) {
    console.log(`[Handler] Mensaje ${wamid} ya procesado, ignorando.`);
    return;
  }

  // 2. Obtener historial de conversación
  let lead = await queries.findLeadByPhone(from);
  const history = lead
    ? await queries.getConversationHistory(lead.id)
    : [];

  // 3. Consultar a Claude
  let claudeResponse;
  try {
    claudeResponse = await askClaude(text, history);
  } catch (err) {
    console.error('[Handler] Error consultando Claude:', err.message);
    claudeResponse = {
      reply: 'Gracias por su mensaje. Un representante del estudio se comunicará con usted a la brevedad.',
      intent: 'OTRO',
      lead_name: null,
      priority: 'MEDIA',
      needs_lawyer: false,
      notes: 'Error al consultar Claude',
    };
  }

  // 4. Determinar nombre: usar el del mensaje si Claude no detectó uno
  const resolvedName = claudeResponse.lead_name || contactName || null;

  // 5. Determinar nuevo status según intent
  const newStatus = resolveStatus(claudeResponse.intent, lead?.status);

  // 6. Guardar lead + mensaje entrante (transacción)
  lead = await queries.upsertLeadAndSaveMessage(
    {
      phone:       from,
      name:        resolvedName,
      intent:      claudeResponse.intent,
      status:      newStatus,
      priority:    claudeResponse.priority,
      needs_lawyer:claudeResponse.needs_lawyer,
      notes:       claudeResponse.notes || null,
    },
    {
      wamid,
      direction: 'inbound',
      content:   text,
      intent:    claudeResponse.intent,
    }
  );

  // 7. Guardar mensaje saliente
  await queries.saveMessage({
    lead_id:   lead.id,
    wamid:     null,
    direction: 'outbound',
    content:   claudeResponse.reply,
    intent:    claudeResponse.intent,
  });

  // 8. Cancelar follow-ups pendientes (el usuario respondió)
  await queries.cancelPendingFollowUps(lead.id);

  // 9. Programar follow-up si es una consulta activa
  if (shouldScheduleFollowUp(claudeResponse.intent)) {
    const scheduled = new Date();
    scheduled.setHours(scheduled.getHours() + 24);
    await queries.createFollowUp({
      lead_id:      lead.id,
      message:      buildFollowUpMessage(resolvedName),
      scheduled_at: scheduled.toISOString().replace('T', ' ').substring(0, 19),
    });
  }

  // 10. Enviar respuesta al cliente
  try {
    await sendWhatsAppMessage(from, claudeResponse.reply);
    console.log(`[Handler] Respuesta enviada a ${from} (intent: ${claudeResponse.intent})`);
  } catch (err) {
    console.error(`[Handler] No se pudo enviar mensaje a ${from}`);
  }
}

// ─── Manejar mensajes no-texto (audio, imagen, etc.) ─────────────────────────

async function handleUnsupportedMessage(from, type) {
  const msg =
    'Hola, solo proceso mensajes de texto por el momento. ' +
    `Por favor escribí tu consulta o llamanos al ${process.env.ESTUDIO_TELEFONO || 'nuestro número'}.`;

  try {
    await sendWhatsAppMessage(from, msg);
  } catch (err) {
    console.error('[Handler] Error enviando mensaje a tipo no soportado:', err.message);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveStatus(intent, currentStatus) {
  if (['CONSULTA_LABORAL', 'CONSULTA_FAMILIA', 'CONSULTA_ACCIDENTE'].includes(intent)) {
    return 'activo';
  }
  if (intent === 'SEGUIMIENTO') return 'seguimiento';
  if (intent === 'DERIVACION')  return 'cerrado';
  return currentStatus || 'nuevo';
}

function shouldScheduleFollowUp(intent) {
  return ['CONSULTA_LABORAL', 'CONSULTA_FAMILIA', 'CONSULTA_ACCIDENTE'].includes(intent);
}

function buildFollowUpMessage(name) {
  const greeting = name ? `Hola ${name}!` : 'Hola!';
  return (
    `${greeting} Te escribo desde el ${process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico Lafranconi'}. ` +
    `¿Pudiste avanzar con tu consulta? Estamos a disposición si necesitás más información. 😊`
  );
}

module.exports = { handleTextMessage, handleUnsupportedMessage, sendWhatsAppMessage };
