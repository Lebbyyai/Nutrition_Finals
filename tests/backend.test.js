import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, clinicDate } from '../server/app.js';

let app, server, base, patient, dietitian, stranger;
const folder = mkdtempSync(join(tmpdir(), 'savor-test-'));
const dbPath = join(folder, 'test.sqlite');
async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
before(async () => {
  app = await createApp({ dbPath, seed: true, env: { NODE_ENV: 'test' } });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  app.locals.close();
  rmSync(folder, { recursive: true, force: true });
});

test('anonymous access is limited and bad credentials do not authenticate', async () => {
  assert.deepEqual((await request('/api/me')).body, { user: null });
  assert.equal((await request('/api/dashboard')).status, 401);
  const bad = await request('/api/auth/login', { method: 'POST', body: { email: 'maya@example.com', password: 'wrong-password' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.cookie, undefined);
  assert.equal((await request('/api/health')).body.status, 'ok');
});

test('demo accounts authenticate with private cookies and expose no password hash', async () => {
  const login = await request('/api/auth/login', { method: 'POST', body: { email: 'maya@example.com', password: 'SavorDemo123!' } });
  assert.equal(login.status, 200);
  patient = login.cookie;
  assert.equal(login.body.user.role, 'patient');
  assert.equal(login.body.user.passwordHash, undefined);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  const provider = await request('/api/auth/login', { method: 'POST', body: { email: 'alex@example.com', password: 'SavorDemo123!' } });
  dietitian = provider.cookie;
  assert.equal(provider.body.user.role, 'dietitian');
  const dashboard = await request('/api/dashboard', { cookie: patient });
  assert.equal(dashboard.body.meals.length, 7);
  assert.equal(dashboard.body.appointments.length, 1);
  assert.equal(dashboard.body.water.glasses, 4);
  assert.equal((await request('/api/me', { cookie: patient })).body.user.name, 'Maya Santos');
});

test('registration creates only patients, assigns the clinician, and isolates records', async () => {
  const created = await request('/api/auth/register', { method: 'POST', body: { name: 'Test Patient', email: 'test@example.com', password: 'StrongPassword123!', role: 'dietitian' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, 'patient');
  stranger = created.cookie;
  const dashboard = (await request('/api/dashboard', { cookie: stranger })).body;
  assert.deepEqual(dashboard.meals, []);
  assert.deepEqual(dashboard.notes, []);
  assert.deepEqual(dashboard.appointments, []);
  assert.equal(dashboard.patients.length, 1);
  const providerData = (await request('/api/dashboard', { cookie: dietitian })).body;
  assert.ok(providerData.patients.some(p => p.id === created.body.user.id));
  const duplicate = await request('/api/auth/register', { method: 'POST', body: { name: 'Test Patient', email: 'TEST@example.com', password: 'StrongPassword123!' } });
  assert.equal(duplicate.status, 409);
});

test('meal CRUD validates nutrition values and enforces record ownership', async () => {
  const mealData = { name: 'Vegetable omelet', type: 'breakfast', date: clinicDate(), time: '08:30', calories: 320, protein: 22, fiber: 5, mood: 'Satisfied', note: 'Prepared at home.', patientId: 'someone-else' };
  const created = await request('/api/meals', { method: 'POST', cookie: patient, body: mealData });
  assert.equal(created.status, 201);
  assert.equal(created.body.meal.patientId, 'patient-maya');
  assert.equal((await request('/api/meals', { method: 'POST', cookie: dietitian, body: mealData })).status, 403);
  assert.equal((await request('/api/meals', { method: 'POST', cookie: patient, body: { ...mealData, calories: -100 } })).status, 400);
  assert.equal((await request('/api/meals', { method: 'POST', cookie: patient, body: { ...mealData, date: '2026-02-30' } })).status, 400);
  assert.equal((await request(`/api/meals/${created.body.meal.id}`, { method: 'DELETE', cookie: stranger })).status, 404);
  assert.equal((await request(`/api/meals/${created.body.meal.id}`, { method: 'DELETE', cookie: patient })).status, 200);
  assert.equal((await request(`/api/meals/${created.body.meal.id}`, { method: 'DELETE', cookie: patient })).status, 404);
});

test('hydration persists and rejects fractional counts', async () => {
  const result = await request('/api/water', { method: 'POST', cookie: patient, body: { date: clinicDate(), glasses: 6 } });
  assert.equal(result.status, 200);
  assert.equal((await request('/api/dashboard', { cookie: patient })).body.water.glasses, 6);
  assert.equal((await request('/api/water', { method: 'POST', cookie: patient, body: { date: clinicDate(), glasses: 1.5 } })).status, 400);
  assert.equal((await request('/api/water', { method: 'POST', cookie: patient, body: { date: clinicDate(1), glasses: 1 } })).status, 400);
});

test('booking uses future clinic slots, blocks conflicts, and cancellation frees the slot', async () => {
  const body = { date: clinicDate(2), time: '09:00', type: 'First nutrition consultation' };
  const initial = await request(`/api/availability?date=${body.date}`, { cookie: patient });
  assert.equal(initial.body.slots.find(s => s.time === body.time).available, true);
  const created = await request('/api/appointments', { method: 'POST', cookie: patient, body });
  assert.equal(created.status, 201);
  assert.match(created.body.appointment.roomName, /^savor-[a-f0-9]{32}$/);
  assert.equal(created.body.appointment.providerName, 'Dr. Alex Rivera');
  const conflict = await request('/api/appointments', { method: 'POST', cookie: stranger, body });
  assert.equal(conflict.status, 409);
  assert.equal((await request(`/api/availability?date=${body.date}`, { cookie: patient })).body.slots.find(s => s.time === body.time).available, false);
  const url = `/api/appointments/${created.body.appointment.id}`;
  assert.equal((await request(url, { method: 'PATCH', cookie: stranger, body: { status: 'cancelled' } })).status, 404);
  assert.equal((await request(url, { method: 'PATCH', cookie: patient, body: { status: 'completed' } })).status, 403);
  assert.equal((await request(url, { method: 'PATCH', cookie: patient, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await request(url, { method: 'PATCH', cookie: patient, body: { status: 'cancelled' } })).status, 409);
  const rebook = await request('/api/appointments', { method: 'POST', cookie: stranger, body });
  assert.equal(rebook.status, 201);
  assert.notEqual(rebook.body.appointment.roomName, created.body.appointment.roomName);
  assert.equal((await request(`/api/appointments/${rebook.body.appointment.id}`, { method: 'PATCH', cookie: dietitian, body: { status: 'completed' } })).status, 200);
  assert.equal((await request('/api/appointments', { method: 'POST', cookie: patient, body: { ...body, time: '09:15' } })).status, 400);
  assert.equal((await request('/api/appointments', { method: 'POST', cookie: patient, body: { ...body, date: clinicDate(-1) } })).status, 400);
});

test('only clinicians can write SOAP notes and patients see only their shared notes', async () => {
  const body = { patientId: 'patient-maya', subjective: 'Patient describes a busy week.', objective: 'Reviewed self-reported food journal.', assessment: 'Practical meal planning may support consistency.', plan: 'Prepare breakfast ahead twice this week.', shared: false };
  assert.equal((await request('/api/notes', { method: 'POST', cookie: patient, body })).status, 403);
  const privateNote = await request('/api/notes', { method: 'POST', cookie: dietitian, body });
  assert.equal(privateNote.status, 201);
  const sharedNote = await request('/api/notes', { method: 'POST', cookie: dietitian, body: { ...body, shared: true } });
  assert.equal(sharedNote.status, 201);
  const patientNotes = (await request('/api/dashboard', { cookie: patient })).body.notes;
  assert.ok(patientNotes.some(n => n.id === sharedNote.body.note.id));
  assert.ok(patientNotes.every(n => n.subjective === undefined && n.objective === undefined && n.assessment === undefined));
  assert.equal(patientNotes.find(n => n.id === sharedNote.body.note.id).plan, body.plan);
  assert.ok(!patientNotes.some(n => n.id === privateNote.body.note.id));
  assert.ok((await request('/api/dashboard', { cookie: dietitian })).body.notes.some(n => n.id === privateNote.body.note.id));
  assert.equal((await request('/api/dashboard', { cookie: stranger })).body.notes.length, 0);
  assert.equal((await request('/api/notes', { method: 'POST', cookie: dietitian, body: { ...body, patientId: 'missing' } })).status, 404);
});

test('cross-origin writes, invalid bodies, and oversized payloads are rejected', async () => {
  assert.equal((await request('/api/water', { method: 'POST', cookie: patient, body: { date: clinicDate(), glasses: 3 }, headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await request('/api/water', { method: 'POST', cookie: patient, body: null })).status, 400);
  assert.equal((await request('/api/water', { method: 'POST', cookie: patient, body: { note: 'x'.repeat(40000) } })).status, 413);
});

test('data and session survive reopening the SQLite database', async () => {
  const secondApp = await createApp({ dbPath, seed: false, env: { NODE_ENV: 'test' } });
  const row = secondApp.locals.db.prepare('SELECT glasses FROM hydration WHERE patientId=? AND date=?').get('patient-maya', clinicDate());
  assert.equal(row.glasses, 6);
  assert.ok(secondApp.locals.db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total >= 3);
  secondApp.locals.close();
});

test('production requires a trusted app origin and secure session cookies', async () => {
  await assert.rejects(createApp({ dbPath: ':memory:', env: { NODE_ENV: 'production' } }), /APP_ORIGIN/);
  const productionApp = await createApp({ dbPath: ':memory:', seed: true, env: { NODE_ENV: 'production', APP_ORIGIN: 'https://savor.example' } });
  const productionServer = productionApp.listen(0, '127.0.0.1');
  await once(productionServer, 'listening');
  const url = `http://127.0.0.1:${productionServer.address().port}/api/auth/login`;
  const body = JSON.stringify({ email: 'maya@example.com', password: 'SavorDemo123!' });
  try {
    const missing = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(missing.status, 403);
    const valid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://savor.example' }, body });
    assert.equal(valid.status, 200);
    assert.match(valid.headers.get('set-cookie'), /Secure/);
  } finally {
    await new Promise(resolve => productionServer.close(resolve));
    productionApp.locals.close();
  }
});

test('logout revokes the server session immediately', async () => {
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: patient, body: {} })).status, 200);
  assert.equal((await request('/api/dashboard', { cookie: patient })).status, 401);
  assert.equal((await request('/api/me', { cookie: patient })).body.user, null);
});
