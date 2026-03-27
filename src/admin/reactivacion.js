'use strict';

const express = require('express');
const pool    = require('../db/database');
const { analizarChats, estado: analyzeState } = require('../scripts/analizar-chats');
const { importarHistorico }   = require('../scripts/importar-historico');
const { procesarSiguienteEnvio, getColaStats } = require('../scheduler/reactivacionQueue');
const { sendWhatsAppMessage } = require('../handlers/messageHandler');

require('dotenv').config();

const router = express.Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── Auth (mismo patrón que panel.js) ─────────────────────────────────────────

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
router.use(express.json({ limit: '50mb' }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const CAT_CONFIG = {
  A: { label: 'Cliente caliente',      color: '#ef4444', dot: '🔴', desc: 'Mostró interés, casi cerró' },
  B: { label: 'Consulta sin cierre',   color: '#f59e0b', dot: '🟡', desc: 'Consulta sin next step' },
  C: { label: 'Caso en curso',         color: '#10b981', dot: '🟢', desc: 'Ya es cliente activo' },
  D: { label: 'Cerrado negativamente', color: '#374151', dot: '⚫', desc: 'No interesado / tiene abogado' },
  E: { label: 'Sin contexto',          color: '#3b82f6', dot: '🔵', desc: 'Chat mínimo o sin historial' },
  F: { label: 'Inactivo largo plazo',  color: '#9ca3af', dot: '⚪', desc: 'Inactivo más de 6 meses' },
};

const PRIO_CONFIG = {
  1: { label: 'Urgente', color: '#ef4444' },
  2: { label: 'Normal',  color: '#f59e0b' },
  3: { label: 'Baja',    color: '#6b7280' },
};

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1729;--bg2:#1a2744;
  --gold:#c9a84c;--gold-l:#e8c96a;
  --glass:rgba(255,255,255,0.08);--glass-h:rgba(255,255,255,0.12);
  --border:rgba(255,255,255,0.15);--border-s:rgba(255,255,255,0.25);
  --t1:#f1f5f9;--t2:#94a3b8;--t3:#64748b;
  --shadow:0 8px 32px rgba(0,0,0,0.35);--r:16px;--rs:10px;--sw:240px;
}
body{font-family:'Inter',system-ui,sans-serif;background:linear-gradient(135deg,var(--bg) 0%,var(--bg2) 100%);background-attachment:fixed;color:var(--t1);min-height:100vh}
a{color:var(--gold);text-decoration:none}a:hover{color:var(--gold-l)}
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sw);background:rgba(10,17,35,0.92);backdrop-filter:blur(24px);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:100}
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
.card{background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);padding:24px;margin-bottom:20px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;padding:24px 32px}
.stat-card{background:var(--glass);border:1px solid var(--border);border-radius:var(--r);padding:18px 20px}
.stat-icon{font-size:24px;margin-bottom:8px;display:block}
.stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--t3);margin-bottom:4px}
.stat-value{font-size:30px;font-weight:700;line-height:1}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:var(--rs);font-size:14px;font-weight:500;cursor:pointer;border:none;font-family:'Inter',inherit;transition:all .2s;text-decoration:none;white-space:nowrap}
.btn-primary{background:linear-gradient(135deg,var(--gold) 0%,#b8963e 100%);color:#0f1729}
.btn-primary:hover{transform:translateY(-1px);color:#0f1729}
.btn-glass{background:var(--glass);border:1px solid var(--border);color:var(--t1)}
.btn-glass:hover{background:var(--glass-h);border-color:var(--border-s);color:var(--t1)}
.btn-green{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff}
.btn-red{background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);color:#fff}
.btn-sm{padding:5px 12px;font-size:12px}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
table{width:100%;border-collapse:collapse;background:var(--glass);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
th{background:rgba(255,255,255,0.05);padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--t3);letter-spacing:.08em;font-weight:600;border-bottom:1px solid var(--border)}
td{padding:11px 14px;border-top:1px solid rgba(255,255,255,0.05);font-size:13px;color:var(--t1);vertical-align:middle}
tr:hover td{background:rgba(255,255,255,0.03)}
.filters{padding:0 32px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
select,input{padding:8px 12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:var(--rs);font-size:13px;color:var(--t1);font-family:'Inter',inherit;-webkit-appearance:none}
select option{background:#1a2744}
input[type=checkbox]{width:16px;height:16px;cursor:pointer;accent-color:var(--gold)}
.table-wrap{padding:0 32px 32px;overflow-x:auto}
.bulk-bar{padding:12px 32px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:var(--rs);margin:0 32px 16px;display:none;align-items:center;gap:12px}
.bulk-bar.show{display:flex}
.queue-bar{padding:14px 32px;background:rgba(16,185,129,0.06);border-top:1px solid var(--border);font-size:13px;color:var(--t2);display:flex;align-items:center;gap:16px}
.progress-bar{height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:8px}
.progress-fill{height:100%;background:var(--gold);border-radius:2px;transition:width .3s}
.spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:900px){.sidebar{display:none}.main-content{margin-left:0}.stats-grid,.filters,.table-wrap,.bulk-bar{padding-left:16px;padding-right:16px}}
`;

function LAYOUT(title, content) {
  const estudio = escapeHtml(process.env.ESTUDIO_NOMBRE || 'Estudio Jurídico');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — ${estudio}</title>
  <style>${STYLES}</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <span class="icon">⚖️</span>
      <div class="name">${estudio}</div>
      <div class="sub">Panel de Administración</div>
    </div>
    <nav class="sidebar-nav">
      <a href="/admin" class="nav-item"><span class="ni">💬</span> Leads WhatsApp</a>
      <a href="/admin/estudio" class="nav-item"><span class="ni">📁</span> Casos en Estudio</a>
      <a href="/admin/reactivacion" class="nav-item active"><span class="ni">📣</span> Reactivación</a>
    </nav>
    <div class="sidebar-footer">v2.0 · Panel Jurídico IA</div>
  </aside>
  <div class="main-content">
    <div class="page-header">
      <div class="page-title">${escapeHtml(title)}</div>
      <div class="page-subtitle">${estudio}</div>
    </div>
    ${content}
  </div>
</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /admin/reactivacion ──────────────────────────────────────────────────

router.get('/reactivacion', async (req, res) => {
  const catF  = req.query.cat    || '';
  const prioF = req.query.prio   || '';
  const estF  = req.query.estado || 'pendiente';

  // Stats por categoría
  const { rows: statsRows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE categoria='A') AS cat_a,
      COUNT(*) FILTER (WHERE categoria='B') AS cat_b,
      COUNT(*) FILTER (WHERE categoria='C') AS cat_c,
      COUNT(*) FILTER (WHERE categoria='D') AS cat_d,
      COUNT(*) FILTER (WHERE categoria='E') AS cat_e,
      COUNT(*) FILTER (WHERE categoria='F') AS cat_f,
      COUNT(*) FILTER (WHERE categoria IN ('A','B') AND estado='pendiente') AS recuperables
    FROM reactivacion_leads
  `);
  const stats = statsRows[0];

  // Lista filtrada
  let q = 'SELECT * FROM reactivacion_leads WHERE 1=1';
  const params = [];
  let pi = 0;
  if (catF)  { q += ` AND categoria=$${++pi}`;  params.push(catF); }
  if (prioF) { q += ` AND prioridad=$${++pi}`;  params.push(parseInt(prioF)); }
  if (estF)  { q += ` AND estado=$${++pi}`;     params.push(estF); }
  q += ' ORDER BY prioridad ASC, last_contact_at ASC NULLS LAST LIMIT 500';

  const { rows: leads } = await pool.query(q, params);

  // Cola stats
  const cola = await getColaStats();

  res.send(renderReactivacion(leads, stats, cola, { catF, prioF, estF }));
});

// ─── POST /admin/reactivacion/analizar ───────────────────────────────────────

router.post('/reactivacion/analizar', async (req, res) => {
  const forzar = req.body.forzar === '1';
  const result = await analizarChats({ forzar });
  if (result.error) {
    return res.redirect('/admin/reactivacion?msg=' + encodeURIComponent(result.error));
  }
  res.redirect('/admin/reactivacion?msg=' + encodeURIComponent(
    result.iniciado ? `Análisis iniciado — ${result.total} leads en proceso.` : 'No hay leads nuevos para analizar.'
  ));
});

// ─── GET /admin/reactivacion/api/estado ──────────────────────────────────────

router.get('/reactivacion/api/estado', (req, res) => {
  res.json(analyzeState);
});

// ─── GET /admin/reactivacion/api/cola ────────────────────────────────────────

router.get('/reactivacion/api/cola', async (req, res) => {
  res.json(await getColaStats());
});

// ─── POST /admin/reactivacion/enviar/:id ─────────────────────────────────────

router.post('/reactivacion/enviar/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM reactivacion_leads WHERE id=$1', [req.params.id]);
  const lead = rows[0];
  if (!lead) return res.status(404).json({ error: 'No encontrado.' });

  const mensaje = req.body.mensaje || lead.mensaje_sugerido;
  if (!mensaje) return res.status(400).json({ error: 'Sin mensaje para enviar.' });

  try {
    await sendWhatsAppMessage(lead.phone, mensaje);

    await pool.query(
      "UPDATE reactivacion_leads SET estado='enviado', analizado_at=analizado_at WHERE id=$1",
      [lead.id]
    );
    await pool.query(
      "INSERT INTO reactivacion_envios (reac_id, phone, mensaje, estado, enviado_at) VALUES ($1,$2,$3,'enviado',NOW())",
      [lead.id, lead.phone, mensaje]
    );

    res.json({ ok: true });
  } catch (err) {
    await pool.query(
      "INSERT INTO reactivacion_envios (reac_id, phone, mensaje, estado, error_msg) VALUES ($1,$2,$3,'error',$4)",
      [lead.id, lead.phone, mensaje, err.message]
    );
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin/reactivacion/enviar-masivo ───────────────────────────────────

router.post('/reactivacion/enviar-masivo', async (req, res) => {
  let ids = req.body.ids;
  if (typeof ids === 'string') ids = ids.split(',').map(Number).filter(Boolean);
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No se enviaron IDs.' });
  }

  // Obtener los leads seleccionados con mensaje
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows: leads } = await pool.query(
    `SELECT id, phone, mensaje_sugerido FROM reactivacion_leads
     WHERE id IN (${placeholders}) AND estado='pendiente' AND categoria != 'D'`,
    ids
  );

  if (leads.length === 0) {
    return res.json({ encolados: 0 });
  }

  // Crear entradas en la cola
  let encolados = 0;
  for (const lead of leads) {
    if (!lead.mensaje_sugerido) continue;
    await pool.query(
      'INSERT INTO reactivacion_envios (reac_id, phone, mensaje) VALUES ($1,$2,$3)',
      [lead.id, lead.phone, lead.mensaje_sugerido]
    );
    encolados++;
  }

  res.json({ encolados, total: leads.length });
});

// ─── POST /admin/reactivacion/descartar/:id ───────────────────────────────────

router.post('/reactivacion/descartar/:id', async (req, res) => {
  await pool.query(
    "UPDATE reactivacion_leads SET estado='descartado' WHERE id=$1",
    [req.params.id]
  );
  res.json({ ok: true });
});

// ─── POST /admin/reactivacion/editar-mensaje/:id ─────────────────────────────

router.post('/reactivacion/editar-mensaje/:id', async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje?.trim()) return res.status(400).json({ error: 'Mensaje vacío.' });
  await pool.query(
    'UPDATE reactivacion_leads SET mensaje_sugerido=$1 WHERE id=$2',
    [mensaje.trim(), req.params.id]
  );
  res.json({ ok: true });
});

// ─── POST /admin/reactivacion/queue/run ──────────────────────────────────────

router.post('/reactivacion/queue/run', async (req, res) => {
  const result = await procesarSiguienteEnvio();
  res.json(result);
});

// ─── POST /admin/importar-chats ───────────────────────────────────────────────

router.post('/importar-chats', async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'El body debe ser un array JSON de conversaciones.' });
    }

    // Escribir a archivo temporal y llamar importarHistorico
    const os   = require('os');
    const path = require('path');
    const fs   = require('fs');
    const tmp  = path.join(os.tmpdir(), `import_${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(data));

    const resultado = await importarHistorico(tmp);
    fs.unlinkSync(tmp);

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HTML RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderReactivacion(leads, stats, cola, filters) {
  const { catF, prioF, estF } = filters;
  const msg = ''; // podría venir de query param

  // Stats cards
  const statsHtml = `
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-icon">📊</span><div class="stat-label">Analizados</div><div class="stat-value">${stats.total}</div></div>
      <div class="stat-card"><span class="stat-icon">🔴</span><div class="stat-label">A · Calientes</div><div class="stat-value" style="color:#ef4444">${stats.cat_a}</div></div>
      <div class="stat-card"><span class="stat-icon">🟡</span><div class="stat-label">B · Sin cierre</div><div class="stat-value" style="color:#f59e0b">${stats.cat_b}</div></div>
      <div class="stat-card"><span class="stat-icon">🟢</span><div class="stat-label">C · En curso</div><div class="stat-value" style="color:#10b981">${stats.cat_c}</div></div>
      <div class="stat-card"><span class="stat-icon">⚫</span><div class="stat-label">D · Negativos</div><div class="stat-value" style="color:#6b7280">${stats.cat_d}</div></div>
      <div class="stat-card"><span class="stat-icon">💡</span><div class="stat-label">Recuperables</div><div class="stat-value" style="color:var(--gold)">${stats.recuperables}</div></div>
    </div>`;

  // Panel de análisis + importación
  const analyzePanel = `
    <div class="card" style="margin:0 32px 20px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--gold);margin-bottom:4px">🤖 Análisis con IA</div>
          <div style="font-size:12px;color:var(--t3)">Clasifica automáticamente todos los leads históricos</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <form method="POST" action="/admin/reactivacion/analizar" style="display:inline">
            <input type="hidden" name="forzar" value="0">
            <button type="submit" class="btn btn-primary btn-sm" id="btnAnalizar">📣 Analizar chats nuevos</button>
          </form>
          <form method="POST" action="/admin/reactivacion/analizar" style="display:inline"
            onsubmit="return confirm('¿Re-analizar TODOS los leads? Esto sobrescribirá análisis anteriores.')">
            <input type="hidden" name="forzar" value="1">
            <button type="submit" class="btn btn-glass btn-sm">🔄 Re-analizar todo</button>
          </form>
          <button class="btn btn-glass btn-sm" onclick="document.getElementById('importPanel').style.display=document.getElementById('importPanel').style.display==='none'?'block':'none'">📤 Importar JSON</button>
        </div>
      </div>

      <!-- Progress bar (se muestra cuando hay análisis en curso) -->
      <div id="analyzeProgress" style="display:none;margin-top:16px">
        <div style="font-size:13px;color:var(--t2);margin-bottom:6px">
          <span class="spinner"></span> <span id="analyzeMsg">Analizando...</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
      </div>

      <!-- Panel de importación -->
      <div id="importPanel" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="font-size:12px;color:var(--t3);margin-bottom:10px">
          Formato JSON: array de <code style="color:var(--gold)">[{ phone, name?, messages:[{direction,content,created_at?}] }]</code>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="file" id="importFile" accept=".json" style="flex:1">
          <button class="btn btn-green btn-sm" onclick="importarChats()">📥 Importar</button>
        </div>
        <div id="importResult" style="margin-top:8px;font-size:12px;color:var(--t2)"></div>
      </div>
    </div>`;

  // Filtros
  const filtersHtml = `
    <form class="filters" method="GET" action="/admin/reactivacion">
      <select name="cat">
        <option value="" ${!catF?'selected':''}>Todas las categorías</option>
        ${Object.entries(CAT_CONFIG).map(([k,v]) =>
          `<option value="${k}" ${catF===k?'selected':''}>${v.dot} ${k} — ${v.label}</option>`).join('')}
      </select>
      <select name="prio">
        <option value="" ${!prioF?'selected':''}>Todas las prioridades</option>
        <option value="1" ${prioF==='1'?'selected':''}>🔴 Urgente</option>
        <option value="2" ${prioF==='2'?'selected':''}>🟡 Normal</option>
        <option value="3" ${prioF==='3'?'selected':''}>⚪ Baja</option>
      </select>
      <select name="estado">
        <option value=""          ${estF===''?'selected':''}>Todos los estados</option>
        <option value="pendiente" ${estF==='pendiente'?'selected':''}>⏳ Pendiente</option>
        <option value="enviado"   ${estF==='enviado'?'selected':''}>✅ Enviado</option>
        <option value="descartado"${estF==='descartado'?'selected':''}>🗑️ Descartado</option>
      </select>
      <button type="submit" class="btn btn-primary btn-sm">Filtrar</button>
      <a href="/admin/reactivacion" class="btn btn-glass btn-sm">Limpiar</a>
      <span style="margin-left:auto;font-size:12px;color:var(--t3)">${leads.length} resultado${leads.length!==1?'s':''}</span>
    </form>`;

  // Tabla
  const rows = leads.map(l => {
    const cat  = CAT_CONFIG[l.categoria] || { label: l.categoria, color: '#999', dot: '?' };
    const prio = PRIO_CONFIG[l.prioridad] || PRIO_CONFIG[2];
    const dias = l.last_contact_at
      ? Math.floor((Date.now() - new Date(l.last_contact_at)) / 86400000)
      : '—';

    return `
    <tr id="row-${l.id}">
      <td><input type="checkbox" class="lead-check" value="${l.id}" onchange="updateBulk()"></td>
      <td>
        <div style="font-weight:500">${escapeHtml(l.nombre || l.phone)}</div>
        <div style="font-size:11px;color:var(--t3)">${escapeHtml(l.phone)}</div>
      </td>
      <td>
        <span class="badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">
          ${cat.dot} ${l.categoria} — ${cat.label}
        </span>
      </td>
      <td style="color:var(--t2);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(l.resumen||'')}">
        ${escapeHtml((l.resumen||'—').substring(0,80))}
      </td>
      <td style="color:var(--t3);font-size:12px;text-align:center">${dias}d</td>
      <td><span style="color:${prio.color};font-weight:600;font-size:12px">${prio.label}</span></td>
      <td style="max-width:220px">
        <div id="msg-text-${l.id}" style="font-size:12px;color:var(--t2);line-height:1.4">${escapeHtml((l.mensaje_sugerido||'—').substring(0,100))}</div>
        <div id="msg-edit-${l.id}" style="display:none">
          <textarea id="msg-ta-${l.id}" rows="3" style="width:100%;font-size:12px;margin-bottom:4px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:6px;padding:6px;color:var(--t1);font-family:inherit">${escapeHtml(l.mensaje_sugerido||'')}</textarea>
          <button class="btn btn-green btn-sm" onclick="guardarMensaje(${l.id})">💾 Guardar</button>
          <button class="btn btn-glass btn-sm" onclick="cancelarEdicion(${l.id})">✕</button>
        </div>
      </td>
      <td>
        ${l.estado === 'pendiente' ? `
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn btn-green btn-sm" onclick="enviarAhora(${l.id})">📤 Enviar</button>
            <button class="btn btn-glass btn-sm" onclick="editarMensaje(${l.id})">✏️ Editar</button>
            <button class="btn btn-sm" style="background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.3)" onclick="descartar(${l.id})">🗑️ Descartar</button>
          </div>` :
          `<span style="font-size:12px;color:var(--t3)">${l.estado}</span>`}
      </td>
    </tr>`;
  }).join('');

  const tableHtml = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th><input type="checkbox" id="checkAll" onchange="toggleAll(this.checked)" title="Seleccionar todos"></th>
          <th>Contacto</th><th>Categoría</th><th>Resumen</th>
          <th>Inactivo</th><th>Prioridad</th><th>Mensaje sugerido</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--t3)">Sin resultados para los filtros seleccionados</td></tr>'}</tbody>
      </table>
    </div>`;

  // Bulk bar
  const bulkBar = `
    <div class="bulk-bar" id="bulkBar">
      <span id="bulkCount" style="font-weight:600;color:var(--gold)">0 seleccionados</span>
      <button class="btn btn-green btn-sm" onclick="enviarMasivo()">📤 Enviar seleccionados</button>
      <button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.25)" onclick="descartarMasivo()">🗑️ Descartar seleccionados</button>
      <button class="btn btn-glass btn-sm" onclick="deseleccionarTodo()">✕ Limpiar</button>
    </div>`;

  // Cola bar
  const colaBar = `
    <div class="queue-bar">
      <span>📬 Cola:</span>
      <span id="qPendientes" style="font-weight:600">${cola.pendientes} pendientes</span>
      <span style="color:var(--t3)">·</span>
      <span>✅ ${cola.enviados_hoy}/${cola.limite_diario} enviados hoy</span>
      <span style="color:var(--t3)">·</span>
      <span>${cola.horario_habil ? '🟢 Horario hábil' : '🔴 Fuera de horario'}</span>
      <button class="btn btn-glass btn-sm" style="margin-left:auto" onclick="procesarManual()">▶ Procesar uno ahora</button>
    </div>`;

  // JavaScript
  const js = `
    <script>
    // ── Bulk select ─────────────────────────────────────────────────────────
    function updateBulk() {
      const checked = document.querySelectorAll('.lead-check:checked');
      const bar = document.getElementById('bulkBar');
      const cnt = document.getElementById('bulkCount');
      cnt.textContent = checked.length + ' seleccionado' + (checked.length!==1?'s':'');
      bar.classList.toggle('show', checked.length > 0);
    }
    function toggleAll(val) {
      document.querySelectorAll('.lead-check').forEach(cb => cb.checked = val);
      updateBulk();
    }
    function deseleccionarTodo() {
      document.querySelectorAll('.lead-check').forEach(cb => cb.checked = false);
      document.getElementById('checkAll').checked = false;
      updateBulk();
    }
    function getSelectedIds() {
      return Array.from(document.querySelectorAll('.lead-check:checked')).map(cb => cb.value);
    }

    // ── Envío individual ────────────────────────────────────────────────────
    async function enviarAhora(id) {
      const btn = document.querySelector('#row-'+id+' .btn-green');
      btn.disabled = true; btn.textContent = '⏳ Enviando...';
      const r = await fetch('/admin/reactivacion/enviar/'+id, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
      const d = await r.json();
      if (d.ok) {
        btn.textContent = '✅ Enviado';
        document.querySelector('#row-'+id+' td:last-child').innerHTML = '<span style="font-size:12px;color:var(--t3)">enviado</span>';
      } else {
        btn.textContent = '❌ Error';
        btn.disabled = false;
        alert('Error: ' + (d.error || 'desconocido'));
      }
    }

    // ── Envío masivo ─────────────────────────────────────────────────────────
    async function enviarMasivo() {
      const ids = getSelectedIds();
      if (!ids.length) return;
      if (!confirm('¿Encolar ' + ids.length + ' mensajes? Se enviarán con delay de 2-5 min entre cada uno, respetando el horario hábil.')) return;
      const r = await fetch('/admin/reactivacion/enviar-masivo', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ids })
      });
      const d = await r.json();
      alert('Encolados: ' + d.encolados + ' mensajes.');
      location.reload();
    }

    // ── Descartar ────────────────────────────────────────────────────────────
    async function descartar(id) {
      if (!confirm('¿Descartar este contacto? No se le enviará mensaje.')) return;
      await fetch('/admin/reactivacion/descartar/'+id, {method:'POST'});
      document.getElementById('row-'+id).remove();
    }
    async function descartarMasivo() {
      const ids = getSelectedIds();
      if (!ids.length) return;
      if (!confirm('¿Descartar ' + ids.length + ' contactos?')) return;
      for (const id of ids) {
        await fetch('/admin/reactivacion/descartar/'+id, {method:'POST'});
        const row = document.getElementById('row-'+id);
        if (row) row.remove();
      }
      deseleccionarTodo();
    }

    // ── Editar mensaje ───────────────────────────────────────────────────────
    function editarMensaje(id) {
      document.getElementById('msg-text-'+id).style.display='none';
      document.getElementById('msg-edit-'+id).style.display='block';
    }
    function cancelarEdicion(id) {
      document.getElementById('msg-text-'+id).style.display='block';
      document.getElementById('msg-edit-'+id).style.display='none';
    }
    async function guardarMensaje(id) {
      const msg = document.getElementById('msg-ta-'+id).value.trim();
      if (!msg) return;
      const r = await fetch('/admin/reactivacion/editar-mensaje/'+id, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ mensaje: msg })
      });
      const d = await r.json();
      if (d.ok) {
        document.getElementById('msg-text-'+id).textContent = msg.substring(0,100);
        cancelarEdicion(id);
      }
    }

    // ── Procesar cola manual ─────────────────────────────────────────────────
    async function procesarManual() {
      const r = await fetch('/admin/reactivacion/queue/run', {method:'POST'});
      const d = await r.json();
      const msg = d.enviado ? '✅ Enviado a ' + d.phone
                : d.omitido ? '⏸ Omitido: ' + d.omitido
                : '❌ Error: ' + (d.error||'desconocido');
      alert(msg);
      location.reload();
    }

    // ── Importar JSON ────────────────────────────────────────────────────────
    async function importarChats() {
      const file = document.getElementById('importFile').files[0];
      if (!file) { alert('Seleccioná un archivo JSON primero.'); return; }
      const res = document.getElementById('importResult');
      res.textContent = 'Importando...';
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const r = await fetch('/admin/importar-chats', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(data)
        });
        const d = await r.json();
        if (d.error) { res.textContent = '❌ Error: ' + d.error; return; }
        res.textContent = '✅ Importados: ' + d.leadsCreados + ' nuevos, ' + d.leadsActualizados + ' actualizados, ' + d.mensajesImportados + ' mensajes.';
      } catch(e) {
        res.textContent = '❌ JSON inválido: ' + e.message;
      }
    }

    // ── Polling de análisis ──────────────────────────────────────────────────
    async function checkAnalysisProgress() {
      const r = await fetch('/admin/reactivacion/api/estado');
      const d = await r.json();
      const panel = document.getElementById('analyzeProgress');
      if (d.running) {
        panel.style.display = 'block';
        const pct = d.total > 0 ? Math.round(d.procesados / d.total * 100) : 0;
        document.getElementById('analyzeMsg').textContent =
          'Analizando... ' + d.procesados + '/' + d.total + ' (' + d.errores + ' errores)';
        document.getElementById('progressFill').style.width = pct + '%';
        setTimeout(checkAnalysisProgress, 2000);
      } else if (d.procesados > 0) {
        document.getElementById('analyzeMsg').textContent =
          '✅ Análisis completado: ' + d.procesados + ' procesados';
        document.getElementById('progressFill').style.width = '100%';
      } else {
        panel.style.display = 'none';
      }
    }

    // ── Polling de cola ──────────────────────────────────────────────────────
    async function checkColaProgress() {
      const r = await fetch('/admin/reactivacion/api/cola');
      const d = await r.json();
      const el = document.getElementById('qPendientes');
      if (el) el.textContent = d.pendientes + ' pendientes';
    }

    // Iniciar polling
    checkAnalysisProgress();
    if (${cola.pendientes} > 0) {
      setInterval(checkColaProgress, 10000);
    }
    </script>`;

  const content = statsHtml + analyzePanel + bulkBar + filtersHtml + tableHtml + colaBar + js;
  return LAYOUT('Campaña de Reactivación', content);
}

module.exports = router;
