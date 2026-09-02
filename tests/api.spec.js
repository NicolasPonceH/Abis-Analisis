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
    expect(text).toContain('PDI CHILE');
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
});