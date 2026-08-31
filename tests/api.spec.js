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
});