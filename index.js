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

// ─── Política de Privacidad ───────────────────────────────────────────────────

app.get('/privacidad', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidad — Estudio Jurídico Lafranconi</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #f7f5f0;
      color: #1a1a1a;
      line-height: 1.8;
      padding: 40px 20px 80px;
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #d9d3c7;
      border-radius: 4px;
      padding: 56px 64px;
    }
    header {
      text-align: center;
      border-bottom: 2px solid #b8860b;
      padding-bottom: 28px;
      margin-bottom: 40px;
    }
    header .logo {
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #b8860b;
      margin-bottom: 10px;
    }
    header h1 {
      font-size: 22px;
      font-weight: normal;
      color: #1a1a1a;
      letter-spacing: 0.5px;
    }
    header .subtitle {
      font-size: 13px;
      color: #666;
      margin-top: 8px;
    }
    h2 {
      font-size: 15px;
      font-weight: bold;
      color: #1a1a1a;
      letter-spacing: 0.3px;
      margin-top: 36px;
      margin-bottom: 12px;
      padding-left: 12px;
      border-left: 3px solid #b8860b;
    }
    p { margin-bottom: 14px; font-size: 15px; color: #2c2c2c; }
    ul {
      margin: 0 0 14px 0;
      padding-left: 24px;
    }
    ul li { margin-bottom: 6px; font-size: 15px; color: #2c2c2c; }
    .contact-box {
      margin-top: 40px;
      background: #f7f5f0;
      border: 1px solid #d9d3c7;
      border-radius: 4px;
      padding: 24px 28px;
    }
    .contact-box p { margin: 4px 0; font-size: 14px; color: #333; }
    .contact-box strong { color: #1a1a1a; }
    footer {
      text-align: center;
      margin-top: 48px;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #e8e4dc;
      padding-top: 20px;
    }
    @media (max-width: 600px) {
      .container { padding: 32px 24px; }
    }
  </style>
</head>
<body>
  <div class="container">

    <header>
      <div class="logo">Estudio Jurídico</div>
      <h1>Lafranconi</h1>
      <div class="subtitle">Política de Privacidad — Bot de WhatsApp</div>
    </header>

    <p>
      El presente documento describe cómo el <strong>Estudio Jurídico Lafranconi</strong>
      recopila, utiliza y protege la información personal que usted proporciona al
      comunicarse a través de nuestro asistente de WhatsApp.
    </p>

    <h2>1. Datos que se recopilan</h2>
    <p>Al utilizar nuestro bot de WhatsApp, podemos recopilar los siguientes datos:</p>
    <ul>
      <li>Número de teléfono de WhatsApp.</li>
      <li>Nombre e identificación que usted indique voluntariamente durante la conversación.</li>
      <li>Domicilio y datos de contacto que comparta para la gestión de su consulta.</li>
      <li>Contenido de los mensajes enviados al asistente (texto libre).</li>
      <li>Fecha y hora de los mensajes.</li>
      <li>Información sobre la naturaleza del asunto legal consultado.</li>
    </ul>
    <p>
      No se recopilan datos sensibles adicionales sin su consentimiento expreso
      y los datos recopilados se limitan estrictamente a lo necesario para
      atender su consulta jurídica.
    </p>

    <h2>2. Finalidad del tratamiento</h2>
    <p>Los datos recopilados se utilizan exclusivamente para:</p>
    <ul>
      <li>Gestionar y responder consultas jurídicas iniciales de manera automatizada.</li>
      <li>Derivar su caso al profesional correspondiente del estudio.</li>
      <li>Coordinar turnos, audiencias y comunicaciones relacionadas con su expediente.</li>
      <li>Generar documentación legal vinculada a su caso (cuando usted lo autorice expresamente).</li>
      <li>Mantener un registro interno de la gestión del estudio.</li>
    </ul>
    <p>
      Sus datos <strong>no serán vendidos, cedidos ni compartidos</strong> con
      terceros ajenos al estudio, salvo obligación legal o con su consentimiento explícito.
    </p>

    <h2>3. Almacenamiento y seguridad</h2>
    <p>
      La información se almacena en servidores con acceso restringido y protocolos
      de seguridad. Solo el personal autorizado del Estudio Jurídico Lafranconi
      tiene acceso a los datos de los clientes. Se aplican medidas técnicas y
      organizativas para prevenir accesos no autorizados, pérdida o alteración de la información.
    </p>
    <p>
      Los datos se conservan durante el tiempo necesario para la prestación del
      servicio y en cumplimiento de los plazos legales aplicables. Transcurrido
      dicho plazo, serán eliminados de forma segura.
    </p>

    <h2>4. Base legal del tratamiento</h2>
    <p>
      El tratamiento de sus datos se basa en su consentimiento otorgado al iniciar
      la conversación con el asistente, y en el interés legítimo del estudio para
      la prestación de servicios jurídicos, conforme a la
      <strong>Ley N° 25.326 de Protección de Datos Personales</strong> de la
      República Argentina y su decreto reglamentario.
    </p>

    <h2>5. Derechos del titular</h2>
    <p>Usted tiene derecho a:</p>
    <ul>
      <li><strong>Acceder</strong> a los datos personales que obren en nuestros registros.</li>
      <li><strong>Rectificar</strong> datos inexactos o incompletos.</li>
      <li><strong>Suprimir</strong> sus datos cuando no sean necesarios para la finalidad que motivó su recopilación.</li>
      <li><strong>Oponerse</strong> al tratamiento en los supuestos previstos por la ley.</li>
    </ul>
    <p>
      Para ejercer cualquiera de estos derechos, comuníquese con el responsable
      del tratamiento a través de los datos de contacto indicados a continuación.
    </p>

    <h2>6. Uso de inteligencia artificial</h2>
    <p>
      El asistente de WhatsApp utiliza tecnología de inteligencia artificial
      (Anthropic Claude) para procesar y responder mensajes de forma automatizada.
      Los mensajes pueden ser procesados por dicho servicio exclusivamente con el
      fin de generar respuestas útiles para su consulta. Anthropic opera bajo sus
      propias políticas de privacidad y seguridad.
    </p>
    <p>
      Las conversaciones son revisadas por el personal del estudio para garantizar
      la calidad del servicio y la correcta gestión de los casos.
    </p>

    <h2>7. Modificaciones</h2>
    <p>
      Esta política puede actualizarse periódicamente. La versión vigente estará
      disponible en esta misma dirección. Le recomendamos consultarla ante cualquier
      duda sobre el tratamiento de sus datos.
    </p>

    <div class="contact-box">
      <p><strong>Responsable del tratamiento de datos:</strong></p>
      <p>Dr. Ricardo Lafranconi — Abogado (Mat. 4197 – T° XIV – F° 97)</p>
      <p>Estudio Jurídico Lafranconi</p>
      <p>Chile 249, Oberá, Misiones, Argentina</p>
      <p>Para consultas sobre privacidad, comuníquese por WhatsApp o de forma presencial en el estudio.</p>
    </div>

    <footer>
      <p>Estudio Jurídico Lafranconi &mdash; Oberá, Misiones &mdash; Argentina</p>
      <p>Vigente a partir del 27 de marzo de 2025</p>
    </footer>

  </div>
</body>
</html>`);
});

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
