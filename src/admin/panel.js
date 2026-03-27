'use strict';

const express = require('express');
const queries = require('../db/queries');
const db = require('../db/database');
const Anthropic = require('@anthropic-ai/sdk');

require('dotenv').config();

const router = express.Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auth ─────────────────────────────────────────────────────────────────────

function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).send('Autenticación requerida.');
  }
  const [, encoded] = auth.split(' ');
  const [, password] = Buffer.from(encoded, 'base64').toString().split(':');
  if (password !== ADMIN_PASSWORD) return res.status(403).send('Contraseña incorrecta.');
  next();
}

router.use(basicAuth);
router.use(express.urlencoded({ extended: false }));
router.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generarExpediente() {
  const year = new Date().getFullYear();
  const { rows } = await db.query('SELECT COUNT(*) AS c FROM casos WHERE expediente LIKE $1', [`EST-${year}-%`]);
  return `EST-${year}-${String(parseInt(rows[0].c) + 1).padStart(3, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function businessDaysBetween(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (end <= start) return 0;
  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const INTENT_LABELS = {
  CONSULTA_LABORAL:'⚖️ Laboral', CONSULTA_FAMILIA:'👨‍👩‍👧 Familia',
  CONSULTA_CIVIL:'📄 Civil', CONSULTA_SUCESIONES:'🏛️ Sucesiones',
  CONSULTA_PREVISIONAL:'👴 Previsional', CONSULTA_ADMINISTRATIVO:'🏢 Administrativo',
  CONSULTA_ACCIDENTE:'🚗 Accidente', SEGUIMIENTO:'🔄 Seguimiento',
  SALUDO:'👋 Saludo', INFO_GENERAL:'ℹ️ Info', DERIVACION:'↗️ Derivación', OTRO:'❓ Otro',
};

const STATUS_COLORS   = { nuevo:'#3b82f6', activo:'#10b981', seguimiento:'#f59e0b', cerrado:'#6b7280' };
const PRIORITY_COLORS = { ALTA:'#ef4444', MEDIA:'#f59e0b', BAJA:'#6b7280' };
const CASO_ESTADO_COLORS = {
  'Nuevo':'#3b82f6','En proceso':'#10b981',
  'Audiencia próxima':'#f59e0b','Sentencia':'#8b5cf6','Cerrado':'#6b7280',
};

// ─── Claude AI helper ─────────────────────────────────────────────────────────

async function callClaude(prompt, maxTokens = 2048) {
  let text = '';
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-6',
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

function parseJson(raw) {
  if (!raw) return null;
  // 1. Intento directo
  try { return JSON.parse(raw.trim()); } catch {}
  // 2. Strip markdown fences (en cualquier lugar del string)
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // 3. Extraer el primer objeto JSON por posición de llaves
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(stripped.substring(start, end + 1)); } catch {}
  }
  console.error('[Admin] parseJson falló. Raw response:', raw.substring(0, 500));
  return null;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const BASE_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1729;--bg2:#1a2744;
  --gold:#c9a84c;--gold-l:#e8c96a;
  --glass:rgba(255,255,255,0.08);--glass-h:rgba(255,255,255,0.12);
  --border:rgba(255,255,255,0.15);--border-s:rgba(255,255,255,0.25);
  --t1:#f1f5f9;--t2:#94a3b8;--t3:#64748b;
  --shadow:0 8px 32px rgba(0,0,0,0.35);--shadow-s:0 4px 16px rgba(0,0,0,0.2);
  --r:16px;--rs:10px;--sw:240px;
}
body{font-family:'Inter',system-ui,sans-serif;background:linear-gradient(135deg,var(--bg) 0%,var(--bg2) 100%);background-attachment:fixed;color:var(--t1);min-height:100vh}
a{color:var(--gold);text-decoration:none}a:hover{color:var(--gold-l)}
/* Layout */
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sw);background:rgba(10,17,35,0.92);backdrop-filter:blur(24px);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:100;transition:transform .3s ease}
.sidebar-logo{padding:28px 24px 20px;border-bottom:1px solid var(--border)}
.sidebar-logo .icon{font-size:38px;display:block;margin-bottom:10px}
.sidebar-logo .name{font-size:14px;font-weight:600;color:var(--gold);line-height:1.3}
.sidebar-logo .sub{font-size:11px;color:var(--t3);margin-top:3px}
.sidebar-nav{padding:20px 12px;flex:1}
.nav-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--rs);color:var(--t2);font-size:14px;font-weight:500;transition:all .2s;margin-bottom:4px;text-decoration:none;border:1px solid transparent}
.nav-item:hover{background:var(--glass);color:var(--t1)}
.nav-item.active{background:rgba(201,168,76,0.14);color:var(--gold);border-color:rgba(201,168,76,0.25)}
.nav-item .ni{font-size:18px}
.sidebar-footer{padding:16px 24px;border-top:1px solid var(--border);font-size:11px;color:var(--t3)}
.main-content{margin-left:var(--sw);flex:1;min-width:0}
.page-header{padding:28px 32px 20px;border-bottom:1px solid var(--border);background:rgba(10,17,35,0.6);backdrop-filter:blur(12px);position:sticky;top:0;z-index:50}
.page-title{font-size:22px;font-weight:700}
.page-subtitle{font-size:13px;color:var(--t3);margin-top:2px}
/* Cards */
.card{background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:24px;margin-bottom:20px;animation:fiu .4s ease both}
@keyframes fiu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
/* Stats */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:24px 32px}
.stat-card{background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow-s);padding:20px 24px;animation:fiu .4s ease both}
.stat-card:nth-child(1){animation-delay:.05s}.stat-card:nth-child(2){animation-delay:.1s}.stat-card:nth-child(3){animation-delay:.15s}.stat-card:nth-child(4){animation-delay:.2s}.stat-card:nth-child(5){animation-delay:.25s}.stat-card:nth-child(6){animation-delay:.3s}
.stat-icon{font-size:28px;margin-bottom:10px;display:block}
.stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);margin-bottom:4px}
.stat-value{font-size:36px;font-weight:700;line-height:1}
/* Table */
.table-wrap{padding:0 32px 32px;overflow-x:auto}
table{width:100%;border-collapse:collapse;background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow)}
th{background:rgba(255,255,255,0.05);padding:14px 16px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--t3);letter-spacing:.08em;font-weight:600;border-bottom:1px solid var(--border)}
td{padding:13px 16px;border-top:1px solid rgba(255,255,255,0.05);font-size:14px;color:var(--t1)}
tr:hover td{background:rgba(255,255,255,0.04)}
.empty{text-align:center;padding:48px;color:var(--t3)}
/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:var(--rs);font-size:14px;font-weight:500;cursor:pointer;border:none;font-family:'Inter',inherit;transition:all .2s;text-decoration:none;white-space:nowrap}
.btn-primary{background:linear-gradient(135deg,var(--gold) 0%,#b8963e 100%);color:#0f1729;box-shadow:0 4px 15px rgba(201,168,76,0.3)}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(201,168,76,0.45);color:#0f1729}
.btn-glass{background:var(--glass);border:1px solid var(--border);color:var(--t1);backdrop-filter:blur(10px)}
.btn-glass:hover{background:var(--glass-h);border-color:var(--border-s);color:var(--t1);transform:translateY(-1px)}
.btn-green{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;box-shadow:0 4px 12px rgba(16,185,129,0.3)}
.btn-green:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(16,185,129,0.4);color:#fff}
.btn-ai{background:linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%);color:#fff;box-shadow:0 4px 12px rgba(124,58,237,0.3)}
.btn-ai:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(124,58,237,0.4);color:#fff}
.btn-sm{padding:5px 12px;font-size:12px}
/* Badges */
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:.02em}
/* Forms */
label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);display:block;margin-bottom:6px;font-weight:500}
input,select,textarea{width:100%;padding:10px 14px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:var(--rs);font-size:14px;font-family:'Inter',inherit;color:var(--t1);transition:border-color .2s,background .2s;-webkit-appearance:none}
select option{background:#1a2744;color:var(--t1)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--gold);background:rgba(255,255,255,0.1)}
input::placeholder,textarea::placeholder{color:var(--t3)}
textarea{resize:vertical;min-height:80px}
.field{margin-bottom:16px}
/* Section title */
.section-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);font-weight:600;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid rgba(201,168,76,0.2)}
/* Filters */
.filters{padding:0 32px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.filters select{width:auto;padding:9px 14px;cursor:pointer;min-width:160px}
/* Grids */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
/* AI panels */
.ai-result{background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:var(--r);padding:20px;margin-top:16px;display:none}
.ai-result.show{display:block;animation:fiu .3s ease}
.task-result{background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:var(--r);padding:20px;margin-top:16px;display:none}
.task-result.show{display:block;animation:fiu .3s ease}
.spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.outline-h{font-size:13px;font-weight:600;color:var(--gold);margin:16px 0 8px;display:flex;align-items:center;gap:6px}
.outline-h:first-child{margin-top:0}
.outline-body{font-size:13px;color:var(--t2);line-height:1.7}
.outline-body ul,.outline-body ol{padding-left:20px}
.outline-body li{margin-bottom:4px}
.task-row{display:flex;gap:10px;margin-bottom:10px;font-size:14px;line-height:1.5}
.task-lbl{font-size:12px;font-weight:600;color:var(--gold);min-width:70px;flex-shrink:0;padding-top:1px}
/* Alert */
.alert-row td{background:rgba(239,68,68,0.08)!important}
.alert-badge{display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
/* Scrollbar */
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}
/* Subheader bar */
.subheader{padding:12px 32px;background:rgba(10,17,35,0.5);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;flex-wrap:wrap}
/* Mobile */
.mobile-top{display:none;padding:14px 16px;background:rgba(10,17,35,0.95);border-bottom:1px solid var(--border);align-items:center;gap:12px;position:sticky;top:0;z-index:60;backdrop-filter:blur(12px)}
.hamburger{background:none;border:none;color:var(--t1);font-size:22px;cursor:pointer;padding:4px;line-height:1}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99}
.overlay.show{display:block}
@media(max-width:900px){
  .sidebar{transform:translateX(-100%)}.sidebar.open{transform:translateX(0)}
  .main-content{margin-left:0}.mobile-top{display:flex}
  .page-header{display:none}.stats-grid{padding:16px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
  .filters,.table-wrap{padding:0 16px 16px}.grid2,.grid3{grid-template-columns:1fr}
  .container-2col{grid-template-columns:1fr!important}
}
/* Container */
.container-2col{display:grid;grid-template-columns:1fr 360px;gap:24px;padding:24px 32px}
@media(max-width:1100px){.container-2col{grid-template-columns:1fr}}
.content-pad{padding:24px 32px}
`;

// ─── Layout wrapper ────────────────────────────────────────────────────────────

function LAYOUT(title, active, content) {
  const estudio = escapeHtml(process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — ${estudio}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
<div class="overlay" id="ovl" onclick="closeSB()"></div>
<aside class="sidebar" id="sb">
  <div class="sidebar-logo">
    <span class="icon">⚖️</span>
    <div class="name">${estudio}</div>
    <div class="sub">Panel de Administración</div>
  </div>
  <nav class="sidebar-nav">
    <a href="/admin" class="nav-item ${active==='leads'?'active':''}"><span class="ni">💬</span> Leads WhatsApp</a>
    <a href="/admin/estudio" class="nav-item ${active==='estudio'?'active':''}"><span class="ni">📁</span> Casos en Estudio</a>
  </nav>
  <div class="sidebar-footer">v2.0 · Panel Jurídico IA</div>
</aside>
<div class="mobile-top">
  <button class="hamburger" onclick="openSB()">☰</button>
  <span style="font-size:20px">⚖️</span>
  <span style="font-size:14px;font-weight:600;color:var(--gold)">${estudio}</span>
</div>
<div class="main-content">
  <div class="page-header">
    <div class="page-title">${escapeHtml(title)}</div>
    <div class="page-subtitle">${estudio}</div>
  </div>
  ${content}
</div>
<script>
function openSB(){document.getElementById('sb').classList.add('open');document.getElementById('ovl').classList.add('show')}
function closeSB(){document.getElementById('sb').classList.remove('open');document.getElementById('ovl').classList.remove('show')}
</script>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /admin ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const sf = req.query.status || '';
  const inf = req.query.intent || '';

  let q = `SELECT l.*,
    (SELECT content    FROM messages WHERE lead_id=l.id ORDER BY created_at DESC LIMIT 1) AS last_message,
    (SELECT created_at FROM messages WHERE lead_id=l.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
    (SELECT COUNT(*)   FROM messages WHERE lead_id=l.id) AS message_count,
    (SELECT id         FROM casos    WHERE lead_id=l.id LIMIT 1) AS caso_id
    FROM leads l WHERE 1=1`;
  const params = [];
  let paramIdx = 0;
  if (sf)  { q += ` AND l.status=$${++paramIdx}`;  params.push(sf); }
  if (inf) { q += ` AND l.intent=$${++paramIdx}`;  params.push(inf); }
  q += ' ORDER BY l.updated_at DESC LIMIT 200';

  const { rows: leads } = await db.query(q, params);
  const stats = await queries.getLeadStats();
  res.send(renderPanel(leads, stats, sf, inf));
});

// ─── POST /admin/lead/:id/pasar-a-estudio (con relleno IA) ───────────────────

router.post('/lead/:id/pasar-a-estudio', async (req, res) => {
  const { rows: leadRows } = await db.query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
  const lead = leadRows[0];
  if (!lead) return res.status(404).send('Lead no encontrado.');

  const { rows: existingRows } = await db.query('SELECT id FROM casos WHERE lead_id=$1', [lead.id]);
  const existing = existingRows[0];
  if (existing) return res.redirect(`/admin/estudio/${existing.id}`);

  const expediente = await generarExpediente();
  const tipoMap = {
    CONSULTA_LABORAL:'Laboral', CONSULTA_FAMILIA:'Familia', CONSULTA_CIVIL:'Civil',
    CONSULTA_SUCESIONES:'Sucesiones', CONSULTA_PREVISIONAL:'Previsional',
    CONSULTA_ADMINISTRATIVO:'Administrativo', CONSULTA_ACCIDENTE:'Accidente de tránsito',
  };

  // Obtener conversación para análisis IA
  const { rows: mensajes } = await db.query(
    'SELECT direction, content FROM messages WHERE lead_id=$1 ORDER BY created_at ASC',
    [lead.id]
  );

  // Campos base
  let fields = {
    nombre:    lead.name || `Sin nombre (${lead.phone})`,
    tipo_caso: tipoMap[lead.intent] || lead.intent || 'Sin clasificar',
    actor: null, demandado: null, resumen: null,
    honorarios: null,
  };

  // Intentar rellenar con IA si hay conversación
  if (mensajes.length > 0) {
    try {
      const conv = mensajes.map(m =>
        `[${m.direction === 'inbound' ? 'Cliente' : 'Bot'}]: ${m.content}`
      ).join('\n');

      const prompt = `Analizá esta conversación de WhatsApp de un estudio jurídico argentino y extraé en JSON: nombre_cliente, tipo_caso, partes {actor, demandado}, resumen_caso, hechos_relevantes[], documentos_mencionados[], honorarios_discutidos. Si no hay datos suficientes para un campo, ponés null.

CONVERSACIÓN:
${conv}

Respondé SOLO con JSON válido, sin texto adicional ni bloques de código.`;

      const raw = await callClaude(prompt, 1024);
      const data = parseJson(raw);

      if (data) {
        if (data.nombre_cliente)         fields.nombre     = data.nombre_cliente;
        if (data.tipo_caso)              fields.tipo_caso  = data.tipo_caso;
        if (data.partes?.actor)          fields.actor      = data.partes.actor;
        if (data.partes?.demandado)      fields.demandado  = data.partes.demandado;
        if (data.resumen_caso)           fields.resumen    = data.resumen_caso;
        if (data.honorarios_discutidos)  fields.honorarios = String(data.honorarios_discutidos);

        // Agregar hechos y documentos al resumen si existen
        let extra = '';
        if (data.hechos_relevantes?.length)    extra += `\n\nHechos: ${data.hechos_relevantes.join('; ')}`;
        if (data.documentos_mencionados?.length) extra += `\n\nDocumentos: ${data.documentos_mencionados.join(', ')}`;
        if (extra) fields.resumen = (fields.resumen || '') + extra;
        if (fields.honorarios) fields.resumen = (fields.resumen || '') + `\n\nHonorarios discutidos: ${fields.honorarios}`;
      }
    } catch (e) {
      console.error('[Admin] Error IA al crear caso:', e.message);
    }
  }

  const { rows: casoRows } = await db.query(
    `INSERT INTO casos (expediente, lead_id, nombre, telefono, tipo_caso, estado, actor, demandado, resumen)
     VALUES ($1, $2, $3, $4, $5, 'Nuevo', $6, $7, $8) RETURNING id`,
    [expediente, lead.id, fields.nombre, lead.phone, fields.tipo_caso,
     fields.actor, fields.demandado, fields.resumen]
  );
  const newCasoId = casoRows[0].id;

  const notaIA = fields.resumen
    ? 'Caso creado desde lead de WhatsApp. Ficha completada automáticamente con IA.'
    : `Caso creado desde lead de WhatsApp. Intención detectada: ${lead.intent || 'desconocida'}. Notas: ${lead.notes || '—'}`;

  await db.query('INSERT INTO caso_movimientos (caso_id, descripcion) VALUES ($1, $2)', [newCasoId, notaIA]);
  res.redirect(`/admin/estudio/${newCasoId}`);
});

// ─── GET /admin/lead/:id ──────────────────────────────────────────────────────

router.get('/lead/:id', async (req, res) => {
  const { rows: leadRows } = await db.query('SELECT * FROM leads WHERE id=$1', [req.params.id]);
  const lead = leadRows[0];
  if (!lead) return res.status(404).send('Lead no encontrado.');
  const { rows: messages }  = await db.query('SELECT * FROM messages WHERE lead_id=$1 ORDER BY created_at ASC', [lead.id]);
  const { rows: followUps } = await db.query('SELECT * FROM follow_ups WHERE lead_id=$1 ORDER BY created_at DESC', [lead.id]);
  const { rows: casoRows }  = await db.query('SELECT id, expediente FROM casos WHERE lead_id=$1', [lead.id]);
  const caso = casoRows[0];
  res.send(renderLeadDetail(lead, messages, followUps, caso));
});

// ─── GET /admin/estudio ───────────────────────────────────────────────────────

router.get('/estudio', async (req, res) => {
  const ef = req.query.estado || '';
  const tf = req.query.tipo   || '';
  let q = 'SELECT * FROM casos WHERE 1=1';
  const params = [];
  let paramIdx = 0;
  if (ef) { q += ` AND estado=$${++paramIdx}`;    params.push(ef); }
  if (tf) { q += ` AND tipo_caso=$${++paramIdx}`; params.push(tf); }
  q += ' ORDER BY updated_at DESC';

  const { rows: casos } = await db.query(q, params);
  const { rows: statsRows } = await db.query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN estado='Nuevo'             THEN 1 ELSE 0 END) AS nuevos,
      SUM(CASE WHEN estado='En proceso'        THEN 1 ELSE 0 END) AS en_proceso,
      SUM(CASE WHEN estado='Audiencia próxima' THEN 1 ELSE 0 END) AS audiencias,
      SUM(CASE WHEN estado='Sentencia'         THEN 1 ELSE 0 END) AS sentencias,
      SUM(CASE WHEN estado='Cerrado'           THEN 1 ELSE 0 END) AS cerrados
    FROM casos`);
  const stats = statsRows[0];
  const { rows: tipoRows } = await db.query(
    'SELECT DISTINCT tipo_caso FROM casos WHERE tipo_caso IS NOT NULL ORDER BY tipo_caso'
  );
  const tipos = tipoRows.map(r => r.tipo_caso);
  res.send(renderEstudio(casos, stats, tipos, ef, tf));
});

// ─── GET /admin/estudio/:id ───────────────────────────────────────────────────

router.get('/estudio/:id', async (req, res) => {
  const { rows: casoRows } = await db.query('SELECT * FROM casos WHERE id=$1', [req.params.id]);
  const caso = casoRows[0];
  if (!caso) return res.status(404).send('Caso no encontrado.');
  const { rows: movimientos } = await db.query(
    'SELECT * FROM caso_movimientos WHERE caso_id=$1 ORDER BY fecha DESC', [caso.id]
  );
  const mensajes = caso.lead_id
    ? (await db.query('SELECT * FROM messages WHERE lead_id=$1 ORDER BY created_at ASC', [caso.lead_id])).rows
    : [];
  res.send(renderCasoDetalle(caso, movimientos, mensajes));
});

// ─── POST /admin/estudio/:id/update ──────────────────────────────────────────

router.post('/estudio/:id/update', async (req, res) => {
  const { nombre, telefono, email, dni, domicilio, tipo_caso, estado,
          actor, demandado, terceros, resumen, proxima_accion, proxima_fecha } = req.body;
  await db.query(
    `UPDATE casos SET nombre=$1, telefono=$2, email=$3, dni=$4, domicilio=$5,
     tipo_caso=$6, estado=$7, actor=$8, demandado=$9, terceros=$10,
     resumen=$11, proxima_accion=$12, proxima_fecha=$13, updated_at=NOW()
     WHERE id=$14`,
    [nombre, telefono, email, dni, domicilio, tipo_caso, estado, actor,
     demandado, terceros, resumen, proxima_accion, proxima_fecha || null, req.params.id]
  );
  res.redirect(`/admin/estudio/${req.params.id}`);
});

// ─── POST /admin/estudio/:id/movimiento ──────────────────────────────────────

router.post('/estudio/:id/movimiento', async (req, res) => {
  const { descripcion, fecha } = req.body;
  if (!descripcion?.trim()) return res.redirect(`/admin/estudio/${req.params.id}`);
  await db.query(
    'INSERT INTO caso_movimientos (caso_id, descripcion, fecha) VALUES ($1, $2, $3)',
    [req.params.id, descripcion.trim(), fecha || new Date().toISOString()]
  );
  await db.query('UPDATE casos SET updated_at=NOW() WHERE id=$1', [req.params.id]);
  res.redirect(`/admin/estudio/${req.params.id}#movimientos`);
});

// ─── POST /admin/estudio/:id/generar-outline (IA) ────────────────────────────

router.post('/estudio/:id/generar-outline', async (req, res) => {
  const { rows: casoRows } = await db.query('SELECT * FROM casos WHERE id=$1', [req.params.id]);
  const caso = casoRows[0];
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado.' });

  const prompt = `Sos un abogado experto en derecho argentino (Buenos Aires y Misiones).
Analizá el siguiente caso y generá un outline estratégico completo.

Expediente: ${caso.expediente}
Tipo de caso: ${caso.tipo_caso || 'No especificado'}
Estado procesal: ${caso.estado}
Actor/Requirente: ${caso.actor || 'No especificado'}
Demandado: ${caso.demandado || 'No especificado'}
Terceros: ${caso.terceros || 'Ninguno'}
Resumen: ${caso.resumen || 'No disponible'}

Respondé SOLO con JSON válido (sin bloques de código):
{
  "encuadre_legal": "descripción del encuadre jurídico aplicable",
  "articulos_aplicables": ["Artículo X Ley Y — descripción breve"],
  "estrategia_procesal": ["Paso 1: ...", "Paso 2: ..."],
  "documentacion_necesaria": ["Documento 1", "Documento 2"],
  "posibles_obstaculos": ["Obstáculo 1", "Obstáculo 2"],
  "estimacion_duracion": "estimación realista de duración del proceso"
}`;

  try {
    const raw  = await callClaude(prompt, 2048);
    const data = parseJson(raw);
    if (!data) {
      console.error('[Admin] outline parse falló. Raw:', raw);
      return res.status(500).json({ error: 'No se pudo parsear la respuesta de IA.', raw });
    }
    res.json(data);
  } catch (e) {
    console.error('[Admin] outline error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /admin/estudio/:id/sugerir-tarea (IA) ──────────────────────────────

router.post('/estudio/:id/sugerir-tarea', async (req, res) => {
  const { rows: casoRows } = await db.query('SELECT * FROM casos WHERE id=$1', [req.params.id]);
  const caso = casoRows[0];
  if (!caso) return res.status(404).json({ error: 'Caso no encontrado.' });

  const { rows: movs } = await db.query(
    'SELECT descripcion, fecha FROM caso_movimientos WHERE caso_id=$1 ORDER BY fecha DESC LIMIT 5',
    [caso.id]
  );
  const historial = movs.map(m => `- [${m.fecha?.substring(0,10)||'?'}] ${m.descripcion}`).join('\n') || 'Sin movimientos';

  const hoy = new Date().toISOString().substring(0, 10);

  const prompt = `Sos un abogado experto en el Código Procesal Civil y Comercial de la Provincia de Misiones (Ley 2.269 y modificatorias), el Código Procesal Laboral de Misiones (Ley 2.993), el Código Civil y Comercial de la Nación (CCyCN) y la Ley de Contrato de Trabajo (LCT).

Analizá el siguiente expediente y determiná la PRÓXIMA ACCIÓN PROCESAL concreta que debe realizar el abogado, con su plazo legal y fecha de vencimiento calculada desde hoy.

Expediente: ${caso.expediente}
Tipo de caso: ${caso.tipo_caso || 'No especificado'}
Estado procesal actual: ${caso.estado}
Actor: ${caso.actor || 'No especificado'}
Demandado: ${caso.demandado || 'No especificado'}
Resumen: ${caso.resumen || 'No disponible'}
Última acción registrada: ${caso.proxima_accion || 'Ninguna'}
Historial reciente:
${historial}
Fecha de hoy: ${hoy}

Calculá la fecha de vencimiento sumando los días hábiles judiciales desde hoy (excluí sábados y domingos; los feriados nacionales fijos de Argentina como 1 ene, Carnaval, 24 mar, 2 abr, 1 may, 25 may, 20 jun, 9 jul, 17 ago, 12 oct, 20 nov, 8 dic, 25 dic también se excluyen).

Respondé SOLO con JSON válido (sin bloques de código):
{
  "accion": "descripción clara y concreta de la próxima acción procesal",
  "plazo_dias_habiles": número entero (días hábiles para realizar la acción),
  "fecha_vencimiento": "YYYY-MM-DD",
  "norma_aplicable": "Art. X del CPCC Misiones / LCT / CCyCN / etc.",
  "explicacion": "breve explicación del por qué esta es la próxima acción"
}`;

  try {
    const raw  = await callClaude(prompt, 1024);
    const data = parseJson(raw);
    if (!data) return res.status(500).json({ error: 'No se pudo parsear la respuesta de IA.', raw });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /admin/estudio/:id/guardar-tarea ────────────────────────────────────

router.post('/estudio/:id/guardar-tarea', async (req, res) => {
  const { proxima_accion, proxima_fecha } = req.body;
  await db.query(
    'UPDATE casos SET proxima_accion=$1, proxima_fecha=$2, updated_at=NOW() WHERE id=$3',
    [proxima_accion || null, proxima_fecha || null, req.params.id]
  );
  await db.query(
    'INSERT INTO caso_movimientos (caso_id, descripcion) VALUES ($1, $2)',
    [req.params.id, `Próxima acción sugerida por IA: ${proxima_accion}${proxima_fecha ? ' (vence ' + proxima_fecha + ')' : ''}`]
  );
  res.json({ ok: true });
});

// ─── GET /admin/api/stats ─────────────────────────────────────────────────────

router.get('/api/stats', async (req, res) => res.json(await queries.getLeadStats()));

// ═══════════════════════════════════════════════════════════════════════════════
// HTML RENDERERS
// ═══════════════════════════════════════════════════════════════════════════════

function renderPanel(leads, stats, sf, inf) {
  const rows = leads.map(l => `
    <tr>
      <td><a href="/admin/lead/${l.id}" style="color:var(--gold);font-weight:500">${escapeHtml(l.phone)}</a></td>
      <td>${escapeHtml(l.name||'—')}</td>
      <td style="font-size:13px">${INTENT_LABELS[l.intent]||l.intent||'—'}</td>
      <td><span class="badge" style="background:${STATUS_COLORS[l.status]||'#999'}22;color:${STATUS_COLORS[l.status]||'#999'};border:1px solid ${STATUS_COLORS[l.status]||'#999'}44">${l.status}</span></td>
      <td><span style="color:${PRIORITY_COLORS[l.priority]||'#999'};font-weight:600;font-size:13px">${l.priority||'—'}</span></td>
      <td style="color:var(--t2);font-size:13px">${l.message_count}</td>
      <td style="color:var(--t2);font-size:13px;max-width:180px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${escapeHtml(l.last_message||'—')}</td>
      <td style="color:var(--t3);font-size:12px">${l.last_message_at?l.last_message_at.substring(0,16):'—'}</td>
      <td>
        ${l.caso_id
          ? `<a href="/admin/estudio/${l.caso_id}" class="btn btn-sm btn-glass">📁 Ver caso</a>`
          : `<form method="POST" action="/admin/lead/${l.id}/pasar-a-estudio" style="display:inline">
               <button type="submit" class="btn btn-sm btn-green">✨ Pasar a Estudio</button>
             </form>`}
      </td>
    </tr>`).join('');

  const content = `
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-icon">👥</span><div class="stat-label">Total</div><div class="stat-value">${stats.total}</div></div>
      <div class="stat-card"><span class="stat-icon">🆕</span><div class="stat-label">Nuevos</div><div class="stat-value" style="color:#3b82f6">${stats.nuevos}</div></div>
      <div class="stat-card"><span class="stat-icon">🔥</span><div class="stat-label">Activos</div><div class="stat-value" style="color:#10b981">${stats.activos}</div></div>
      <div class="stat-card"><span class="stat-icon">🔄</span><div class="stat-label">Seguimiento</div><div class="stat-value" style="color:#f59e0b">${stats.seguimiento}</div></div>
      <div class="stat-card"><span class="stat-icon">🚨</span><div class="stat-label">Alta prioridad</div><div class="stat-value" style="color:#ef4444">${stats.alta_prioridad}</div></div>
      <div class="stat-card"><span class="stat-icon">⚖️</span><div class="stat-label">Req. abogado</div><div class="stat-value" style="color:#7c3aed">${stats.requieren_abogado}</div></div>
    </div>

    <form class="filters" method="GET" action="/admin">
      <select name="status">
        <option value="" ${!sf?'selected':''}>Todos los estados</option>
        <option value="nuevo"       ${sf==='nuevo'?'selected':''}>Nuevo</option>
        <option value="activo"      ${sf==='activo'?'selected':''}>Activo</option>
        <option value="seguimiento" ${sf==='seguimiento'?'selected':''}>Seguimiento</option>
        <option value="cerrado"     ${sf==='cerrado'?'selected':''}>Cerrado</option>
      </select>
      <select name="intent">
        <option value="" ${!inf?'selected':''}>Todas las intenciones</option>
        ${Object.entries(INTENT_LABELS).map(([k,v]) =>
          `<option value="${k}" ${inf===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <button type="submit" class="btn btn-primary">Filtrar</button>
      <a href="/admin" class="btn btn-glass">Limpiar</a>
      <span style="margin-left:auto;font-size:13px;color:var(--t3)">${leads.length} lead${leads.length!==1?'s':''}</span>
    </form>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Teléfono</th><th>Nombre</th><th>Intención</th><th>Estado</th>
          <th>Prioridad</th><th>Msgs</th><th>Último mensaje</th><th>Última actividad</th><th>Acción</th>
        </tr></thead>
        <tbody>${rows||`<tr><td colspan="9" class="empty">No hay leads con los filtros seleccionados.</td></tr>`}</tbody>
      </table>
    </div>`;

  return LAYOUT('Leads WhatsApp', 'leads', content);
}

// ─────────────────────────────────────────────────────────────────────────────

function renderEstudio(casos, stats, tipos, ef, tf) {
  const hoy = new Date();

  const rows = casos.map(c => {
    let urgente = false;
    if (c.proxima_fecha && c.estado !== 'Cerrado') {
      const dias = businessDaysBetween(hoy, new Date(c.proxima_fecha + 'T23:59:59'));
      if (dias <= 5 && dias >= 0) urgente = true;
    }
    return `
    <tr class="${urgente?'alert-row':''}">
      <td><a href="/admin/estudio/${c.id}" style="color:var(--gold);font-weight:600">${escapeHtml(c.expediente)}</a></td>
      <td>${escapeHtml(c.nombre)}</td>
      <td style="font-size:13px;color:var(--t2)">${escapeHtml(c.tipo_caso||'—')}</td>
      <td><span class="badge" style="background:${CASO_ESTADO_COLORS[c.estado]||'#999'}22;color:${CASO_ESTADO_COLORS[c.estado]||'#999'};border:1px solid ${CASO_ESTADO_COLORS[c.estado]||'#999'}44">${escapeHtml(c.estado)}</span></td>
      <td style="font-size:13px;color:var(--t3)">${c.created_at.substring(0,10)}</td>
      <td style="font-size:13px">
        ${c.proxima_accion?`<span style="color:var(--t1)">${escapeHtml(c.proxima_accion.substring(0,45))}</span>`:'<span style="color:var(--t3)">—</span>'}
        ${c.proxima_fecha?`<br><span style="font-size:11px;color:${urgente?'#fca5a5':'var(--t3)'}${urgente?'':''}">${c.proxima_fecha.substring(0,10)}</span>`:''}
        ${urgente?`<br><span class="alert-badge">⚠️ Vence pronto</span>`:''}
      </td>
    </tr>`;
  }).join('');

  const content = `
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-icon">📁</span><div class="stat-label">Total</div><div class="stat-value">${stats.total}</div></div>
      <div class="stat-card"><span class="stat-icon">🆕</span><div class="stat-label">Nuevos</div><div class="stat-value" style="color:#3b82f6">${stats.nuevos}</div></div>
      <div class="stat-card"><span class="stat-icon">⚙️</span><div class="stat-label">En proceso</div><div class="stat-value" style="color:#10b981">${stats.en_proceso}</div></div>
      <div class="stat-card"><span class="stat-icon">🏛️</span><div class="stat-label">Audiencias</div><div class="stat-value" style="color:#f59e0b">${stats.audiencias}</div></div>
      <div class="stat-card"><span class="stat-icon">⚖️</span><div class="stat-label">Sentencias</div><div class="stat-value" style="color:#8b5cf6">${stats.sentencias}</div></div>
      <div class="stat-card"><span class="stat-icon">✅</span><div class="stat-label">Cerrados</div><div class="stat-value" style="color:var(--t3)">${stats.cerrados}</div></div>
    </div>

    <form class="filters" method="GET" action="/admin/estudio">
      <select name="estado">
        <option value="" ${!ef?'selected':''}>Todos los estados</option>
        ${['Nuevo','En proceso','Audiencia próxima','Sentencia','Cerrado'].map(e =>
          `<option value="${e}" ${ef===e?'selected':''}>${e}</option>`).join('')}
      </select>
      <select name="tipo">
        <option value="" ${!tf?'selected':''}>Todos los tipos</option>
        ${tipos.map(t=>`<option value="${t}" ${tf===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <button type="submit" class="btn btn-primary">Filtrar</button>
      <a href="/admin/estudio" class="btn btn-glass">Limpiar</a>
      <span style="margin-left:auto;font-size:13px;color:var(--t3)">${casos.length} caso${casos.length!==1?'s':''}</span>
    </form>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Expediente</th><th>Cliente</th><th>Tipo de caso</th>
          <th>Estado</th><th>Fecha inicio</th><th>Próxima acción</th>
        </tr></thead>
        <tbody>${rows||`<tr><td colspan="6" class="empty">No hay casos registrados.</td></tr>`}</tbody>
      </table>
    </div>`;

  return LAYOUT('Casos en Estudio', 'estudio', content);
}

// ─────────────────────────────────────────────────────────────────────────────

function renderCasoDetalle(caso, movimientos, mensajes) {
  const v = val => escapeHtml(val||'');

  const movItems = movimientos.map(m => `
    <div style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="min-width:94px;font-size:12px;color:var(--t3);padding-top:2px;flex-shrink:0">${m.fecha.substring(0,16)}</div>
      <div style="font-size:14px;color:var(--t1);line-height:1.5">${escapeHtml(m.descripcion)}</div>
    </div>`).join('');

  const msgItems = mensajes.map(m => `
    <div style="display:flex;gap:10px;margin-bottom:10px;${m.direction==='outbound'?'flex-direction:row-reverse':''}">
      <div style="width:30px;height:30px;border-radius:50%;background:${m.direction==='inbound'?'rgba(255,255,255,0.1)':'rgba(201,168,76,0.3)'};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">
        ${m.direction==='inbound'?'👤':'🤖'}
      </div>
      <div style="max-width:75%;background:${m.direction==='inbound'?'rgba(255,255,255,0.08)':'rgba(201,168,76,0.15)'};border:1px solid ${m.direction==='inbound'?'rgba(255,255,255,0.12)':'rgba(201,168,76,0.3)'};padding:9px 13px;border-radius:12px">
        <div style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:var(--t1)">${escapeHtml(m.content)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:3px;text-align:right">${m.created_at.substring(0,16)}</div>
      </div>
    </div>`).join('');

  const estadoColor = CASO_ESTADO_COLORS[caso.estado]||'#999';

  const subheader = `
    <div class="subheader">
      <a href="/admin/estudio" class="btn btn-glass btn-sm">← Volver</a>
      <span class="badge" style="background:${estadoColor}22;color:${estadoColor};border:1px solid ${estadoColor}44;font-size:13px">${v(caso.estado)}</span>
      ${caso.lead_id?`<a href="/admin/lead/${caso.lead_id}" class="btn btn-glass btn-sm">💬 Conversación WhatsApp</a>`:''}
      <span style="margin-left:auto;font-size:12px;color:var(--t3)">Creado: ${caso.created_at.substring(0,10)}</span>
    </div>`;

  const mainCol = `
    <!-- Datos del caso -->
    <div class="card">
      <div class="section-title">Datos del caso — ${v(caso.expediente)}</div>
      <form method="POST" action="/admin/estudio/${caso.id}/update">
        <div class="grid2" style="margin-bottom:0">
          <div class="field"><label>Nombre completo</label><input name="nombre" value="${v(caso.nombre)}" required></div>
          <div class="field"><label>Teléfono</label><input name="telefono" value="${v(caso.telefono)}"></div>
        </div>
        <div class="grid3">
          <div class="field"><label>Email</label><input name="email" type="email" value="${v(caso.email)}"></div>
          <div class="field"><label>DNI</label><input name="dni" value="${v(caso.dni)}"></div>
          <div class="field"><label>Domicilio</label><input name="domicilio" value="${v(caso.domicilio)}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Tipo de caso</label>
            <select name="tipo_caso">
              ${['Laboral','Familia','Civil','Sucesiones','Previsional','Administrativo','Accidente de tránsito','Penal','Otro'].map(t =>
                `<option value="${t}" ${caso.tipo_caso===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Estado procesal</label>
            <select name="estado">
              ${['Nuevo','En proceso','Audiencia próxima','Sentencia','Cerrado'].map(e =>
                `<option value="${e}" ${caso.estado===e?'selected':''}>${e}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="section-title">Partes del caso</div>
        <div class="grid3">
          <div class="field"><label>Actor / Requirente</label><input name="actor" value="${v(caso.actor)}"></div>
          <div class="field"><label>Demandado</label><input name="demandado" value="${v(caso.demandado)}"></div>
          <div class="field"><label>Terceros / Otros</label><input name="terceros" value="${v(caso.terceros)}"></div>
        </div>
        <div class="section-title">Resumen del caso</div>
        <div class="field"><textarea name="resumen" rows="4">${v(caso.resumen)}</textarea></div>
        <div class="section-title">Próxima acción</div>
        <div class="grid2" style="margin-bottom:20px">
          <div class="field"><label>Descripción</label><input name="proxima_accion" id="proxima_accion_input" value="${v(caso.proxima_accion)}" placeholder="Ej: Audiencia de conciliación"></div>
          <div class="field"><label>Fecha / Vencimiento</label><input name="proxima_fecha" id="proxima_fecha_input" type="date" value="${caso.proxima_fecha?caso.proxima_fecha.substring(0,10):''}"></div>
        </div>
        <button type="submit" class="btn btn-primary">💾 Guardar cambios</button>
      </form>
    </div>

    <!-- IA: Outline del caso -->
    <div class="card">
      <div class="section-title">🤖 Análisis con Inteligencia Artificial</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-ai" onclick="generarOutline(${caso.id})">📋 Generar Outline del Caso</button>
        <button class="btn btn-primary" onclick="sugerirTarea(${caso.id})">⚡ Sugerir Próxima Tarea</button>
      </div>

      <!-- Outline result -->
      <div class="ai-result" id="outline-panel">
        <div id="outline-loading" class="ai-loading" style="display:none">
          <span class="spinner"></span> Analizando el caso con IA...
        </div>
        <div id="outline-content"></div>
      </div>

      <!-- Task suggestion result -->
      <div class="task-result" id="task-panel">
        <div id="task-loading" style="display:none;color:var(--t2);font-size:14px">
          <span class="spinner"></span> Calculando próxima acción procesal...
        </div>
        <div id="task-content"></div>
        <div id="task-actions" style="display:none;margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="guardarTarea()">💾 Guardar como próxima acción</button>
        </div>
      </div>
    </div>

    <!-- Movimientos -->
    <div class="card" id="movimientos">
      <div class="section-title">Historial de movimientos</div>
      <form method="POST" action="/admin/estudio/${caso.id}/movimiento" style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:end;margin-bottom:20px">
        <div class="field" style="margin:0"><label>Nuevo movimiento</label>
          <input name="descripcion" placeholder="Ej: Se presentó escrito de inicio..." required>
        </div>
        <div class="field" style="margin:0"><label>Fecha</label>
          <input name="fecha" type="datetime-local">
        </div>
        <button type="submit" class="btn btn-primary">+ Agregar</button>
      </form>
      ${movItems||'<p style="color:var(--t3);font-size:13px;text-align:center;padding:24px 0">Sin movimientos registrados.</p>'}
    </div>`;

  const sideCol = mensajes.length > 0 ? `
    <div class="card">
      <div class="section-title">💬 Conversación WhatsApp</div>
      <div style="height:520px;overflow-y:auto;padding:4px">${msgItems}</div>
    </div>` : `
    <div class="card" style="text-align:center;color:var(--t3);padding:40px 20px">
      <div style="font-size:32px;margin-bottom:8px">💬</div>
      <div style="font-size:13px">Sin conversación vinculada</div>
    </div>`;

  const content = `
    ${subheader}
    <div class="container-2col">
      <div>${mainCol}</div>
      <div>${sideCol}</div>
    </div>

    <script>
    let taskSuggestion = null;

    async function generarOutline(id) {
      const panel = document.getElementById('outline-panel');
      const loading = document.getElementById('outline-loading');
      const content = document.getElementById('outline-content');
      panel.classList.add('show');
      loading.style.display = 'flex';
      content.innerHTML = '';
      try {
        const r = await fetch('/admin/estudio/' + id + '/generar-outline', {method:'POST'});
        const d = await r.json();
        if (d.error) { content.innerHTML = '<p style="color:#f87171">Error: '+escHtml(d.error)+'</p>'; return; }
        content.innerHTML = renderOutline(d);
      } catch(e) {
        content.innerHTML = '<p style="color:#f87171">Error de red: '+e.message+'</p>';
      } finally {
        loading.style.display = 'none';
      }
    }

    function renderOutline(d) {
      const list = (arr) => arr&&arr.length ? '<ul class="outline-body"><li>'+arr.map(escHtml).join('</li><li>')+'</li></ul>' : '<p class="outline-body">—</p>';
      return \`
        <div class="outline-h">📌 Encuadre Legal</div>
        <p class="outline-body">\${escHtml(d.encuadre_legal||'')}</p>
        <div class="outline-h">📖 Artículos aplicables</div>
        \${list(d.articulos_aplicables)}
        <div class="outline-h">🗺️ Estrategia procesal</div>
        <ol class="outline-body" style="padding-left:20px">\${(d.estrategia_procesal||[]).map(s=>'<li style="margin-bottom:6px">'+escHtml(s)+'</li>').join('')}</ol>
        <div class="outline-h">📂 Documentación necesaria</div>
        \${list(d.documentacion_necesaria)}
        <div class="outline-h">⚠️ Posibles obstáculos</div>
        \${list(d.posibles_obstaculos)}
        <div class="outline-h">⏱️ Estimación de duración</div>
        <p class="outline-body">\${escHtml(d.estimacion_duracion||'')}</p>
      \`;
    }

    async function sugerirTarea(id) {
      const panel = document.getElementById('task-panel');
      const loading = document.getElementById('task-loading');
      const content = document.getElementById('task-content');
      const actions = document.getElementById('task-actions');
      panel.classList.add('show');
      loading.style.display = 'block';
      content.innerHTML = '';
      actions.style.display = 'none';
      taskSuggestion = null;
      try {
        const r = await fetch('/admin/estudio/' + id + '/sugerir-tarea', {method:'POST'});
        const d = await r.json();
        if (d.error) { content.innerHTML = '<p style="color:#f87171">Error: '+escHtml(d.error)+'</p>'; return; }
        taskSuggestion = d;
        content.innerHTML = \`
          <div class="task-row"><span class="task-lbl">📋 Acción:</span> <span>\${escHtml(d.accion||'')}</span></div>
          <div class="task-row"><span class="task-lbl">⏱ Plazo:</span> <span>\${d.plazo_dias_habiles} días hábiles</span></div>
          <div class="task-row"><span class="task-lbl">📅 Vence:</span> <span style="color:var(--gold);font-weight:600">\${escHtml(d.fecha_vencimiento||'')}</span></div>
          <div class="task-row"><span class="task-lbl">📖 Norma:</span> <span style="color:var(--t2)">\${escHtml(d.norma_aplicable||'')}</span></div>
          \${d.explicacion?'<div class="task-row" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1)"><span class="task-lbl">💡 Por qué:</span> <span style="color:var(--t2)">'+escHtml(d.explicacion)+'</span></div>':''}
        \`;
        actions.style.display = 'block';
      } catch(e) {
        content.innerHTML = '<p style="color:#f87171">Error de red: '+e.message+'</p>';
      } finally {
        loading.style.display = 'none';
      }
    }

    async function guardarTarea() {
      if (!taskSuggestion) return;
      const btn = document.querySelector('#task-actions button');
      btn.disabled = true;
      btn.textContent = 'Guardando...';
      // Fill the form fields too
      const inputAccion = document.getElementById('proxima_accion_input');
      const inputFecha  = document.getElementById('proxima_fecha_input');
      if (inputAccion) inputAccion.value = taskSuggestion.accion || '';
      if (inputFecha  && taskSuggestion.fecha_vencimiento) inputFecha.value = taskSuggestion.fecha_vencimiento;

      try {
        const fd = new FormData();
        fd.append('proxima_accion', taskSuggestion.accion||'');
        fd.append('proxima_fecha', taskSuggestion.fecha_vencimiento||'');
        const r = await fetch('/admin/estudio/${caso.id}/guardar-tarea', {method:'POST', body: fd});
        const d = await r.json();
        if (d.ok) {
          btn.textContent = '✅ Guardado';
          btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
        }
      } catch(e) {
        btn.textContent = 'Error al guardar';
        btn.disabled = false;
      }
    }

    function escHtml(s) {
      if (!s) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    </script>`;

  return LAYOUT(`${v(caso.expediente)} — ${v(caso.nombre)}`, 'estudio', content);
}

// ─────────────────────────────────────────────────────────────────────────────

function renderLeadDetail(lead, messages, followUps, caso) {
  const msgItems = messages.map(m => `
    <div style="display:flex;gap:10px;margin-bottom:10px;${m.direction==='outbound'?'flex-direction:row-reverse':''}">
      <div style="width:32px;height:32px;border-radius:50%;background:${m.direction==='inbound'?'rgba(255,255,255,0.1)':'rgba(201,168,76,0.25)'};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">
        ${m.direction==='inbound'?'👤':'🤖'}
      </div>
      <div style="max-width:75%;background:${m.direction==='inbound'?'rgba(255,255,255,0.07)':'rgba(201,168,76,0.13)'};border:1px solid ${m.direction==='inbound'?'rgba(255,255,255,0.1)':'rgba(201,168,76,0.25)'};padding:9px 13px;border-radius:12px">
        <div style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:var(--t1)">${escapeHtml(m.content)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:3px;text-align:right">${m.created_at.substring(0,16)}${m.intent?` · ${m.intent}`:''}</div>
      </div>
    </div>`).join('');

  const fuItems = followUps.map(f => `
    <div style="padding:8px 12px;border-left:3px solid ${f.status==='sent'?'#10b981':f.status==='cancelled'?'#6b7280':'#f59e0b'};margin-bottom:8px;background:rgba(255,255,255,0.04);border-radius:0 8px 8px 0">
      <div style="font-size:13px;color:var(--t1)">${escapeHtml(f.message.substring(0,80))}...</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">📅 ${f.scheduled_at.substring(0,16)} · <span style="font-weight:600;color:${f.status==='sent'?'#10b981':f.status==='cancelled'?'#6b7280':'#f59e0b'}">${f.status}</span></div>
    </div>`).join('');

  const subheader = `
    <div class="subheader">
      <a href="/admin" class="btn btn-glass btn-sm">← Volver</a>
      <span style="font-weight:600">${escapeHtml(lead.name||'Sin nombre')}</span>
      <span style="color:var(--t2);font-size:13px">${escapeHtml(lead.phone)}</span>
      ${caso
        ? `<a href="/admin/estudio/${caso.id}" class="btn btn-glass btn-sm" style="margin-left:auto">📁 ${escapeHtml(caso.expediente)}</a>`
        : `<form method="POST" action="/admin/lead/${lead.id}/pasar-a-estudio" style="margin-left:auto">
             <button type="submit" class="btn btn-green btn-sm">✨ Pasar a Estudio con IA</button>
           </form>`}
    </div>`;

  const content = `
    ${subheader}
    <div class="container-2col">
      <div>
        <div class="card">
          <div class="section-title">💬 Conversación</div>
          <div style="height:500px;overflow-y:auto;padding:4px">
            ${msgItems||'<p style="color:var(--t3);text-align:center;padding:32px">Sin mensajes</p>'}
          </div>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <div class="section-title">📋 Datos del lead</div>
          <div class="field"><label>Teléfono</label><span style="font-size:14px;font-weight:500;color:var(--t1)">${escapeHtml(lead.phone)}</span></div>
          <div class="field"><label>Nombre</label><span style="font-size:14px;font-weight:500;color:var(--t1)">${escapeHtml(lead.name||'—')}</span></div>
          <div class="field"><label>Intención</label><span style="font-size:14px">${INTENT_LABELS[lead.intent]||lead.intent||'—'}</span></div>
          <div class="field"><label>Estado</label><span class="badge" style="background:${STATUS_COLORS[lead.status]||'#999'}22;color:${STATUS_COLORS[lead.status]||'#999'};border:1px solid ${STATUS_COLORS[lead.status]||'#999'}44">${lead.status}</span></div>
          <div class="field"><label>Prioridad</label><span style="color:${PRIORITY_COLORS[lead.priority]||'#999'};font-weight:600">${lead.priority||'—'}</span></div>
          <div class="field"><label>Req. abogado</label><span>${lead.needs_lawyer?'✅ Sí':'❌ No'}</span></div>
          <div class="field"><label>Notas</label><span style="font-size:13px;color:var(--t2)">${escapeHtml(lead.notes||'—')}</span></div>
          <div class="field"><label>Creado</label><span style="font-size:13px;color:var(--t2)">${lead.created_at.substring(0,16)}</span></div>
        </div>
        <div class="card">
          <div class="section-title">🔔 Follow-ups</div>
          ${fuItems||'<p style="color:var(--t3);font-size:13px">Sin follow-ups programados</p>'}
        </div>
      </div>
    </div>`;

  return LAYOUT(`${escapeHtml(lead.name||lead.phone)} — Lead`, 'leads', content);
}

module.exports = router;
