'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool    = require('../db/database');
const { callClaude } = require('../claude/client');

// ─── Estado global (accesible desde el panel para polling) ────────────────────

const estado = {
  running:    false,
  total:      0,
  procesados: 0,
  errores:    0,
  startedAt:  null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw.trim()); } catch {}
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(stripped.substring(s, e + 1)); } catch {}
  }
  return null;
}

function buildPrompt(convText, diasDesdeUltimo) {
  const estudio = process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico Lafranconi';
  return `Analizá esta conversación de WhatsApp de ${estudio} (Oberá, Misiones, Argentina).
Han pasado ${diasDesdeUltimo} días desde el último mensaje del cliente.

Clasificá en UNA categoría y respondé SOLO con JSON válido (sin bloques de código):

Categorías:
A = CLIENTE CALIENTE: mostró interés claro, preguntó honorarios, casi cerró — seguimiento urgente
B = CONSULTA SIN CIERRE: hizo consulta y recibió info pero sin next step acordado — seguimiento medio
C = CASO EN CURSO: ya es cliente activo con proceso o gestión en marcha
D = CERRADO NEGATIVAMENTE: dijo que no, tiene abogado, resolvió solo, o rechazó explícitamente
E = SIN CONTEXTO: chat muy corto, solo saludos, historial mínimo
F = INACTIVO LARGO PLAZO: inactivo más de 6 meses sin contexto relevante

{
  "categoria": "A",
  "nombre_cliente": null,
  "tipo_caso": null,
  "resumen": "máx 100 palabras describiendo el caso",
  "ultimo_interes": "qué estaba buscando o consultando, o null",
  "mensaje_seguimiento": "mensaje WhatsApp listo para enviar, máx 3 oraciones, tono profesional y cercano, sin saludar con nombre si no lo sabemos, sin mencionar fechas específicas del chat, adaptado al tiempo transcurrido",
  "prioridad": 2
}

CONVERSACIÓN:
${convText}`;
}

// ─── Función principal de análisis ────────────────────────────────────────────

async function analizarChats({ forzar = false, limite = 1000 } = {}) {
  if (estado.running) {
    return { error: 'Ya hay un análisis en curso.' };
  }

  // Determinar qué leads analizar
  let query;
  const params = [limite];

  if (forzar) {
    query = `
      SELECT l.*, EXTRACT(EPOCH FROM (NOW() - l.updated_at))/86400 AS dias_inactivo
      FROM leads l
      WHERE l.status != 'cerrado'
      ORDER BY l.updated_at ASC
      LIMIT $1
    `;
  } else {
    query = `
      SELECT l.*, EXTRACT(EPOCH FROM (NOW() - l.updated_at))/86400 AS dias_inactivo
      FROM leads l
      WHERE l.status != 'cerrado'
        AND NOT EXISTS (
          SELECT 1 FROM reactivacion_leads r
          WHERE r.lead_id = l.id
        )
      ORDER BY l.updated_at ASC
      LIMIT $1
    `;
  }

  const { rows: leads } = await pool.query(query, params);

  if (leads.length === 0) {
    return { procesados: 0, errores: 0, total: 0 };
  }

  // Actualizar estado
  estado.running    = true;
  estado.total      = leads.length;
  estado.procesados = 0;
  estado.errores    = 0;
  estado.startedAt  = new Date().toISOString();

  console.log(`[Analizar] Iniciando análisis de ${leads.length} leads...`);

  // Procesar en background (no bloquear el caller)
  setImmediate(async () => {
    for (const lead of leads) {
      if (!estado.running) break; // cancelación manual futura

      try {
        const dias = Math.floor(Number(lead.dias_inactivo) || 0);

        // Obtener historial de mensajes
        const { rows: messages } = await pool.query(
          'SELECT direction, content, created_at FROM messages WHERE lead_id=$1 ORDER BY created_at ASC',
          [lead.id]
        );

        let result;

        // Auto-clasificación sin llamar a Claude (ahorra tokens)
        if (messages.length === 0) {
          result = autoClasificar('E', lead.name, dias);
        } else if (dias > 180 && messages.length < 3) {
          result = autoClasificar('F', lead.name, dias);
        } else {
          // Llamar a Claude
          const convText = messages.map(m =>
            `[${m.direction === 'inbound' ? 'Cliente' : 'Estudio'}]: ${m.content}`
          ).join('\n');

          const raw  = await callClaude(buildPrompt(convText, dias), 1024);
          result = parseJson(raw);

          if (!result || !result.categoria) {
            throw new Error(`JSON inválido. Raw: ${(raw || '').substring(0, 200)}`);
          }
        }

        // Fecha del último contacto
        const lastContact = messages.length > 0
          ? messages[messages.length - 1].created_at
          : lead.updated_at;

        // Normalizar datos
        const categoria = String(result.categoria || 'E').trim().toUpperCase().charAt(0);
        const prioridad = Number(result.prioridad) || 2;

        // Para categoría D: guardar con estado='descartado' (no contactar)
        const estadoFinal = categoria === 'D' ? 'descartado' : 'pendiente';

        // Upsert en reactivacion_leads
        await pool.query(`
          INSERT INTO reactivacion_leads
            (lead_id, phone, nombre, categoria, tipo_caso, resumen, ultimo_interes,
             mensaje_sugerido, prioridad, estado, last_contact_at, analizado_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          ON CONFLICT (phone) DO UPDATE SET
            categoria       = EXCLUDED.categoria,
            tipo_caso       = EXCLUDED.tipo_caso,
            resumen         = EXCLUDED.resumen,
            ultimo_interes  = EXCLUDED.ultimo_interes,
            mensaje_sugerido= EXCLUDED.mensaje_sugerido,
            prioridad       = EXCLUDED.prioridad,
            estado          = CASE WHEN reactivacion_leads.estado = 'enviado'
                                   THEN 'enviado'
                                   ELSE EXCLUDED.estado END,
            last_contact_at = EXCLUDED.last_contact_at,
            analizado_at    = NOW()
        `, [
          lead.id,
          lead.phone,
          result.nombre_cliente || lead.name || null,
          categoria,
          result.tipo_caso || lead.intent || null,
          result.resumen || null,
          result.ultimo_interes || null,
          result.mensaje_seguimiento || result.mensaje_sugerido || null,
          prioridad,
          estadoFinal,
          lastContact,
        ]);

        estado.procesados++;

        // Rate limit: 1 segundo entre llamadas a Claude
        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        console.error(`[Analizar] Error en lead ${lead.phone}:`, err.message);
        estado.errores++;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const resumen = {
      procesados: estado.procesados,
      errores:    estado.errores,
      total:      estado.total,
    };
    console.log(`[Analizar] Finalizado. ${resumen.procesados} procesados, ${resumen.errores} errores.`);
    estado.running = false;
  });

  return { iniciado: true, total: leads.length };
}

// ─── Auto-clasificación sin Claude ────────────────────────────────────────────

function autoClasificar(cat, nombre, dias) {
  const estudio = process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico Lafranconi';
  const saludoBase = `Hola${nombre ? ' ' + nombre : ''}, te contactamos desde el ${estudio}.`;

  const mensajes = {
    E: `${saludoBase} ¿Tenés alguna consulta legal en la que podamos ayudarte?`,
    F: `Hola, te escribimos desde el ${estudio}. ¿Hay algo en lo que podamos ayudarte hoy?`,
  };

  return {
    categoria:          cat,
    nombre_cliente:     nombre || null,
    tipo_caso:          null,
    resumen:            cat === 'E' ? 'Chat sin historial significativo.' : `Lead inactivo hace más de ${dias} días sin contexto.`,
    ultimo_interes:     null,
    mensaje_seguimiento: mensajes[cat] || mensajes.E,
    prioridad:          3,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { analizarChats, estado };

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args    = process.argv.slice(2);
  const forzar  = args.includes('--forzar');
  const limiteI = args.indexOf('--limite');
  const limite  = limiteI !== -1 ? parseInt(args[limiteI + 1]) || 1000 : 1000;

  console.log(`[Analizar] Iniciando. forzar=${forzar}, limite=${limite}`);

  analizarChats({ forzar, limite }).then(() => {
    // Esperar a que el setImmediate termine (polling simple)
    const interval = setInterval(() => {
      process.stdout.write(`\r[Analizar] ${estado.procesados}/${estado.total} | errores: ${estado.errores}  `);
      if (!estado.running) {
        clearInterval(interval);
        console.log('\n[Analizar] Completado.');
        process.exit(0);
      }
    }, 1500);
  }).catch(err => {
    console.error('[Analizar] Error fatal:', err);
    process.exit(1);
  });
}
