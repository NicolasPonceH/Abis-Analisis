const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Datos/clave de prueba, nunca los identificadores personales del usuario.
process.env.ENCRYPTION_KEY = 'd1'.repeat(32);
const { recordIdentity, normalizeTime, identityErrors } = require('../src/ingest/recordIdentity');
const { fingerprintRows, findLegacyIngest } = require('../src/ingest/deduplication');
const { bulkInsertRegistros, BATCH_SIZE } = require('../src/etl/bulkInsert');
const { runEtl, runSheetEtl } = require('../src/etl');
const { processSheetRows } = require('../src/ingest');
const { registerIngestRoutes } = require('../src/routes/ingest');
const { generarHashSHA256, cifrarBuffer } = require('../src/security/crypto');
const history = require('../src/ingest/ingestHistory');

const input = (id = 'TEST-1', date = '12-10-2026', time = '03:51:20') => ({
  'Fecha Enrolamiento': date, Hora: time, 'ID Registro': id, 'ID Origen': 'DEVICE-TEST',
  Nacionalidad: 'BOLIVIA', Unidad: 'POLINT IQUIQUE', Cuartel: 'COLCHANES', Equipo: 'PC DE ESCRITORIO',
  Genero: 'MUJER', 'Mayor de Edad': 'MAYOR DE EDAD', 'Edad Exacta': 30,
  'Estado Sincronizacion': 'SINCRONIZADO', 'Estado Registro': 'REGISTRADO', 'Estado General': 'REGISTRADO',
  Profesion: 'NO ESPECIFICADO',
});

test('identidad: normaliza hora Excel; distingue fecha/hora, ID y origen sin usar estadísticas', () => {
  const row = { idRegistroOrigen: ' 42 ', idOrigen: ' device ', horaEnrolamiento: '8:00' };
  const identity = recordIdentity(row, '2026-10-12');
  assert.equal(normalizeTime(8 / 24), '08:00:00');
  assert.deepEqual(identity, recordIdentity({ ...row, horaEnrolamiento: 8 / 24 }, '2026-10-12'));
  assert.notDeepEqual(identity, recordIdentity(row, '2026-10-13'));
  assert.notDeepEqual(identity, recordIdentity({ ...row, horaEnrolamiento: '09:00' }, '2026-10-12'));
  assert.notDeepEqual(identity, recordIdentity({ ...row, idRegistroOrigen: 43 }, '2026-10-12'));
  assert.notDeepEqual(identity, recordIdentity({ ...row, idOrigen: 'otro' }, '2026-10-12'));
  assert.equal(recordIdentity({ documento: 'TEST-DOC' }, '2026-10-12'), null);
  assert.ok(recordIdentity({ documento: 'TEST-DOC', horaEnrolamiento: '12:00' }, '2026-10-12'));
  for (const invalid of [{ idRegistroOrigen: {} }, { idOrigen: [] }, { horaEnrolamiento: '25:00' }, { idRegistroOrigen: 1e20 }]) {
    assert.ok(identityErrors(invalid).length);
  }
});

test('plantilla sin ID: conserva filas estadísticas iguales y reconoce el lote completo reordenado', () => {
  const a = { edad_exacta: 30 }, b = { edad_exacta: 25 };
  const first = fingerprintRows([a, a, b], ['edad_exacta']);
  assert.equal(new Set(first.map(r => r.huella_origen)).size, 3);
  assert.deepEqual(first, fingerprintRows([b, a, a], ['edad_exacta']));
  assert.equal(a.huella_origen, undefined);
  assert.ok(first.every(r => /^[a-f0-9]{64}$/.test(r.huella_origen)));
});

test('API informa duplicados y SIN_NOVEDADES; posible repetición legacy no crea ni inserta un lote', async () => {
  for (const legacy of [false, true]) {
    let handler, created = 0, inserted = 0, saved;
    registerIngestRoutes({ post(route, ...handlers) { if (route === '/api/ingest/sheet') handler = handlers.at(-1); }, get() {}, delete() {} }, {
      pool: { query: async sql => ({ rows: legacy && sql.includes('SELECT l.id_lote') ? [{ id_lote: 8, fecha: '23-10-2026 08:31' }] : [] }) },
      requireSessionUser() {}, upload: { single: () => () => {} }, generarHashSHA256,
      ensureIngestHistory: async () => {}, crearLote: async () => { created++; return 10; },
      actualizarLote: async (_pool, _id, data) => { saved = data; },
      runSheetEtl: async () => { inserted++; return { headerValidation: { ok: true }, rows: [{}, {}], errors: [], insertResult: { inserted: 0, duplicates: 2, batches: 1 } }; },
    });
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body: { headers: [], rows: [[], []] }, user: { username: 'test' } }, res);
    assert.equal(res.code, legacy ? 409 : 200);
    assert.equal(created, legacy ? 0 : 1);
    assert.equal(inserted, legacy ? 0 : 1);
    if (!legacy) {
      assert.equal(res.body.totalInsertadas, 0);
      assert.equal(res.body.totalDuplicadas, 2);
      assert.equal(saved.estado, 'SIN_NOVEDADES');
      assert.equal(saved.filasDuplicadas, 2);
      assert.equal(saved.filasError, 0);
    }
  }
});

// Opt-in: solo crea datos sintéticos en un esquema temporal de nombre aleatorio.
// Todas sus conexiones usan ese search_path, sin modificar tablas de public.
test('PostgreSQL real: recargas, solapamiento, concurrencia, rollback, eliminación y rutas', {
  skip: process.env.ABIS_TEST_POSTGRES !== '1', timeout: 60000,
}, async t => {
  require('dotenv').config();
  const { Pool } = require('pg');
  const schema = 'abis_dedup_test_' + randomUUID().replaceAll('-', '');
  assert.ok(process.env.DATABASE_URL, 'La prueba requiere la conexión configurada, sin recurrir a otra base por defecto');
  assert.match(schema, /^abis_dedup_test_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000,
    options: `-c search_path=${schema} -c timezone=America/Santiago -c statement_timeout=15000 -c lock_timeout=5000`,
    application_name: 'ABIS_test_aislado' });
  let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    t.diagnostic(`Esquema exclusivo de prueba: ${schema}`);
    let isolationConfirmed = false;
    await t.test('aislamiento: todas las conexiones excluyen public antes de escribir datos', async () => {
      const clients = [];
      try {
        // Comprueba cada conexión del pool; también detecta options inesperados
        // en DATABASE_URL que pudieran reemplazar el search_path configurado.
        for (let i = 0; i < 4; i++) clients.push(await pool.connect());
        for (const client of clients) {
          const { rows: [settings] } = await client.query(
            'SELECT current_schema() AS schema, current_schemas(false)::text[] AS schemas');
          assert.equal(settings.schema, schema);
          assert.deepEqual(settings.schemas, [schema]);
        }
        isolationConfirmed = true;
      } finally { clients.forEach(client => client.release()); }
    });
    // Un subtest fallido no detiene al padre: no continuar con DDL sin aislamiento.
    assert.equal(isolationConfirmed, true, 'No se permite escribir sin confirmar el aislamiento');
    // Evita que el instalador de esquemas intente modificar extensiones compartidas.
    const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8').replace(/^CREATE EXTENSION.*;$/m, '');
    await pool.query(sql);
    await pool.query(fs.readFileSync(path.join(__dirname, '../db/seed_catalogos.sql'), 'utf8'));
    await history.ensureIngestHistory(pool);
    const sheet = async objects => runSheetEtl(Object.keys(objects[0]), objects.map(Object.values), pool, { readOnly: true });
    const count = async () => Number((await pool.query('SELECT count(*) FROM registro_enrolamiento')).rows[0].count);
    const sample = Array.from({ length: 8 }, (_, i) => input('CASE-' + i));

    await t.test('8 filas y repetición reordenada: 8 insertadas, después 0 y 8 omitidas', async () => {
      assert.equal((await sheet(sample)).insertResult.inserted, 8);
      const second = (await sheet([...sample].reverse())).insertResult;
      assert.equal(second.inserted, 0); assert.equal(second.duplicates, 8);
      assert.equal(await count(), 8);
    });
    await t.test('lote parcialmente repetido, filas repetidas internas y nuevos eventos del mismo día', async () => {
      const result = (await sheet([sample[0], sample[0], input('NEW'), input('NEW'), input('CASE-0', '13-10-2026'), input('CASE-0', '12-10-2026', '11:00')])).insertResult;
      assert.equal(result.inserted, 3); assert.equal(result.duplicates, 3);
    });
    await t.test('portapapeles Oracle de 28 columnas sin cabeceras reconoce ID y hora', async () => {
      const row = ['12-10-2026', '03:51:20', 'PC DE ESCRITORIO', 'TEST', 'POLINT IQUIQUE',
        'PERSONA FICTICIA', 'D.N.I. (EXTRANJERO)', 'TEST-DOC', 'BOLIVIA', 'BOLIVIA',
        'SINCRONIZADO', 'REGISTRADO', 'REGISTRADO', 'COLCHANES', 'TARAPACA', '20-04-1996',
        30, 'MAYOR DE EDAD', 'DEVICE-TEST', '127.0.0.1', '', 'OPERADOR FICTICIO', 'NO ESPECIFICADO',
        'MUJER', 'ENROLADO', '', '', 'CASE-0'];
      const result = await runSheetEtl([], [row], pool, { readOnly: true });
      assert.equal(result.errors.length, 0);
      assert.equal(result.insertResult.inserted, 0);
      assert.equal(result.insertResult.duplicates, 1);
    });
    await t.test('Excel, Excel cifrado y portapapeles comparten identidad', async () => {
      const XLSX = require('xlsx');
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([input('CROSS', '2026-10-12', 8 / 24)]), 'ENROLADOS');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      assert.equal((await runEtl(buffer, pool, { readOnly: true })).insertResult.inserted, 1);
      assert.equal((await runEtl(cifrarBuffer(buffer), pool, { readOnly: true })).insertResult.duplicates, 1);
      assert.equal((await sheet([input('CROSS', '12-10-2026', '08:00:00')])).insertResult.duplicates, 1);
    });
    await t.test('dos cargas simultáneas superpuestas no duplican filas', async () => {
      const objects = Array.from({ length: 12 }, (_, i) => input('PARALLEL-' + i));
      const results = await Promise.all([sheet(objects), sheet([...objects].reverse())]);
      assert.equal(results.reduce((sum, r) => sum + r.insertResult.inserted, 0), 12);
      assert.equal(results.reduce((sum, r) => sum + r.insertResult.duplicates, 0), 12);
    });
    await t.test('el índice único rechaza duplicados incluso mediante SQL directo', async () => {
      const before = await count();
      await assert.rejects(pool.query(`
        INSERT INTO registro_enrolamiento (
          fecha_enrolamiento, id_nacionalidad, id_cuartel, id_equipo, id_profesion,
          genero, es_mayor_edad, edad_exacta, id_estado_sincronizacion,
          id_estado_registro, id_estado_general, huella_origen
        ) SELECT fecha_enrolamiento, id_nacionalidad, id_cuartel, id_equipo, id_profesion,
          genero, es_mayor_edad, edad_exacta, id_estado_sincronizacion,
          id_estado_registro, id_estado_general, huella_origen
          FROM registro_enrolamiento WHERE huella_origen IS NOT NULL LIMIT 1
      `), { code: '23505' });
      assert.equal(await count(), before);
    });
    await t.test('sin identificadores se conserva la multiplicidad del lote', async () => {
      const noId = { ...input() }; delete noId['ID Registro']; delete noId['ID Origen']; delete noId.Hora;
      assert.equal((await sheet([noId, noId])).insertResult.inserted, 2);
      assert.equal((await sheet([noId, noId])).insertResult.duplicates, 2);
    });
    await t.test('fallo en el segundo bloque revierte el primero y sus huellas', async () => {
      const mapped = (await processSheetRows(Object.keys(sample[0]), [Object.values(sample[0])], pool, { readOnly: true })).rows[0];
      const rows = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => ({ ...mapped, identidadOrigen: ['rollback', i] }));
      const sorted = fingerprintRows(rows, []);
      sorted.at(-1).id_cuartel = -999; // Error FK en el segundo bloque.
      const before = await count();
      await assert.rejects(bulkInsertRegistros(pool, sorted), { code: '23503' });
      assert.equal(await count(), before);
      assert.equal((await bulkInsertRegistros(pool, rows)).inserted, rows.length);
    });
    await t.test('rutas: historial muestra duplicados y eliminar un lote permite reingestarlo', async routeTest => {
      const handlers = {};
      registerIngestRoutes({ post: (url, ...args) => { handlers[url] = args.at(-1); },
        get: (url, ...args) => { handlers[url] = args.at(-1); }, delete: (url, ...args) => { handlers['DELETE ' + url] = args.at(-1); } }, {
        pool, requireSessionUser() {}, upload: { single: () => () => {} }, ...history,
        generarHashSHA256, runSheetEtl, runEtl, esBufferCifrado: () => false,
      });
      const call = async (url, body, params, expectedStatus = 200) => {
        const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
        await handlers[url]({ body, params, user: { username: 'test' } }, res);
        assert.equal(res.code, expectedStatus, JSON.stringify(res.body));
        return res.body;
      };
      const object = input('DELETE-REIMPORT');
      const payload = { headers: Object.keys(object), rows: [Object.values(object)] };
      const before = await count();
      const first = await call('/api/ingest/sheet', payload);
      assert.equal(first.totalInsertadas, 1);
      const second = await call('/api/ingest/sheet', payload);
      assert.equal(second.totalInsertadas, 0); assert.equal(second.totalDuplicadas, 1);
      const listing = await call('/api/ingest/historial');
      const duplicate = listing.lotes.find(l => Number(l.id_lote) === Number(second.idLote));
      assert.equal(duplicate.estado, 'SIN_NOVEDADES'); assert.equal(duplicate.filas_duplicadas, 1);
      const otherRows = (await pool.query(
        'SELECT id_registro, huella_origen, id_lote_ingesta FROM registro_enrolamiento WHERE id_lote_ingesta <> $1 ORDER BY id_registro',
        [first.idLote])).rows;
      const deleted = await call('DELETE /api/ingest/lotes/:id', null, { id: String(first.idLote) });
      assert.equal(deleted.ok, true);
      assert.equal(deleted.eliminados, 1);
      assert.equal(await count(), before);
      assert.equal((await pool.query('SELECT count(*)::int AS total FROM registro_enrolamiento WHERE id_lote_ingesta = $1', [first.idLote])).rows[0].total, 0);
      assert.deepEqual((await pool.query(
        'SELECT id_registro, huella_origen, id_lote_ingesta FROM registro_enrolamiento ORDER BY id_registro')).rows, otherRows,
      'la eliminación conserva todos los registros de otros lotes');
      const deletedLot = (await pool.query('SELECT estado, filas_eliminadas FROM ingesta_lote WHERE id_lote = $1', [first.idLote])).rows[0];
      assert.deepEqual(deletedLot, { estado: 'ELIMINADO', filas_eliminadas: 1 });
      const audits = async () => (await pool.query(
        "SELECT usuario_o_proceso FROM registro_auditoria_cifrada WHERE tipo_evento = 'ELIMINACION_INGESTA_AUTORIZADA' ORDER BY id_auditoria")).rows;
      assert.deepEqual(await audits(), [{ usuario_o_proceso: 'test' }]);
      await call('DELETE /api/ingest/lotes/:id', null, { id: String(first.idLote) }, 409);
      assert.equal((await audits()).length, 1, 'el segundo intento no duplica la auditoría');
      assert.equal(await count(), before);
      const reimport = await call('/api/ingest/sheet', payload);
      assert.equal(reimport.totalInsertadas, 1);
      assert.equal((await call('/api/ingest/sheet', payload)).totalDuplicadas, 1);
      assert.equal(await count(), before + 1);

      await routeTest.test('un fallo SQL real de auditoría revierte el borrado y el estado del lote', async () => {
        // La restricción se crea solo en la tabla del esquema temporal.
        await pool.query(`ALTER TABLE registro_auditoria_cifrada ADD CONSTRAINT test_rechazar_borrado
          CHECK (tipo_evento <> 'ELIMINACION_INGESTA_AUTORIZADA') NOT VALID`);
        try {
          const error = await call('DELETE /api/ingest/lotes/:id', null, { id: String(reimport.idLote) }, 500);
          assert.equal(error.ok, false);
          assert.equal(await count(), before + 1);
          const unchanged = (await pool.query('SELECT estado, filas_eliminadas FROM ingesta_lote WHERE id_lote = $1', [reimport.idLote])).rows[0];
          assert.deepEqual(unchanged, { estado: 'COMPLETADO', filas_eliminadas: 0 });
          assert.equal((await audits()).length, 1);
          assert.equal((await call('/api/ingest/sheet', payload)).totalDuplicadas, 1,
            'el rollback también conserva la protección contra duplicados');
        } finally {
          await pool.query('ALTER TABLE registro_auditoria_cifrada DROP CONSTRAINT test_rechazar_borrado');
        }
        assert.equal((await call('DELETE /api/ingest/lotes/:id', null, { id: String(reimport.idLote) })).eliminados, 1);
        assert.equal(await count(), before);
      });
    });
    await t.test('guard legacy considera solo lotes con registros antiguos todavía presentes', async () => {
      const lote = await history.crearLote(pool, { tipoIngesta: 'HOJA', hashSha256: 'legacy-test' });
      await history.actualizarLote(pool, lote, { estado: 'COMPLETADO' });
      assert.equal(await findLegacyIngest(pool, 'HOJA', 'legacy-test'), null);
      await pool.query(`UPDATE registro_enrolamiento SET huella_origen = NULL, id_lote_ingesta = $1
        WHERE id_registro = (SELECT min(id_registro) FROM registro_enrolamiento)`, [lote]);
      assert.equal((await findLegacyIngest(pool, 'HOJA', 'legacy-test')).id_lote, lote);
      await history.actualizarLote(pool, lote, { estado: 'ELIMINADO' });
      assert.equal(await findLegacyIngest(pool, 'HOJA', 'legacy-test'), null);
    });
  } finally {
    try {
      await pool.end();
      if (created) {
        assert.match(schema, /^abis_dedup_test_[a-f0-9]{32}$/);
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema])).rowCount, 0);
        t.diagnostic('Limpieza verificada: el esquema temporal y todos sus datos ficticios fueron eliminados.');
      }
    } finally { await admin.end(); }
  }
});
