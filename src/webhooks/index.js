'use strict';

const express = require('express');
const { handleTextMessage, handleUnsupportedMessage } = require('../handlers/messageHandler');

require('dotenv').config();

const router = express.Router();

// ─── GET /webhook — Verificación del webhook por Meta ────────────────────────
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Webhook] Verificación exitosa.');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verificación fallida. Token recibido:', token);
  res.sendStatus(403);
});

// ─── POST /webhook — Recibir mensajes de WhatsApp ────────────────────────────
router.post('/', (req, res) => {
  // Responder 200 inmediatamente para que Meta no reintente
  res.sendStatus(200);

  const body = req.body;

  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value;

      // Ignorar actualizaciones de estado (sent/delivered/read)
      if (!value.messages || value.messages.length === 0) continue;

      for (const message of value.messages) {
        const from        = message.from;                  // número del remitente
        const wamid       = message.id;                    // ID único del mensaje
        const contactName = value.contacts?.[0]?.profile?.name || null;

        if (message.type === 'text') {
          const text = message.text?.body?.trim();
          if (!text) continue;

          // Procesar en background (no bloqueamos la respuesta 200)
          handleTextMessage(from, wamid, text, contactName).catch((err) =>
            console.error('[Webhook] Error en handleTextMessage:', err.message)
          );
        } else {
          // Audio, imagen, video, sticker, etc.
          handleUnsupportedMessage(from, message.type).catch((err) =>
            console.error('[Webhook] Error en handleUnsupportedMessage:', err.message)
          );
        }
      }
    }
  }
});

module.exports = router;
