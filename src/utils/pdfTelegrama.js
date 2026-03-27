'use strict';

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

/**
 * Genera el PDF del Telegrama Ley N° 23.789 (Correo Argentino).
 * @param {Object} datos  - Campos del telegrama (destinatario, remitente, cuerpo, fecha).
 * @param {string} outPath - Ruta absoluta donde guardar el archivo.
 * @returns {Promise<void>}
 */
function generarPdfTelegrama(datos, outPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const ws  = fs.createWriteStream(outPath);
    doc.pipe(ws);

    const W   = doc.page.width;   // 595
    const H   = doc.page.height;  // 842
    const pad = 36;
    const iW  = W - pad * 2;      // inner width

    // ── Outer border ──────────────────────────────────────────────────────────
    doc.rect(pad - 6, pad - 6, iW + 12, H - pad * 2 + 12).lineWidth(1.5).stroke('#000');

    let y = pad + 4;

    // ── Logos (text only) ────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#000')
       .text('M.T.S.S.', pad, y)
       .font('Helvetica').fontSize(6)
       .text('Ministerio de Trabajo,', pad, y + 9)
       .text('Seg. Social y Salud',    pad, y + 15);

    doc.font('Helvetica-Bold').fontSize(7)
       .text('CORREO ARGENTINO', W - pad - 115, y, { width: 110, align: 'right' });
    doc.font('Helvetica').fontSize(6)
       .text('Servicio Oficial de Correos', W - pad - 115, y + 9, { width: 110, align: 'right' });

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#000')
       .text('TELEGRAMA LEY N° 23.789', pad, y, { width: iW, align: 'center' });
    y += 20;
    doc.font('Helvetica').fontSize(10)
       .text('Más de 30 palabras', pad, y, { width: iW, align: 'center' });
    y += 18;

    // Separator
    doc.moveTo(pad - 6, y).lineTo(pad + iW + 6, y).lineWidth(0.6).stroke();
    y += 10;

    // ── Two-column: DESTINATARIO | REMITENTE ─────────────────────────────────
    const colW  = (iW - 16) / 2;
    const col2X = pad + colW + 16;
    const divX  = pad + colW + 8;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
       .text('DESTINATARIO:', pad,   y)
       .text('REMITENTE:',   col2X, y);
    y += 16;

    const rowH = 26;

    function drawField(label, value, x, yy, w) {
      doc.font('Helvetica').fontSize(7).fillColor('#555')
         .text(label + ':', x, yy, { width: w, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor('#000')
         .text(String(value || ''), x, yy + 9, { width: w, lineBreak: false });
      doc.moveTo(x, yy + rowH - 2).lineTo(x + w, yy + rowH - 2).lineWidth(0.25).stroke();
      return yy + rowH;
    }

    const join = (...parts) => parts.filter(Boolean).join(', ');

    let y1 = y, y2 = y;
    y1 = drawField('Apellido y nombre o razón social', datos.destinatario_nombre, pad,   y1, colW);
    y1 = drawField('Ramo o actividad principal',        datos.destinatario_ramo,   pad,   y1, colW);
    y1 = drawField('Domicilio laboral',                 datos.destinatario_domicilio, pad, y1, colW);
    y1 = drawField('Código Postal',                     datos.destinatario_cp,     pad,   y1, colW);
    y1 = drawField('Localidad y Provincia',
      join(datos.destinatario_localidad, datos.destinatario_provincia), pad, y1, colW);

    y2 = drawField('Apellido y nombre',   datos.remitente_nombre,   col2X, y2, colW);
    y2 = drawField('DNI N°',              datos.remitente_dni,      col2X, y2, colW);
    y2 = drawField('Fecha',               datos.fecha || new Date().toLocaleDateString('es-AR'), col2X, y2, colW);
    y2 = drawField('Domicilio real',       datos.remitente_domicilio, col2X, y2, colW);
    y2 = drawField('Código Postal',        datos.remitente_cp,       col2X, y2, colW);
    y2 = drawField('Localidad y Provincia',
      join(datos.remitente_localidad, datos.remitente_provincia), col2X, y2, colW);

    const bottomHeaders = Math.max(y1, y2) + 6;

    // Vertical divider between columns
    doc.moveTo(divX, y - 5).lineTo(divX, bottomHeaders).lineWidth(0.6).stroke();

    // Separator after headers
    doc.moveTo(pad - 6, bottomHeaders).lineTo(pad + iW + 6, bottomHeaders).lineWidth(0.6).stroke();
    y = bottomHeaders + 12;

    // ── Body text ─────────────────────────────────────────────────────────────
    const footerReserve = 62;
    const bodyMaxH = H - pad - footerReserve - y;

    doc.font('Helvetica').fontSize(11).fillColor('#000')
       .text(datos.cuerpo || '', pad, y, {
         width:   iW,
         height:  bodyMaxH,
         lineGap: 3,
       });

    // Bottom separator (fixed position above footer)
    const sepY = H - pad - footerReserve;
    doc.moveTo(pad - 6, sepY).lineTo(pad + iW + 6, sepY).lineWidth(0.6).stroke();

    // ── Footer checkboxes ─────────────────────────────────────────────────────
    let fy = sepY + 10;

    function checkbox(label, x, checked) {
      doc.circle(x + 5, fy + 5, 5).lineWidth(0.5).stroke('#000');
      if (checked) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('×', x + 2, fy + 1);
      }
      doc.font('Helvetica').fontSize(8).fillColor('#000')
         .text(label, x + 14, fy, { lineBreak: false });
    }

    checkbox('1 - Comunicación de renuncia',   pad,       false);
    checkbox('2 - Comunicación de ausencia',   pad + 186, false);
    checkbox('3 - Otro tipo de comunicación',  pad + 372, true);

    fy += 18;
    doc.font('Helvetica').fontSize(7).fillColor('#444')
       .text(
         'En caso de comunicaciones efectuadas a organismos previsionales u obras sociales, se consignará su domicilio legal.',
         pad, fy, { width: iW, align: 'center' }
       );

    doc.end();
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

module.exports = { generarPdfTelegrama };
