const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test.describe('Sistema ABIS - API Endpoints', () => {
  test('GET /health returns ok and db connected', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
  });

  test('GET /api/db/pool returns connection pool metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/db/pool`);
    if (response.status() === 200) {
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.pool).toHaveProperty('totalConexiones');
      expect(body.pool).toHaveProperty('configuracion');
    }
  });

  test('GET /reporte-diario without fecha returns most recent data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/reporte-diario`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('fecha');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('sincronizacion');
    expect(body).toHaveProperty('registro');
    expect(body).toHaveProperty('general');
    expect(body).toHaveProperty('nacionalidadesPrincipales');
    expect(body).toHaveProperty('cuartelesActivos');
    expect(body).toHaveProperty('unidadesActivas');
    expect(body).toHaveProperty('genero');
    expect(body).toHaveProperty('edad');
  });

  test('GET /reporte-diario with specific fecha returns data for that date', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/reporte-diario?fecha=2026-09-15`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.fecha).toBe('2026-09-15');
  });

  test('GET /reporte-diario with invalid fecha returns 400', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/reporte-diario?fecha=invalid`);
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('fecha invalida');
  });

  test('GET /api/fechas returns array of dates', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/fechas`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('fecha');
      expect(body[0]).toHaveProperty('total');
    }
  });

  test('GET /api/metricas/rango returns aggregated metrics', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/metricas/rango?desde=2023-08-01&hasta=2023-08-18`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('desde', '2023-08-01');
    expect(body).toHaveProperty('hasta', '2023-08-18');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('sincronizacion');
    expect(body).toHaveProperty('registro');
    expect(body).toHaveProperty('nacionalidadesPrincipales');
  });

  test('GET /api/metricas/tendencia returns time series data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/metricas/tendencia`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('fecha');
      expect(body[0]).toHaveProperty('total');
      expect(body[0]).toHaveProperty('sincronizados');
    }
  });

  test('GET / serves the Web Dashboard HTML with PDI branding and Word export button', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/`);
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    expect(text).toContain('SISTEMA ABIS');
    expect(text).toContain('Policía de Investigaciones de Chile');
    expect(text).toContain('btn-export-word');
  });

  test('GET /api/export/word generates and serves a valid Microsoft Word (.docx) file', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/export/word`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('vnd.openxmlformats-officedocument.wordprocessingml.document');
    const buffer = await response.body();
    expect(buffer.length).toBeGreaterThan(1000);
    // Verificar encabezado PK (formato zip/docx)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  test('GET /api/export/word with date range returns valid Word document', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/export/word?desde=2026-08-01&hasta=2026-08-25`);
    expect(response.ok()).toBeTruthy();
    const buffer = await response.body();
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test('GET /api/export/excel generates formatted official PDI Excel (.xlsx) document', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/export/excel`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const buffer = await response.body();
    expect(buffer.length).toBeGreaterThan(1000);
    // Verificar encabezado PK (formato zip/xlsx)
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
  });

  test('GET /api/export/excel with date range returns formatted Excel document', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/export/excel?desde=2026-08-01&hasta=2026-08-25`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const buffer = await response.body();
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  test('GET /api/export/csv generates formal PDI institutional CSV with UTF-8 BOM', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/export/csv`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/csv');
    const text = await response.text();
    expect(text).toContain('POLICÍA DE INVESTIGACIONES DE CHILE');
    expect(text).toContain('JEFATURA NACIONAL DE MIGRACIONES');
    expect(text).toContain('MATRIZ DE RENDIMIENTO OPERATIVO POR CUARTEL');
  });

  test('POST /api/telegram/enviar sends operational report to Telegram channel', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/telegram/enviar`, {
      data: { fecha: '2026-08-22' }
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.mensaje).toContain('enviado exitosamente');
    expect(data.messageId).toBeDefined();
  });

  test('POST /api/security/cifrar rejects unauthorized requests (HTTP 401)', async ({ request }) => {
    const encRes = await request.post(`${BASE_URL}/api/security/cifrar`, {
      multipart: {
        archivo: {
          name: 'prueba.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from('test', 'utf8'),
        }
      }
    });
    expect(encRes.status()).toBe(401);
  });

  test('POST /api/security/cifrar and /api/security/descifrar roundtrip with valid password protects and recovers file', async ({ request }) => {
    const sampleText = 'PRUEBA_INTEGRIDAD_PDI_2026';
    const sampleBuffer = Buffer.from(sampleText, 'utf8');

    // Cifrar con cabecera de autorización policial
    const encRes = await request.post(`${BASE_URL}/api/security/cifrar`, {
      headers: { 'X-Ingesta-Auth': 'pdi2026' },
      multipart: {
        archivo: {
          name: 'prueba.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: sampleBuffer,
        }
      }
    });
    expect(encRes.ok()).toBeTruthy();
    expect(encRes.headers()['x-hash-original']).toBeDefined();
    expect(encRes.headers()['x-hash-cifrado']).toBeDefined();
    const encBuffer = await encRes.body();
    // Cabecera mágica ABIS_ENC_V1
    expect(encBuffer.toString('utf8', 0, 11)).toBe('ABIS_ENC_V1');

    // Descifrar con cabecera de autorización policial
    const decRes = await request.post(`${BASE_URL}/api/security/descifrar`, {
      headers: { 'X-Ingesta-Auth': 'pdi2026' },
      multipart: {
        archivo: {
          name: 'prueba.xlsx.enc',
          mimeType: 'application/octet-stream',
          buffer: encBuffer,
        }
      }
    });
    expect(decRes.ok()).toBeTruthy();
    const decBuffer = await decRes.body();
    expect(decBuffer.toString('utf8')).toBe(sampleText);
  });

  test('GET /api/settings/schedule returns scheduler configuration, next execution and Chile time', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/settings/schedule`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.config).toBeDefined();
    expect(Array.isArray(data.config.times)).toBeTruthy();
    expect(data.horaChile).toBeDefined();
    expect(data.horaChile.timeStr).toMatch(/^\d{2}:\d{2}$/);
    expect(data.next).toBeDefined();
  });

  test('POST /api/settings/schedule updates schedule times and options', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/settings/schedule`, {
      data: {
        enabled: true,
        times: ['08:30', '14:00', '19:00'],
        days: [1, 2, 3, 4, 5],
        reportType: 'extenso',
      }
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.config.times).toEqual(['08:30', '14:00', '19:00']);
    expect(data.config.days).toEqual([1, 2, 3, 4, 5]);
    expect(data.next).toBeDefined();
  });

  test('POST /api/settings/schedule/test executes immediate test dispatch with valid audit', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/settings/schedule/test`, {
      data: {}
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.resultado).toBeDefined();
    expect(data.resultado.estado).toBe('EXITO');
    expect(data.resultado.canal).toBe('Telegram Oficial PDI');
  });
});