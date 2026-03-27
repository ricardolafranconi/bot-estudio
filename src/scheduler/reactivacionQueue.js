'use strict';

const pool = require('../db/database');
const { sendWhatsAppMessage } = require('../handlers/messageHandler');

// ─── Feriados nacionales argentinos (fijos) ───────────────────────────────────
// Los feriados puente y carnaval (variables) no están incluidos.
const FERIADOS_FIJOS = new Set([
  '01-01', // Año Nuevo
  '03-24', // Día de la Memoria
  '04-02', // Día del Veterano de Malvinas
  '05-01', // Día del Trabajador
  '05-25', // Revolución de Mayo
  '06-20', // Paso a la Inmortalidad del Gral. Güemes
  '07-09', // Día de la Independencia
  '10-12', // Respeto a la Diversidad Cultural
  '11-20', // Día de la Soberanía Nacional
  '12-08', // Inmaculada Concepción de María
  '12-25', // Navidad
]);

// ─── Helpers de tiempo Argentina (UTC-3, sin DST) ─────────────────────────────

function getArgentinaNow() {
  return new Date(new Date().toLocaleString('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }));
}

function isHorarioHabil() {
  const ar  = getArgentinaNow();
  const dia = ar.getDay();   // 0=Dom, 6=Sáb
  const hora = ar.getHours();

  if (dia === 0 || dia === 6) return false;

  const mm = String(ar.getMonth() + 1).padStart(2, '0');
  const dd = String(ar.getDate()).padStart(2, '0');
  if (FERIADOS_FIJOS.has(`${mm}-${dd}`)) return false;

  return hora >= 9 && hora < 18;
}

/**
 * Inicio del día argentino actual expresado como ISO UTC.
 * Argentina = UTC-3 → medianoche AR = 03:00 UTC.
 */
function inicioDiaArgentinoUTC() {
  const ar = getArgentinaNow();
  // Resetear a medianoche AR
  const medianoche = new Date(ar);
  medianoche.setHours(0, 0, 0, 0);
  // Sumar 3 horas para convertir a UTC
  return new Date(medianoche.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

// ─── Lógica del procesador de cola ────────────────────────────────────────────

let ultimoEnvio = 0; // timestamp ms del último mensaje enviado
const LIMITE_DIARIO = 50;

async function procesarSiguienteEnvio() {
  if (!isHorarioHabil()) return { omitido: 'fuera_horario' };

  const diaInicio = inicioDiaArgentinoUTC();

  // Contar enviados hoy
  const { rows: contHoy } = await pool.query(
    "SELECT COUNT(*) AS c FROM reactivacion_envios WHERE estado='enviado' AND enviado_at >= $1",
    [diaInicio]
  );
  if (parseInt(contHoy[0].c) >= LIMITE_DIARIO) {
    return { omitido: 'limite_diario' };
  }

  // Verificar delay desde último envío (2-5 minutos aleatorio)
  const delaySec = 120 + Math.random() * 180; // 2-5 min
  if (ultimoEnvio > 0 && (Date.now() - ultimoEnvio) < delaySec * 1000) {
    return { omitido: 'delay_activo' };
  }

  // Obtener próximo pendiente (no haber enviado al mismo número hoy)
  const { rows } = await pool.query(`
    SELECT re.id, re.reac_id, re.phone, re.mensaje
    FROM reactivacion_envios re
    WHERE re.estado = 'pendiente'
      AND NOT EXISTS (
        SELECT 1 FROM reactivacion_envios re2
        WHERE re2.phone = re.phone
          AND re2.estado = 'enviado'
          AND re2.enviado_at >= $1
      )
    ORDER BY re.created_at ASC
    LIMIT 1
  `, [diaInicio]);

  if (rows.length === 0) return { omitido: 'sin_pendientes' };

  const envio = rows[0];

  try {
    await sendWhatsAppMessage(envio.phone, envio.mensaje);

    await pool.query(
      "UPDATE reactivacion_envios SET estado='enviado', enviado_at=NOW() WHERE id=$1",
      [envio.id]
    );
    await pool.query(
      "UPDATE reactivacion_leads SET estado='enviado', analizado_at=analizado_at WHERE id=$1",
      [envio.reac_id]
    );

    ultimoEnvio = Date.now();
    console.log(`[ReactivacionQueue] Enviado a ${envio.phone}`);
    return { enviado: true, phone: envio.phone };

  } catch (err) {
    await pool.query(
      "UPDATE reactivacion_envios SET estado='error', error_msg=$1 WHERE id=$2",
      [err.message, envio.id]
    );
    console.error(`[ReactivacionQueue] Error enviando a ${envio.phone}:`, err.message);
    return { error: err.message };
  }
}

// ─── Loop principal (cada 60 segundos) ───────────────────────────────────────

function startReactivacionQueue() {
  setInterval(async () => {
    try {
      await procesarSiguienteEnvio();
    } catch (err) {
      console.error('[ReactivacionQueue] Error en loop:', err.message);
    }
  }, 60_000);

  console.log('[Scheduler] Cola de reactivación iniciada (cada 60s).');
}

// ─── Estadísticas para el panel ──────────────────────────────────────────────

async function getColaStats() {
  const diaInicio = inicioDiaArgentinoUTC();

  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE estado='pendiente') AS pendientes,
      COUNT(*) FILTER (WHERE estado='enviado' AND enviado_at >= $1) AS enviados_hoy,
      COUNT(*) FILTER (WHERE estado='error') AS errores
    FROM reactivacion_envios
  `, [diaInicio]);

  return {
    ...rows[0],
    limite_diario: LIMITE_DIARIO,
    disponibles_hoy: Math.max(0, LIMITE_DIARIO - parseInt(rows[0].enviados_hoy)),
    horario_habil: isHorarioHabil(),
  };
}

module.exports = { startReactivacionQueue, procesarSiguienteEnvio, getColaStats };
