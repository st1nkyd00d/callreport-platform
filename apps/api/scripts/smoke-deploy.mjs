#!/usr/bin/env node
// Fase 8 (D9, tarea 16): "criterio adicional" que plan-fase-8.md agrega a
// la fase -- sin esto, "desplegado" no significa nada verificable. Corre
// contra el backend YA DESPLEGADO (Render u otro), con los 3 roles reales
// del seed. Node plano con fetch nativo (Node 22) -- sin DI de Nest, sin
// dependencias nuevas, para poder correrlo desde cualquier lado (CI,
// terminal local) apuntando a cualquier URL.
//
// Uso:
//   SMOKE_BASE_URL=https://callreport-api.onrender.com node scripts/smoke-deploy.mjs
// Default: http://localhost:3000 (útil para probar el propio main.ts local).

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'Password123!';

const ROLES = [
  {
    role: 'agent',
    email: 'agent1@callreport.demo',
    // Camino principal: ver las campañas asignadas (paso previo a
    // registrar un reporte).
    check: { method: 'GET', path: '/agent/campaigns' },
  },
  {
    role: 'client_user',
    email: 'client1@acmecorp.demo',
    // Camino principal: el resumen que alimenta el dashboard.
    check: { method: 'GET', path: '/reports/summary' },
  },
  {
    role: 'supervisor',
    email: 'supervisor@callreport.demo',
    // Camino principal: panel de administración (CRUD de tenants).
    check: { method: 'GET', path: '/admin/tenants' },
  },
];

/** @param {string} path @param {RequestInit} [init] */
async function req(path, init) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`smoke-deploy: apuntando a ${BASE_URL}\n`);
  const results = [];

  const health = await req('/health/ready');
  results.push({
    name: 'GET /health/ready',
    ok: health.status === 200 && health.body?.status === 'ok',
    detail: `status=${health.status} body=${JSON.stringify(health.body)}`,
  });

  for (const { role, email, check } of ROLES) {
    const login = await req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const loginOk = login.status === 200 && Boolean(login.body?.accessToken);
    results.push({
      name: `login ${role} (${email})`,
      ok: loginOk,
      detail: `status=${login.status}`,
    });
    if (!loginOk) continue;

    const action = await req(check.path, {
      method: check.method,
      headers: { Authorization: `Bearer ${login.body.accessToken}` },
    });
    results.push({
      name: `${check.method} ${check.path} como ${role}`,
      ok: action.status === 200,
      detail: `status=${action.status}`,
    });
  }

  console.log('Resultados:\n');
  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name} -- ${r.detail}`);
    if (!r.ok) allOk = false;
  }

  if (!allOk) {
    console.error('\nsmoke-deploy: FALLÓ');
    process.exit(1);
  }
  console.log('\nsmoke-deploy: todo OK');
}

main().catch((err) => {
  console.error('smoke-deploy: error inesperado', err);
  process.exit(1);
});
