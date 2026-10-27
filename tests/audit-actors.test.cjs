const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentAuditActor, withAuditActors } = require('../src/services/auditActors');
const { registerIngestRoutes } = require('../src/routes/ingest');

test('ingesta por archivo y portapapeles atribuye la actividad a la sesión, no al cuerpo enviado', async () => {
  const routes = new Map();
  const auditWrites = [];
  const lots = [];
  const etl = async () => ({ headerValidation: { ok: true }, rows: [{}], errors: [], insertResult: { inserted: 1 } });
  registerIngestRoutes({ post(url, ...handlers) { routes.set(url, handlers.at(-1)); }, get() {}, delete() {} }, {
    pool: { query: async (sql, params) => {
      if (sql.includes('INSERT INTO registro_auditoria_cifrada')) auditWrites.push({ sql, params });
      return { rows: [] };
    } },
    requireSessionUser() {}, upload: { single: () => () => {} },
    generarHashSHA256: () => 'hash', esBufferCifrado: () => false,
    ensureIngestHistory: async () => {}, crearLote: async (_pool, lot) => { lots.push(lot); return 6; },
    actualizarLote: async () => {}, runEtl: etl, runSheetEtl: etl,
  });
  for (const url of ['/api/ingest/upload', '/api/ingest/sheet']) {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await routes.get(url)({ user: { username: 'Nicolas' }, body: { headers: ['Fecha'], rows: [['2026-10-22']], username: 'Otra persona' }, file: { buffer: Buffer.from('fixture'), originalname: 'fixture.xlsx' } }, res);
    assert.equal(res.body.ok, true);
  }
  assert.equal(auditWrites.length, 2);
  assert.ok(auditWrites.every(write => write.params.at(-1) === 'Nicolas'));
  assert.ok(auditWrites.every(write => /\$4/.test(write.sql)));
  assert.ok(lots.every(lot => lot.usuario === 'Nicolas'));
});

test('bitácora distingue personas, procesos y eventos históricos sin inventar responsables', async () => {
  assert.equal(presentAuditActor({ usuario_o_proceso: 'Nicolas' }).responsable_tipo, 'usuario');
  assert.equal(presentAuditActor({ usuario_o_proceso: 'Servicio Programador ABIS' }).responsable_tipo, 'sistema');
  const legacy = { id_auditoria: 8, usuario_o_proceso: 'Operador Hoja de Cálculo Web', tipo_evento: 'INGESTA_PORTAPAPELES_AUTORIZADA' };
  assert.equal(presentAuditActor(legacy).responsable_tipo, 'desconocido');
  const pool = { query: async (sql, params) => {
    assert.match(sql, /HAVING count\(\*\) = 1/);
    assert.match(sql, /l.hash_sha256 = a.hash_sha256/);
    assert.match(sql, /l.finalizado_en BETWEEN/);
    assert.deepEqual(params, [[8]]);
    return { rows: [{ id_auditoria: 8, id_lote: 6, usuario: 'Nicolas' }] };
  } };
  const [linked] = await withAuditActors(pool, [legacy]);
  assert.equal(linked.responsable, 'Nicolas');
  assert.equal(linked.responsable_fuente, 'Historial del lote #6');
  assert.equal(linked.usuario_o_proceso, legacy.usuario_o_proceso, 'conserva el evento original');
  const [unmatched] = await withAuditActors({ query: async () => ({ rows: [] }) }, [legacy]);
  assert.equal(unmatched.responsable_tipo, 'desconocido');
  await assert.rejects(withAuditActors({ query: async () => { throw new Error('DB desconectada'); } }, [legacy]), /DB desconectada/);
});
