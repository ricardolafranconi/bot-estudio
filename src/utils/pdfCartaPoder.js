'use strict';

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

/**
 * Genera el PDF de la Carta Poder para el caso laboral.
 * @param {Object} caso     - Datos del caso (nombre, dni, domicilio, telefono...).
 * @param {string} outPath  - Ruta absoluta donde guardar el archivo.
 * @returns {Promise<void>}
 */
function generarPdfCartaPoder(caso, outPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const doc = new PDFDocument({ size: 'A4', margin: 65 });
    const ws  = fs.createWriteStream(outPath);
    doc.pipe(ws);

    const iW      = doc.page.width - 130;
    const estudio = process.env.ESTUDIO_NOMBRE   || 'Estudio Jurídico Lafranconi';
    const dir     = process.env.ESTUDIO_DIRECCION || '25 de Mayo 123, Oberá, Misiones';
    const tel     = process.env.ESTUDIO_TELEFONO  || '';
    const email   = process.env.ESTUDIO_EMAIL     || '';

    // ── Encabezado ────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000')
       .text(estudio, { align: 'center' });
    doc.font('Helvetica').fontSize(9)
       .text([dir, tel ? 'Tel: ' + tel : '', email].filter(Boolean).join('  |  '), { align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(65, doc.y).lineTo(65 + iW, doc.y).lineWidth(0.8).stroke();
    doc.moveDown(1.8);

    // ── Título ────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(15).text('CARTA PODER', { align: 'center' });
    doc.moveDown(2);

    // ── Cuerpo ────────────────────────────────────────────────────────────────
    const nombre   = caso.nombre   || '_____________________________';
    const dni      = caso.dni      || '______________';
    const domicilio= caso.domicilio|| '_____________________________';
    const ciudad   = (caso.domicilio || '').split(',').pop().trim() || 'Oberá';
    const hoy      = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' });

    doc.font('Helvetica').fontSize(11)
       .text(
         `Yo, ${nombre}, D.N.I. N° ${dni}, con domicilio en ${domicilio}, por la presente OTORGO PODER ESPECIAL a favor del Dr. Ricardo Lafranconi, Abogado, Mat. 4197 – T° XIV – F° 97, con domicilio en ${dir}, para que en mi nombre y representación lleve adelante las siguientes gestiones:`,
         { align: 'justify', lineGap: 3 }
       );
    doc.moveDown();

    const facultades = [
      'Representarme ante empleadores, organismos laborales, sindicatos, obras sociales y demás entidades públicas o privadas en todo lo relacionado con mi reclamo laboral.',
      'Realizar intimaciones fehacientes, presentar escritos, formular denuncias y ejercer todas las acciones que correspondan conforme a la Ley de Contrato de Trabajo (LCT), Ley 24.013 y demás normativa laboral aplicable.',
      'Negociar y acordar convenios de pago o conciliaciones en nombre mío, con mi conformidad previa.',
      'Cobrar sumas de dinero y suscribir los recibos y cancelaciones que correspondan.',
      'Iniciar y proseguir toda clase de acciones judiciales o extrajudiciales derivadas de la relación laboral.',
      'Realizar todos los demás actos necesarios para el mejor cumplimiento del presente mandato.',
    ];

    facultades.forEach((f, i) => {
      doc.font('Helvetica').fontSize(11)
         .text(`${i + 1}. ${f}`, { align: 'justify', lineGap: 3, indent: 16 });
      doc.moveDown(0.4);
    });

    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11)
       .text(
         `El presente poder se otorga con carácter especial para el reclamo laboral que me asiste, en la ciudad de ${ciudad}, Provincia de Misiones, a los ${hoy}.`,
         { align: 'justify', lineGap: 3 }
       );

    doc.moveDown(3.5);

    // ── Firmas ────────────────────────────────────────────────────────────────
    const sigY = doc.y;

    doc.moveTo(65,              sigY + 38).lineTo(65 + 175,          sigY + 38).lineWidth(0.7).stroke();
    doc.moveTo(65 + iW - 175,   sigY + 38).lineTo(65 + iW,           sigY + 38).lineWidth(0.7).stroke();

    doc.font('Helvetica').fontSize(10)
       .text('Firma y aclaración',     65,              sigY + 42, { width: 175, align: 'center' })
       .text(`D.N.I. N° ${dni}`,       65,              sigY + 56, { width: 175, align: 'center' })
       .text('Dr. Ricardo Lafranconi', 65 + iW - 175,   sigY + 42, { width: 175, align: 'center' })
       .text('Mat. 4197 – T° XIV – F° 97', 65 + iW - 175, sigY + 56, { width: 175, align: 'center' });

    // ── Pie de página ─────────────────────────────────────────────────────────
    const footY = doc.page.height - 50;
    doc.moveTo(65, footY - 8).lineTo(65 + iW, footY - 8).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#555')
       .text(`${estudio}  ·  ${dir}${tel ? '  ·  Tel: ' + tel : ''}`, 65, footY, { width: iW, align: 'center' });

    doc.end();
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

module.exports = { generarPdfCartaPoder };
