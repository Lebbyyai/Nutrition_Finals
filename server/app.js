import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COOKIE = 'savor_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });
const hashToken = value => createHash('sha256').update(value).digest('hex');
export const clinicDate = (offset = 0) => new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const appointmentInstant = (date, time) => new Date(`${date}T${time}:00+08:00`).getTime();

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function insist(condition, message, status = 400) { if (!condition) throw new RequestError(status, message); }
function textField(value, name, max = 300, required = true) {
  insist(typeof value === 'string' || (!required && value == null), `${name} must be text.`);
  const result = (value || '').trim();
  insist((!required || result.length > 0) && result.length <= max, `${name} must be ${required ? '1' : '0'}–${max} characters.`);
  return result;
}
function validDate(value) {
  insist(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use a valid date (YYYY-MM-DD).');
  const parsed = new Date(`${value}T00:00:00Z`);
  insist(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'Use a valid calendar date.');
  return value;
}
function validTime(value) {
  insist(typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a valid time (HH:MM).');
  return value;
}
function numberField(value, name, max) {
  insist(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max, `${name} must be between 0 and ${max}.`);
  return Math.round(value * 10) / 10;
}
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, encoded] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
function noteRow(row) { return { ...row, shared: Boolean(row.shared) }; }

function schema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('patient','dietitian'))
    );
    CREATE TABLE IF NOT EXISTS assignments (
      patientId TEXT PRIMARY KEY REFERENCES users(id), providerId TEXT NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      type TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, calories REAL NOT NULL,
      protein REAL NOT NULL, fiber REAL NOT NULL, mood TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES users(id), providerId TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', roomName TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appointment_slot ON appointments(providerId, date, time) WHERE status != 'cancelled';
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES users(id), providerId TEXT NOT NULL REFERENCES users(id),
      createdAt TEXT NOT NULL, subjective TEXT NOT NULL, objective TEXT NOT NULL,
      assessment TEXT NOT NULL, plan TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS hydration (
      patientId TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, glasses INTEGER NOT NULL,
      PRIMARY KEY(patientId, date)
    );
  `);
}

async function seed(db, enabled, env) {
  if (db.prepare('SELECT COUNT(*) AS total FROM users').get().total > 0) return;
  if (!enabled && !env.PROVIDER_EMAIL) return;
  const providerId = 'provider-alex';
  const providerEmail = (env.PROVIDER_EMAIL || 'alex@example.com').trim().toLowerCase();
  const providerPassword = env.PROVIDER_PASSWORD || (enabled ? 'SavorDemo123!' : '');
  insist(providerPassword.length >= 12, 'PROVIDER_PASSWORD must contain at least 12 characters.');
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(providerId, env.PROVIDER_NAME || 'Dr. Alex Rivera', providerEmail, await passwordHash(providerPassword), 'dietitian');
  if (!enabled) return;
  const patientId = 'patient-maya';
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(patientId, 'Maya Santos', 'maya@example.com', await passwordHash('SavorDemo123!'), 'patient');
  db.prepare('INSERT INTO assignments VALUES (?,?)').run(patientId, providerId);
  const insertMeal = db.prepare('INSERT INTO meals VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const examples = [
    ['Sunrise oats & mango', 'breakfast', 0, '07:45', 385, 16, 8, 'Energized', 'Rolled oats, milk, ripe mango, and a spoon of chia. A slow breakfast before class.'],
    ['Calamansi chicken bowl', 'lunch', 0, '12:15', 540, 36, 7, 'Satisfied', 'Grilled chicken, brown rice, cucumber, tomato, and a bright calamansi dressing.'],
    ['Banana & peanut butter', 'snack', 0, '15:00', 210, 6, 4, 'Content', 'An easy study break snack.'],
    ['Tinola with malunggay', 'dinner', -1, '18:30', 465, 32, 6, 'Satisfied', 'Home-cooked chicken tinola with green papaya and a small bowl of rice.'],
    ['Tuna pandesal & papaya', 'breakfast', -1, '08:00', 370, 24, 5, 'Energized', 'Whole-wheat pandesal with tuna, cucumber, and fresh papaya.'],
    ['Tofu pinakbet bowl', 'lunch', -2, '12:30', 490, 22, 9, 'Satisfied', 'A colorful vegetable bowl with tofu and rice.'],
    ['Overnight cacao oats', 'breakfast', -3, '07:30', 350, 14, 7, 'Content', 'Prepared the night before for a calmer morning.'],
  ];
  for (const [name, type, offset, time, calories, protein, fiber, mood, note] of examples) {
    insertMeal.run(randomUUID(), patientId, name, type, clinicDate(offset), time, calories, protein, fiber, mood, note);
  }
  db.prepare('INSERT INTO hydration VALUES (?,?,?)').run(patientId, clinicDate(), 4);
  db.prepare('INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), patientId, providerId, clinicDate(1), '14:00', 'Nutrition follow-up', 'scheduled', `savor-${randomBytes(16).toString('hex')}`);
  db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), patientId, providerId, new Date(Date.now() - 3 * 86400000).toISOString(), 'Maya wants more steady energy during long class days. Enjoys familiar Filipino meals and cooking with family.', 'Demo journal shows regular breakfasts and a varied mix of grains, vegetables, and protein foods. Nutrition values are self-reported estimates.', 'Focus on a practical, consistent meal rhythm that fits the student schedule. This synthetic chart is for demonstration only.', 'Try preparing breakfast the night before twice this week. Add one colorful vegetable to lunch and check in on hunger before an afternoon snack. Review what felt easy at our next visit.', 1);
}

export async function createApp(options = {}) {
  const env = options.env || process.env;
  const production = env.NODE_ENV === 'production';
  const jitsiDomain = env.JITSI_DOMAIN || 'meet.jit.si';
  insist(/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?::\d{2,5})?$/i.test(jitsiDomain), 'JITSI_DOMAIN must be a hostname, for example meet.jit.si.');
  const appOrigin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : null;
  if (production) {
    insist(appOrigin, 'APP_ORIGIN is required in production.');
    const originUrl = new URL(appOrigin);
    insist(originUrl.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname), 'APP_ORIGIN must use HTTPS in production.');
  }
  const dbPath = options.dbPath || env.DB_PATH || resolve(ROOT, 'data', 'savor.sqlite');
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  schema(db);
  await seed(db, options.seed ?? (env.SEED_DEMO ? env.SEED_DEMO === 'true' : !production), env);
  const dummyHash = await passwordHash(randomBytes(20).toString('hex'));
  const app = express();
  app.disable('x-powered-by');
  app.locals.db = db;
  app.locals.close = () => db.close();
  const rates = new Map();
  const limiter = (limit, windowMs) => (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    if (rates.size > 10000) for (const [k, bucket] of rates) if (bucket.until <= now) rates.delete(k);
    let bucket = rates.get(key);
    if (!bucket || bucket.until <= now) { bucket = { count: 0, until: now + windowMs }; rates.set(key, bucket); }
    if (++bucket.count > limit) { res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000))); return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' }); }
    next();
  };
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': `camera=(self "https://${jitsiDomain}"), microphone=(self "https://${jitsiDomain}"), geolocation=()` });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const expected = appOrigin || `${req.protocol}://${req.get('host')}`;
      const developmentOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001'];
      if ((origin && origin !== expected && (production || !developmentOrigins.includes(origin))) || (!origin && production)) return res.status(403).json({ error: 'This request must come from the application origin.' });
      if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'Send requests as application/json.' });
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && (!req.body || Array.isArray(req.body) || typeof req.body !== 'object')) return res.status(400).json({ error: 'Send a JSON object in the request body.' });
    next();
  });
  app.use('/api', (req, res, next) => {
    const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    req.sessionToken = raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
    req.user = req.sessionToken ? db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? AND s.expiresAt>?').get(hashToken(req.sessionToken), Date.now()) : null;
    next();
  });
  const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' });
  const role = value => (req, res, next) => req.user.role === value ? next() : res.status(403).json({ error: 'Your account cannot perform this action.' });
  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
  function startSession(req, res, userId) {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hashToken(req.sessionToken));
    db.prepare('DELETE FROM sessions WHERE expiresAt<=?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token), userId, Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
  }
  const assignedProvider = patientId => db.prepare('SELECT providerId FROM assignments WHERE patientId=?').get(patientId)?.providerId;
  const appointmentById = id => db.prepare('SELECT a.*, u.name AS patientName, p.name AS providerName FROM appointments a JOIN users u ON u.id=a.patientId JOIN users p ON p.id=a.providerId WHERE a.id=?').get(id);
  const noteById = id => noteRow(db.prepare('SELECT n.*, u.name AS patientName FROM notes n JOIN users u ON u.id=n.patientId WHERE n.id=?').get(id));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/config', (req, res) => res.json({ jitsiDomain, timezone: 'Asia/Manila' }));
  app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  app.post('/api/auth/login', limiter(15, 15 * 60000), async (req, res) => {
    const email = textField(req.body.email, 'Email', 254).toLowerCase();
    const password = textField(req.body.password, 'Password', 256);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const valid = await verifyPassword(password, user?.passwordHash || dummyHash);
    insist(user && valid, 'The email or password is incorrect.', 401);
    startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/register', limiter(5, 15 * 60000), async (req, res) => {
    const name = textField(req.body.name, 'Name', 80);
    const email = textField(req.body.email, 'Email', 254).toLowerCase();
    insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
    const password = textField(req.body.password, 'Password', 256);
    insist(password.length >= 12, 'Use a password with at least 12 characters.');
    insist(!db.prepare('SELECT id FROM users WHERE email=?').get(email), 'An account with this email already exists.', 409);
    const provider = db.prepare("SELECT id FROM users WHERE role='dietitian' ORDER BY id LIMIT 1").get();
    insist(provider, 'Registration will open once a dietitian is configured.', 503);
    const id = randomUUID();
    const hashed = await passwordHash(password);
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, name, email, hashed, 'patient');
      db.prepare('INSERT INTO assignments VALUES (?,?)').run(id, provider.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); if (String(error.message).includes('UNIQUE')) throw new RequestError(409, 'An account with this email already exists.'); throw error; }
    startSession(req, res, id);
    res.status(201).json({ user: { id, name, email, role: 'patient' } });
  });
  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hashToken(req.sessionToken));
    res.clearCookie(COOKIE, cookieOptions);
    res.json({ ok: true });
  });
  app.get('/api/dashboard', auth, (req, res) => {
    const provider = req.user.role === 'dietitian';
    const scope = provider ? 'patientId IN (SELECT patientId FROM assignments WHERE providerId=?)' : 'patientId=?';
    const meals = db.prepare(`SELECT * FROM meals WHERE ${scope} ORDER BY date DESC, time DESC`).all(req.user.id);
    const appointments = db.prepare(`SELECT a.*, u.name AS patientName, p.name AS providerName FROM appointments a JOIN users u ON u.id=a.patientId JOIN users p ON p.id=a.providerId WHERE ${provider ? 'a.providerId=?' : 'a.patientId=?'} ORDER BY date, time`).all(req.user.id);
    const notes = db.prepare(`SELECT n.*, u.name AS patientName FROM notes n JOIN users u ON u.id=n.patientId WHERE ${provider ? 'n.providerId=?' : 'n.patientId=? AND n.shared=1'} ORDER BY createdAt DESC`).all(req.user.id).map(noteRow);
    const water = db.prepare('SELECT date, glasses FROM hydration WHERE patientId=? AND date=?').get(req.user.id, clinicDate()) || { date: clinicDate(), glasses: 0 };
    const patients = provider ? db.prepare('SELECT u.id, u.name, u.email FROM users u JOIN assignments a ON u.id=a.patientId WHERE a.providerId=? ORDER BY u.name').all(req.user.id) : [{ id: req.user.id, name: req.user.name, email: req.user.email }];
    const visibleNotes = provider ? notes : notes.map(({ id, patientId, patientName, createdAt, plan, shared }) => ({ id, patientId, patientName, createdAt, plan, shared }));
    res.json({ meals, appointments, notes: visibleNotes, water, patients });
  });
  app.post('/api/meals', auth, role('patient'), (req, res) => {
    const b = req.body;
    const meal = { id: randomUUID(), patientId: req.user.id, name: textField(b.name, 'Meal name', 100), type: textField(b.type, 'Meal type', 20).toLowerCase(), date: validDate(b.date), time: validTime(b.time), calories: numberField(b.calories, 'Calories', 10000), protein: numberField(b.protein, 'Protein', 1000), fiber: numberField(b.fiber, 'Fiber', 1000), mood: textField(b.mood, 'Feeling', 40), note: textField(b.note, 'Note', 1000, false) };
    insist(['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.type), 'Choose breakfast, lunch, dinner, or snack.');
    insist(meal.date <= clinicDate(), 'Meal entries cannot be dated in the future.');
    db.prepare('INSERT INTO meals VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(meal));
    res.status(201).json({ meal });
  });
  app.delete('/api/meals/:id', auth, role('patient'), (req, res) => {
    const result = db.prepare('DELETE FROM meals WHERE id=? AND patientId=?').run(req.params.id, req.user.id);
    insist(result.changes > 0, 'Meal entry not found.', 404);
    res.json({ ok: true });
  });
  app.post('/api/water', auth, role('patient'), (req, res) => {
    const date = validDate(req.body.date);
    const glasses = numberField(req.body.glasses, 'Glasses', 30);
    insist(Number.isInteger(req.body.glasses), 'Glasses must be a whole number.');
    insist(date <= clinicDate(), 'Hydration cannot be dated in the future.');
    db.prepare('INSERT INTO hydration VALUES (?,?,?) ON CONFLICT(patientId,date) DO UPDATE SET glasses=excluded.glasses').run(req.user.id, date, glasses);
    res.json({ water: { date, glasses } });
  });
  app.get('/api/availability', auth, (req, res) => {
    const date = validDate(req.query.date);
    const providerId = req.user.role === 'dietitian' ? req.user.id : assignedProvider(req.user.id);
    const booked = db.prepare("SELECT time FROM appointments WHERE providerId=? AND date=? AND status!='cancelled'").all(providerId, date).map(a => a.time);
    res.json({ slots: SLOTS.map(time => ({ time, available: !booked.includes(time) && appointmentInstant(date, time) > Date.now() })) });
  });
  app.post('/api/appointments', auth, role('patient'), (req, res) => {
    const date = validDate(req.body.date);
    const time = validTime(req.body.time);
    const type = textField(req.body.type, 'Visit type', 80);
    insist(SLOTS.includes(time), 'Choose one of the available clinic time slots.');
    insist(appointmentInstant(date, time) > Date.now(), 'Choose a future appointment time.');
    const providerId = assignedProvider(req.user.id);
    insist(providerId, 'A dietitian must be assigned before booking.', 409);
    const id = randomUUID();
    try {
      db.prepare('INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?)').run(id, req.user.id, providerId, date, time, type, 'scheduled', `savor-${randomBytes(16).toString('hex')}`);
    } catch (error) { if (String(error.message).includes('UNIQUE')) throw new RequestError(409, 'This time was just booked. Please select another slot.'); throw error; }
    res.status(201).json({ appointment: appointmentById(id) });
  });
  app.patch('/api/appointments/:id', auth, (req, res) => {
    const appointment = appointmentById(req.params.id);
    insist(appointment && (req.user.role === 'dietitian' ? appointment.providerId === req.user.id : appointment.patientId === req.user.id), 'Appointment not found.', 404);
    const status = req.body.status;
    insist(['cancelled', 'completed'].includes(status), 'Choose cancelled or completed.');
    insist(status !== 'completed' || req.user.role === 'dietitian', 'Only your dietitian can complete a visit.', 403);
    insist(appointment.status === 'scheduled', 'This appointment has already been closed.', 409);
    db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status, appointment.id);
    res.json({ appointment: appointmentById(appointment.id) });
  });
  app.post('/api/notes', auth, role('dietitian'), (req, res) => {
    const patientId = textField(req.body.patientId, 'Patient', 80);
    insist(assignedProvider(patientId) === req.user.id, 'Patient not found in your care list.', 404);
    const fields = ['subjective', 'objective', 'assessment', 'plan'].map(field => textField(req.body[field], field[0].toUpperCase() + field.slice(1), 3000));
    insist(typeof req.body.shared === 'boolean', 'Specify whether this note is shared.');
    const id = randomUUID();
    db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?)').run(id, patientId, req.user.id, new Date().toISOString(), ...fields, req.body.shared ? 1 : 0);
    res.status(201).json({ note: noteById(id) });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const dist = resolve(ROOT, 'dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false }));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request contains invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Please try again.' });
  });
  return app;
}
