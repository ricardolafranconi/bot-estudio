'use strict';

require('dotenv').config();
const pool = require('../db/database');

// Esperar a que el schema se inicialice
setTimeout(async () => {
  try {
    await seedAll();
    console.log('\n✅ Seed completado exitosamente.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed:', err.message);
    process.exit(1);
  }
}, 1500);

async function seedAll() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 10 leads + conversaciones ─────────────────────────────────────────────

    const leads = [
      {
        phone: '5493755100001', name: 'Juan Carlos Pereyra', intent: 'CONSULTA_LABORAL',
        status: 'activo', priority: 'ALTA', needs_lawyer: 1,
        notes: 'Trabajo en negro 3 años. Quiere registración y diferencias salariales.',
        messages: [
          { dir: 'inbound',  content: 'Buenas, me llamo Juan Pereyra. Trabajo hace 3 años en un aserradero y nunca me registraron. Quiero saber si puedo reclamar.' },
          { dir: 'outbound', content: 'Hola Juan, soy Valeria del Estudio Lafranconi. Sí, podés reclamar la registración y diferencias salariales. ¿Podés contarme más sobre tu situación?' },
          { dir: 'inbound',  content: 'Entro a las 6 de la mañana y salgo a las 15. Me pagan $600 mensuales. El empleador se llama Angel Jorge Stasiuk y tiene un aserradero en Oberá.' },
          { dir: 'outbound', content: 'Perfecto Juan. Con esos datos podemos intimarlo por trabajo no registrado según los arts. 7, 8 y 52 de la LCT y art. 1 de la Ley 24.013. ¿Tenés algún comprobante de que trabajás ahí?' },
          { dir: 'inbound',  content: 'Tengo fotos mías trabajando y mensajes de WhatsApp donde el patrón me manda los horarios. Ingresé el 28/01/2025.' },
          { dir: 'outbound', content: 'Excelente. Guardá todo eso. El Dr. Lafranconi te va a atender. Te mandamos un turno para el miércoles.' },
        ],
      },
      {
        phone: '5493755100002', name: 'María Fernanda López', intent: 'CONSULTA_LABORAL',
        status: 'activo', priority: 'ALTA', needs_lawyer: 1,
        notes: 'Despido durante embarazo. Período de protección. Reinstalación o doble indemnización.',
        messages: [
          { dir: 'inbound',  content: 'Hola, necesito ayuda urgente. Me despidieron estando embarazada de 3 meses.' },
          { dir: 'outbound', content: 'Hola María Fernanda, te atiendo de inmediato. El despido durante el embarazo está protegido por el art. 177 LCT. ¿Cuándo te notificaron el despido?' },
          { dir: 'inbound',  content: 'Me llegó la carta documento el 15 de marzo. Trabajo en el supermercado Vea de Oberá, hace 4 años. Mi jefa es la gerente Susana Romero.' },
          { dir: 'outbound', content: 'Perfecto. Vas a tener derecho a una indemnización agravada. Necesitamos actuar rápido. ¿Tenés la carta documento?' },
          { dir: 'inbound',  content: 'Sí la tengo. También tengo el certificado médico del embarazo. Mi DNI es 35.421.897 y vivo en Sarmiento 456, Oberá.' },
          { dir: 'outbound', content: 'Guardá todo. El Dr. Lafranconi te va a llamar hoy mismo.' },
        ],
      },
      {
        phone: '5493755100003', name: 'Roberto Gustavo Giménez', intent: 'CONSULTA_ACCIDENTE',
        status: 'seguimiento', priority: 'ALTA', needs_lawyer: 1,
        notes: 'Accidente en obra. ART no cubre. Incapacidad parcial permanente del 35%.',
        messages: [
          { dir: 'inbound',  content: 'Buenas tardes. Tuve un accidente en la obra donde trabajo y la ART no me quiere pagar.' },
          { dir: 'outbound', content: 'Hola Roberto, lamentamos lo ocurrido. ¿Podés contarme qué tipo de accidente fue y qué te dijo la ART?' },
          { dir: 'inbound',  content: 'Me caí de un andamio el 10 de febrero. Me fracturé el brazo derecho. La ART Galeno me dio el alta pero el médico particular dice que tengo una incapacidad del 35%. Trabajo para Constructora Norber SRL.' },
          { dir: 'outbound', content: 'Ese porcentaje de incapacidad da derecho a una indemnización importante. Podemos iniciar demanda ante la Comisión Médica o ir directo a la justicia.' },
          { dir: 'inbound',  content: 'Prefiero lo más rápido. Tengo familia a cargo. Trabajo desde hace 2 años, me pagan $180.000 mensuales.' },
        ],
      },
      {
        phone: '5493755100004', name: 'Ana Beatriz Sosa', intent: 'CONSULTA_FAMILIA',
        status: 'activo', priority: 'MEDIA', needs_lawyer: 1,
        notes: 'Divorcio con bienes en común (casa y auto). Dos hijos menores. Régimen de visitas a acordar.',
        messages: [
          { dir: 'inbound',  content: 'Necesito iniciar un divorcio. Estoy casada hace 12 años y quiero separarme.' },
          { dir: 'outbound', content: 'Hola Ana, podemos ayudarte con el proceso. ¿Es un divorcio de mutuo acuerdo o unilateral?' },
          { dir: 'inbound',  content: 'Mi marido no quiere divorciarse. Tenemos una casa en Oberá y un auto. Dos hijos de 8 y 11 años. Él trabaja en la municipalidad.' },
          { dir: 'outbound', content: 'Podemos iniciar el divorcio unilateral. ¿Tenés dónde ir a vivir con los chicos mientras dura el proceso?' },
          { dir: 'inbound',  content: 'Sí, me voy a la casa de mi mamá. Quiero la tenencia de los chicos y que él pase una cuota alimentaria.' },
          { dir: 'outbound', content: 'Perfecto. El Dr. Lafranconi te puede orientar sobre la cuota y el régimen de visitas.' },
        ],
      },
      {
        phone: '5493755100005', name: 'Carlos Eduardo Ruiz', intent: 'CONSULTA_LABORAL',
        status: 'activo', priority: 'MEDIA', needs_lawyer: 1,
        notes: 'Despido sin causa. No le pagaron liquidación final. Empresa: Transporte Misionero SA.',
        messages: [
          { dir: 'inbound',  content: 'Me despidieron sin causa y no me pagaron nada. ¿Qué puedo hacer?' },
          { dir: 'outbound', content: 'Hola Carlos, estás en tu derecho de reclamar. ¿Cuánto tiempo trabajabas y cuánto te pagaban?' },
          { dir: 'inbound',  content: 'Trabajé 6 años como chofer en Transporte Misionero SA. Me pagaban $280.000 mensuales. El despido fue el 5 de abril. No me dieron nada, ni siquiera el telegrama de despido.' },
          { dir: 'outbound', content: 'Corresponde intimarlos para que abonen la liquidación final. ¿Tenés recibos de sueldo?' },
          { dir: 'inbound',  content: 'Tengo los últimos 3 recibos. El gerente es Marcelo Fontana. La empresa queda en Av. San Martín 1200, Oberá.' },
        ],
      },
      {
        phone: '5493755100006', name: 'Silvia Patricia Romero', intent: 'CONSULTA_LABORAL',
        status: 'nuevo', priority: 'MEDIA', needs_lawyer: 1,
        notes: 'Reclamo de horas extras no pagadas y descanso dominical. Kiosco Romero.',
        messages: [
          { dir: 'inbound',  content: 'Hola, trabajo en un kiosco de lunes a domingo 12 horas y no me pagan las horas extras ni los domingos.' },
          { dir: 'outbound', content: 'Hola Silvia. Las horas extras y el trabajo en días domingo tienen un recargo legal. ¿Cuánto tiempo llevás trabajando así?' },
          { dir: 'inbound',  content: 'Dos años. El dueño es Jorge Kiosco Romero. Nunca firmé contrato. Me pagan $150.000 pero debería cobrar mucho más.' },
          { dir: 'outbound', content: 'Podemos reclamar las diferencias salariales de los últimos 2 años. El Dr. Lafranconi te puede asesorar.' },
        ],
      },
      {
        phone: '5493755100007', name: 'Diego Hernán Villalba', intent: 'CONSULTA_SUCESIONES',
        status: 'activo', priority: 'MEDIA', needs_lawyer: 0,
        notes: 'Sucesión de padre fallecido. Casa, campo y cuenta bancaria. 3 herederos.',
        messages: [
          { dir: 'inbound',  content: 'Falleció mi papá y necesito hacer la sucesión. Somos 3 hermanos.' },
          { dir: 'outbound', content: 'Lamentamos tu pérdida, Diego. Para la sucesión necesitamos el acta de defunción y los bienes a declarar. ¿Qué bienes dejó tu papá?' },
          { dir: 'inbound',  content: 'Una casa en Oberá valuada en unos 40 millones, un campo de 10 hectáreas en Leandro N. Alem y una cuenta bancaria en el Macro con unos 2 millones.' },
          { dir: 'outbound', content: 'Perfecto. Necesitamos el acta de defunción, partidas de nacimiento de los tres hermanos y la documentación de los bienes.' },
          { dir: 'inbound',  content: 'Tenemos todo eso. ¿Cuánto tiempo lleva el trámite?' },
          { dir: 'outbound', content: 'Unos 6 a 12 meses dependiendo si es declaratoria o testamento. El Dr. Lafranconi les puede dar un presupuesto.' },
        ],
      },
      {
        phone: '5493755100008', name: 'Lorena Vanesa Medina', intent: 'CONSULTA_LABORAL',
        status: 'seguimiento', priority: 'ALTA', needs_lawyer: 1,
        notes: 'Negativa de trabajo después de licencia médica. Despido indirecto.',
        messages: [
          { dir: 'inbound',  content: 'Volví de mi licencia médica y no me dejaron entrar al trabajo. ¿Puedo considerarme despedida?' },
          { dir: 'outbound', content: 'Hola Lorena. La negativa de tareas configura un despido indirecto. ¿Cuánto tiempo llevas trabajando y qué empresa es?' },
          { dir: 'inbound',  content: 'Trabajo hace 5 años en Supermercado El Ahorro de Oberá. El dueño es Pedro Krawczyk. Estuve 30 días con licencia por operación de rodilla.' },
          { dir: 'outbound', content: 'Tenés que mandar un telegrama intimando a que te reintegren, y si en 48hs no lo hacen, considerarte despedida. ¿Tenés el certificado médico?' },
          { dir: 'inbound',  content: 'Sí tengo todo. Me pagan $210.000 mensuales. ¿Cuánto me corresponde?' },
          { dir: 'outbound', content: 'Corresponde indemnización por antigüedad (5 años), preaviso y SAC proporcional. Te va a llamar el Dr. Lafranconi.' },
        ],
      },
      {
        phone: '5493755100009', name: 'Miguel Ángel Torres', intent: 'CONSULTA_CIVIL',
        status: 'activo', priority: 'BAJA', needs_lawyer: 0,
        notes: 'Desalojo. Inquilino no paga hace 4 meses. Inmueble en Oberá.',
        messages: [
          { dir: 'inbound',  content: 'Tengo un inquilino que no me paga el alquiler hace 4 meses. ¿Cómo lo desalojo?' },
          { dir: 'outbound', content: 'Hola Miguel, podemos iniciar un juicio de desalojo por falta de pago. ¿Tenés contrato escrito?' },
          { dir: 'inbound',  content: 'Sí, tengo contrato. Se vence en noviembre. Debe 4 meses a $80.000 cada uno. La casa está en Salta 234, Oberá.' },
          { dir: 'outbound', content: 'Primero mandamos una carta documento intimándolo a pagar o restituir el inmueble. Si no responde, iniciamos el desalojo.' },
          { dir: 'inbound',  content: 'Perfecto. ¿Cuánto tarda el proceso judicial?' },
        ],
      },
      {
        phone: '5493755100010', name: 'Patricia Noemí Benítez', intent: 'CONSULTA_PREVISIONAL',
        status: 'activo', priority: 'MEDIA', needs_lawyer: 0,
        notes: 'Jubilación por invalidez. ANSES rechazó. 45 años, 20 de aportes.',
        messages: [
          { dir: 'inbound',  content: 'Me rechazaron la jubilación por invalidez en ANSES. ¿Puedo apelar?' },
          { dir: 'outbound', content: 'Hola Patricia. Sí, se puede apelar ante la Cámara Federal de la Seguridad Social. ¿Qué motivo dio ANSES para el rechazo?' },
          { dir: 'inbound',  content: 'Dijeron que no llego al porcentaje de incapacidad. Pero tengo dictamen médico del 68% de incapacidad permanente. Tengo 45 años y 20 años de aportes.' },
          { dir: 'outbound', content: 'Con ese dictamen médico tenés muy buenas chances. Necesitamos el expediente administrativo de ANSES y todos los estudios médicos.' },
          { dir: 'inbound',  content: 'Tengo todo. Padezco de artritis reumatoide severa. Trabajé siempre en relación de dependencia como empleada doméstica.' },
          { dir: 'outbound', content: 'Perfecto. El Dr. Lafranconi revisa el caso y te informa los pasos a seguir.' },
        ],
      },
    ];

    // ── Insertar leads y mensajes ─────────────────────────────────────────────

    const leadIds = [];
    for (const l of leads) {
      // Upsert lead
      const { rows: lr } = await client.query(
        `INSERT INTO leads (phone, name, intent, status, priority, needs_lawyer, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (phone) DO UPDATE SET name=$2,intent=$3,status=$4,priority=$5,needs_lawyer=$6,notes=$7,updated_at=NOW()
         RETURNING id`,
        [l.phone, l.name, l.intent, l.status, l.priority, l.needs_lawyer, l.notes]
      );
      const leadId = lr[0].id;
      leadIds.push(leadId);

      // Mensajes
      let msOffset = 0;
      for (const m of l.messages) {
        const ts = new Date(Date.now() - (l.messages.length - msOffset) * 7 * 60 * 1000);
        await client.query(
          `INSERT INTO messages (lead_id, wamid, direction, content, intent, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (wamid) DO NOTHING`,
          [leadId, `mock_${l.phone}_${msOffset}`, m.dir, m.content, l.intent, ts.toISOString()]
        );
        msOffset++;
      }
    }

    // ── 10 casos laborales y civiles ─────────────────────────────────────────

    const casos = [
      {
        leadIdx: 0,
        expediente: 'EST-2025-001',
        nombre: 'Juan Carlos Pereyra',
        telefono: '5493755100001',
        email: 'jcpereyra@gmail.com',
        dni: '28.345.678',
        domicilio: 'Belgrano 123, Oberá, Misiones',
        tipo_caso: 'Laboral',
        estado: 'En proceso',
        actor: 'Pereyra, Juan Carlos',
        demandado: 'Stasiuk, Angel Jorge (Aserradero El Pino)',
        terceros: null,
        resumen: 'Trabajador desempeñándose como maquinista en elaboración de pino desde el 28/01/2025 sin registración laboral. Horario: 6 a 15hs. Salario: $600 mensuales (muy por debajo del convenio). Empleador: Angel Jorge Stasiuk, Oberá.\n\nHechos: Trabajo en negro por más de 3 años, ausencia total de aportes, horarios extendidos sin horas extras reconocidas.\n\nDocumentos: Fotos en el lugar de trabajo, mensajes de WhatsApp del empleador, testigos compañeros de trabajo.',
        proxima_accion: 'Enviar telegrama de intimación por registración (arts. 7, 8, 52 LCT + art. 1 Ley 24.013)',
        proxima_fecha: '2025-05-10',
        movimientos: [
          { desc: 'Caso iniciado desde consulta WhatsApp. Ficha completada con IA.', dias: 20 },
          { desc: 'Cliente concurrió a estudio. Se recabó documentación: fotos, capturas WhatsApp empleador.', dias: 15 },
          { desc: 'Se redactó telegrama de intimación por trabajo no registrado. Pendiente revisión del cliente.', dias: 5 },
        ],
      },
      {
        leadIdx: 1,
        expediente: 'EST-2025-002',
        nombre: 'María Fernanda López',
        telefono: '5493755100002',
        email: 'mfernanda.lopez@hotmail.com',
        dni: '35.421.897',
        domicilio: 'Sarmiento 456, Oberá, Misiones',
        tipo_caso: 'Laboral',
        estado: 'En proceso',
        actor: 'López, María Fernanda',
        demandado: 'Supermercado Vea Oberá SA (Gerente: Romero, Susana)',
        terceros: null,
        resumen: 'Trabajadora con 4 años de antigüedad, despedida el 15/03/2025 estando embarazada de 3 meses. El despido viola el art. 177 LCT (protección por maternidad). Tiene certificado médico de embarazo y carta documento de despido.\n\nCorresponde: indemnización agravada (art. 178 LCT), indemnización por antigüedad, preaviso omitido, SAC proporcional e integración mes de despido.',
        proxima_accion: 'Intimar a empleador por despido discriminatorio. Calcular liquidación final con agravamiento.',
        proxima_fecha: '2025-05-08',
        movimientos: [
          { desc: 'Caso iniciado. Despido durante período de embarazo. Urgente.', dias: 18 },
          { desc: 'Se solicitó al empleador carta documento de despido y certificados laborales (art. 80 LCT).', dias: 12 },
          { desc: 'Empleador no respondió en plazo. Se agrega multa art. 80 LCT al reclamo.', dias: 7 },
          { desc: 'Se prepara demanda ante el fuero laboral de Oberá.', dias: 2 },
        ],
      },
      {
        leadIdx: 2,
        expediente: 'EST-2025-003',
        nombre: 'Roberto Gustavo Giménez',
        telefono: '5493755100003',
        email: 'rgimenez.obra@gmail.com',
        dni: '31.876.543',
        domicilio: 'San Martín 789, Oberá, Misiones',
        tipo_caso: 'Accidente de tránsito',
        estado: 'Audiencia próxima',
        actor: 'Giménez, Roberto Gustavo',
        demandado: 'ART Galeno Argentina SA / Constructora Norber SRL',
        terceros: 'ANSES (prestación por incapacidad)',
        resumen: 'Accidente de trabajo ocurrido el 10/02/2025. Caída desde andamio en obra de construcción. Fractura de radio distal brazo derecho con consolidación viciosa. Incapacidad parcial permanente del 35% según perito particular.\n\nART Galeno otorgó alta médica prematura. Se impugna dictamen de Comisión Médica. Salario: $180.000/mes. Antigüedad: 2 años en Constructora Norber SRL.',
        proxima_accion: 'Audiencia ante Comisión Médica Central — impugnación del porcentaje de incapacidad',
        proxima_fecha: '2025-05-15',
        movimientos: [
          { desc: 'Caso iniciado. Accidente de trabajo el 10/02/2025. Caída de andamio.', dias: 30 },
          { desc: 'Se presentó impugnación al dictamen de Comisión Médica Local (CML) por porcentaje insuficiente.', dias: 22 },
          { desc: 'CML confirmó 18% de incapacidad. Se apeló ante Comisión Médica Central.', dias: 14 },
          { desc: 'Se obtuvo turno en CMC para el 15/05/2025.', dias: 5 },
        ],
      },
      {
        leadIdx: 3,
        expediente: 'EST-2025-004',
        nombre: 'Ana Beatriz Sosa',
        telefono: '5493755100004',
        email: 'anasosa456@gmail.com',
        dni: '29.654.321',
        domicilio: 'Rivadavia 234, Oberá, Misiones',
        tipo_caso: 'Familia',
        estado: 'En proceso',
        actor: 'Sosa, Ana Beatriz',
        demandado: 'Fernández, Jorge Luis (cónyuge)',
        terceros: 'Menores: Valentina Fernández (11) y Marcos Fernández (8)',
        resumen: 'Divorcio unilateral solicitado por la Sra. Sosa. Matrimonio de 12 años. Bienes gananciales: casa en Oberá (valuada en $40.000.000) y vehículo Volkswagen Gol 2019.\n\nSe solicita: tenencia de hijos (11 y 8 años), régimen de visitas para el padre, cuota alimentaria del 40% del salario del demandado (empleado municipal).',
        proxima_accion: 'Audiencia de mediación familiar previa al juicio',
        proxima_fecha: '2025-05-20',
        movimientos: [
          { desc: 'Inicio de actuaciones. Se presentó escrito de divorcio unilateral ante Juzgado de Familia de Oberá.', dias: 25 },
          { desc: 'Juez ordenó mediación familiar obligatoria previa.', dias: 18 },
          { desc: 'Se notificó al demandado. Se fijó audiencia de mediación para el 20/05/2025.', dias: 10 },
        ],
      },
      {
        leadIdx: 4,
        expediente: 'EST-2025-005',
        nombre: 'Carlos Eduardo Ruiz',
        telefono: '5493755100005',
        email: 'carlos.ruiz.chofer@yahoo.com',
        dni: '26.789.012',
        domicilio: 'Colón 567, Oberá, Misiones',
        tipo_caso: 'Laboral',
        estado: 'En proceso',
        actor: 'Ruiz, Carlos Eduardo',
        demandado: 'Transporte Misionero SA (Gerente: Fontana, Marcelo)',
        terceros: null,
        resumen: 'Trabajador despedido sin causa el 05/04/2025 tras 6 años de antigüedad como chofer. Salario: $280.000/mes. Empresa no abonó liquidación final (indemnización, preaviso, SAC proporcional, vacaciones no gozadas).\n\nMonto estimado del reclamo: $2.800.000 (indemnización por antigüedad) + $560.000 (preaviso 2 meses) + $46.666 (SAC proporcional) + $93.333 (vacaciones).',
        proxima_accion: 'Intimar por liquidación final mediante telegrama. Plazo: 48hs.',
        proxima_fecha: '2025-05-07',
        movimientos: [
          { desc: 'Caso iniciado. Despido sin causa sin pago de liquidación.', dias: 12 },
          { desc: 'Se envió telegrama intimando pago de liquidación final. Sin respuesta del empleador.', dias: 7 },
          { desc: 'Vencido el plazo sin respuesta. Se procede a presentar demanda laboral.', dias: 3 },
        ],
      },
      {
        leadIdx: 5,
        expediente: 'EST-2025-006',
        nombre: 'Silvia Patricia Romero',
        telefono: '5493755100006',
        email: null,
        dni: '33.210.987',
        domicilio: 'Mitre 890, Oberá, Misiones',
        tipo_caso: 'Laboral',
        estado: 'Nuevo',
        actor: 'Romero, Silvia Patricia',
        demandado: 'Kiosco Romero (propietario: Romero, Jorge)',
        terceros: null,
        resumen: 'Trabajadora sin registrar hace 2 años en kiosco comercial. Jornada: 12 horas diarias, lunes a domingo. No percibe horas extras ni adicional por trabajo en días domingos/feriados. Salario actual: $150.000/mes (debería recibir ~$380.000 según convenio comercio).\n\nSe reclaman diferencias salariales, horas extras y trabajo dominical de los últimos 2 años.',
        proxima_accion: 'Concurrir al estudio con recibos de sueldo o comprobantes de cobro',
        proxima_fecha: '2025-05-12',
        movimientos: [
          { desc: 'Primera consulta recibida por WhatsApp. Caso asignado al Dr. Lafranconi.', dias: 3 },
        ],
      },
      {
        leadIdx: 6,
        expediente: 'EST-2025-007',
        nombre: 'Diego Hernán Villalba',
        telefono: '5493755100007',
        email: 'diegovillalba@gmail.com',
        dni: '30.456.789',
        domicilio: 'España 321, Oberá, Misiones',
        tipo_caso: 'Sucesiones',
        estado: 'En proceso',
        actor: 'Villalba, Diego Hernán; Villalba, Claudia Beatriz; Villalba, Roberto Alejandro',
        demandado: null,
        terceros: 'Banco Macro (cuenta del causante)',
        resumen: 'Sucesión intestada de Villalba, Héctor Ángel (fallecido el 12/02/2025). Tres herederos: Diego, Claudia y Roberto Villalba.\n\nBienes: inmueble en Oberá ($40.000.000), campo de 10 ha en Leandro N. Alem ($25.000.000) y cuenta bancaria Banco Macro ($2.000.000).\n\nSe presentó declaratoria de herederos ante el Juzgado Civil de Oberá.',
        proxima_accion: 'Presentar inventario y avalúo de bienes ante el juzgado',
        proxima_fecha: '2025-06-01',
        movimientos: [
          { desc: 'Inicio de sucesión intestada. Se presentó escrito inicial con acta de defunción y partidas de nacimiento.', dias: 40 },
          { desc: 'Juzgado Civil de Oberá radicó el expediente. Se ordenó publicación de edictos.', dias: 30 },
          { desc: 'Publicación de edictos en Boletín Oficial completada.', dias: 20 },
          { desc: 'Se obtuvo declaratoria de herederos. Ahora se procede con el inventario de bienes.', dias: 8 },
        ],
      },
      {
        leadIdx: 7,
        expediente: 'EST-2025-008',
        nombre: 'Lorena Vanesa Medina',
        telefono: '5493755100008',
        email: 'lore.medina@outlook.com',
        dni: '37.123.456',
        domicilio: 'Alberdi 678, Oberá, Misiones',
        tipo_caso: 'Laboral',
        estado: 'Audiencia próxima',
        actor: 'Medina, Lorena Vanesa',
        demandado: 'Supermercado El Ahorro SRL (propietario: Krawczyk, Pedro)',
        terceros: null,
        resumen: 'Trabajadora con 5 años de antigüedad. Retornó de licencia médica por operación de rodilla (30 días). Al presentarse a trabajar, el empleador le negó el ingreso sin causa. Configuración de despido indirecto (art. 246 LCT).\n\nSalario: $210.000/mes. Reclamo: indemnización por antigüedad ($1.050.000), preaviso ($420.000), SAC proporcional ($35.000) + vacaciones proporcionales.',
        proxima_accion: 'Audiencia de conciliación laboral obligatoria (SECLO)',
        proxima_fecha: '2025-05-22',
        movimientos: [
          { desc: 'Caso iniciado. Se envió telegrama de denuncia de negativa de trabajo y comunicación de despido indirecto.', dias: 22 },
          { desc: 'Empleador respondió negando la negativa de trabajo. Se adjuntaron declaraciones de testigos.', dias: 15 },
          { desc: 'Se presentó demanda ante el Juzgado de Trabajo de Oberá.', dias: 10 },
          { desc: 'Juzgado fijó audiencia de conciliación para el 22/05/2025.', dias: 4 },
        ],
      },
      {
        leadIdx: 8,
        expediente: 'EST-2025-009',
        nombre: 'Miguel Ángel Torres',
        telefono: '5493755100009',
        email: 'migueltorres.prop@gmail.com',
        dni: '24.987.654',
        domicilio: 'Urquiza 432, Oberá, Misiones',
        tipo_caso: 'Civil',
        estado: 'En proceso',
        actor: 'Torres, Miguel Ángel (propietario)',
        demandado: 'Inquilino: González, Ramón Osvaldo',
        terceros: null,
        resumen: 'Desalojo por falta de pago. Contrato de locación vigente hasta noviembre 2025. Inquilino debe 4 meses de alquiler a $80.000 c/u = $320.000 en total. Inmueble: Salta 234, Oberá.\n\nSe envió carta documento el 28/03/2025. Sin respuesta. Se inicia demanda de desalojo por falta de pago conforme art. 680 bis CPCC Misiones (proceso sumarísimo).',
        proxima_accion: 'Notificar al demandado la demanda de desalojo',
        proxima_fecha: '2025-05-14',
        movimientos: [
          { desc: 'Se envió carta documento intimando al pago o restitución del inmueble. Plazo: 10 días.', dias: 20 },
          { desc: 'Vencido el plazo sin respuesta ni pago. Se presenta demanda de desalojo.', dias: 13 },
          { desc: 'Juzgado Civil admitió la demanda. Ordenó notificación al demandado.', dias: 6 },
        ],
      },
      {
        leadIdx: 9,
        expediente: 'EST-2025-010',
        nombre: 'Patricia Noemí Benítez',
        telefono: '5493755100010',
        email: 'patri.benitez@yahoo.com',
        dni: '22.345.678',
        domicilio: 'Corrientes 765, Oberá, Misiones',
        tipo_caso: 'Previsional',
        estado: 'En proceso',
        actor: 'Benítez, Patricia Noemí',
        demandado: 'ANSES (Administración Nacional de Seguridad Social)',
        terceros: null,
        resumen: 'Reclamo de jubilación por invalidez denegada por ANSES. Beneficiaria: 45 años, 20 años de aportes como empleada doméstica. Diagnóstico: artritis reumatoide severa con incapacidad del 68% según perito particular (Dr. Médico Ramírez, MN 45678).\n\nANSES determinó solo 45% de incapacidad, por debajo del umbral del 66% exigido por el art. 48 Ley 24.241. Se impugna el dictamen administrativo y se apela ante la Cámara Federal de la Seguridad Social.',
        proxima_accion: 'Presentar pericia médica particular y apelación ante Cámara Federal de Seg. Social',
        proxima_fecha: '2025-05-28',
        movimientos: [
          { desc: 'Caso iniciado. ANSES rechazó jubilación por invalidez. Diagnóstico: artritis reumatoide 68%.', dias: 35 },
          { desc: 'Se solicitó expediente administrativo a ANSES.', dias: 28 },
          { desc: 'Recibido expediente. Dictamen ANSES: 45% incapacidad (insuficiente).', dias: 21 },
          { desc: 'Se contrató perito médico particular. Confirmó 68% de incapacidad.', dias: 12 },
          { desc: 'Se redactó recurso de apelación ante Cámara Federal Seg. Social.', dias: 5 },
        ],
      },
    ];

    // ── Insertar casos y movimientos ─────────────────────────────────────────

    for (const c of casos) {
      const leadId = leadIds[c.leadIdx];

      // Check si ya existe
      const { rows: existing } = await client.query(
        'SELECT id FROM casos WHERE expediente=$1', [c.expediente]
      );
      let casoId;

      if (existing.length) {
        casoId = existing[0].id;
        await client.query(
          `UPDATE casos SET nombre=$1,telefono=$2,email=$3,dni=$4,domicilio=$5,tipo_caso=$6,estado=$7,
           actor=$8,demandado=$9,terceros=$10,resumen=$11,proxima_accion=$12,proxima_fecha=$13,updated_at=NOW()
           WHERE id=$14`,
          [c.nombre, c.telefono, c.email, c.dni, c.domicilio, c.tipo_caso, c.estado,
           c.actor, c.demandado, c.terceros, c.resumen, c.proxima_accion, c.proxima_fecha, casoId]
        );
      } else {
        const { rows: cr } = await client.query(
          `INSERT INTO casos (expediente,lead_id,nombre,telefono,email,dni,domicilio,tipo_caso,estado,actor,demandado,terceros,resumen,proxima_accion,proxima_fecha)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [c.expediente, leadId, c.nombre, c.telefono, c.email, c.dni, c.domicilio,
           c.tipo_caso, c.estado, c.actor, c.demandado, c.terceros, c.resumen,
           c.proxima_accion, c.proxima_fecha]
        );
        casoId = cr[0].id;
      }

      // Movimientos (solo si es caso nuevo)
      if (!existing.length) {
        let mOffset = 0;
        for (const m of c.movimientos) {
          const ts = new Date(Date.now() - m.dias * 24 * 60 * 60 * 1000);
          await client.query(
            'INSERT INTO caso_movimientos (caso_id, descripcion, fecha, created_at) VALUES ($1,$2,$3,$3)',
            [casoId, m.desc, ts.toISOString()]
          );
          mOffset++;
        }
      }

      console.log(`  ✔ ${c.expediente} — ${c.nombre} (${c.tipo_caso})`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
