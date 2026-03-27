'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const SYSTEM_PROMPT = require('./systemPrompt');

require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Convierte el historial de la DB al formato de mensajes de Claude.
 * @param {Array<{direction: string, content: string}>} history
 * @returns {Array<{role: string, content: string}>}
 */
function buildMessageHistory(history) {
  return history.map((msg) => ({
    role: msg.direction === 'inbound' ? 'user' : 'assistant',
    content: msg.content,
  }));
}

/**
 * Envía un mensaje a Claude y retorna la respuesta parseada.
 * Usa streaming internamente para evitar timeouts en respuestas largas.
 *
 * @param {string} userMessage - Mensaje nuevo del cliente
 * @param {Array} conversationHistory - Historial previo de la DB
 * @returns {Promise<{reply: string, intent: string, lead_name: string|null, priority: string, needs_lawyer: boolean, notes: string}>}
 */
async function askClaude(userMessage, conversationHistory = []) {
  const previousMessages = buildMessageHistory(conversationHistory);

  // Agregar el mensaje actual del usuario
  const messages = [
    ...previousMessages,
    { role: 'user', content: userMessage },
  ];

  let rawText = '';

  // Streaming para evitar timeouts
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      rawText += event.delta.text;
    }
  }

  return parseClaudeResponse(rawText);
}

/**
 * Parsea la respuesta JSON de Claude.
 * Si falla el parseo, retorna una respuesta de fallback.
 */
function parseClaudeResponse(rawText) {
  try {
    // Claude a veces envuelve el JSON en ```json ... ```
    const clean = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(clean);

    return {
      reply:        String(parsed.reply       || ''),
      intent:       String(parsed.intent      || 'OTRO'),
      lead_name:    parsed.lead_name           || null,
      priority:     String(parsed.priority    || 'MEDIA'),
      needs_lawyer: Boolean(parsed.needs_lawyer),
      notes:        String(parsed.notes       || ''),
    };
  } catch (err) {
    console.error('[Claude] Error parseando JSON:', err.message);
    console.error('[Claude] Raw response:', rawText);

    // Fallback: devolvemos el texto crudo como reply
    return {
      reply:        rawText || 'Gracias por su mensaje. Un representante del estudio se comunicará con usted a la brevedad.',
      intent:       'OTRO',
      lead_name:    null,
      priority:     'MEDIA',
      needs_lawyer: false,
      notes:        'Error de parseo en respuesta de Claude',
    };
  }
}

/**
 * Llama a Claude con un prompt simple y retorna el texto crudo.
 * Útil para análisis batch donde no se necesita el systemPrompt del bot.
 */
async function callClaude(prompt, maxTokens = 2048) {
  let text = '';
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
    }
  }
  return text;
}

module.exports = { askClaude, callClaude };
