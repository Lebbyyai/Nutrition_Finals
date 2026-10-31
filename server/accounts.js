import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { OAuth2Client } from 'google-auth-library';

const hash = value => createHash('sha256').update(value).digest('hex');
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const genericRecovery = { message: 'If an account uses that email, a recovery link will arrive shortly. Check your spam folder too.' };
const adminSelect = "SELECT id,name,email,passwordHash,'admin' AS role FROM admin_accounts";

// Admin identities are separate from clinical users, preserving the existing
// users table and every patient record without rebuilding foreign keys.
export async function initializeAccounts(db, env, passwordHash) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES admin_accounts(id), expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      tokenHash TEXT PRIMARY KEY, accountId TEXT NOT NULL, accountType TEXT NOT NULL,
      expiresAt INTEGER NOT NULL, claim TEXT, UNIQUE(accountId,accountType)
    );
    CREATE TABLE IF NOT EXISTS recovery_requests (
      emailHash TEXT PRIMARY KEY, requestedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS google_states (
      stateHash TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS google_identities (
      subject TEXT PRIMARY KEY, accountId TEXT NOT NULL, accountType TEXT NOT NULL,
      UNIQUE(accountId,accountType)
    );
  `);
  if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD) return;
  const existing = await db.prepare('SELECT id FROM admin_accounts LIMIT 1').get();
  if (existing) return; // Bootstrap once. Environment changes never reset an account.
  const email = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (env.ADMIN_PASSWORD || '').trim();
  if (!emailPattern.test(email) || password.length < 12 || password.length > 256) {
    throw Object.assign(new Error('Set a valid ADMIN_EMAIL and an ADMIN_PASSWORD of 12–256 characters.'),{code:'ADMIN_CONFIG_INVALID'});
  }
  if (await db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw Object.assign(new Error('Choose an admin email that is not already a clinical account.'),{code:'ADMIN_EMAIL_IN_USE'});
  await db.prepare('INSERT OR IGNORE INTO admin_accounts VALUES (?,?,?,?)').run('owner-admin', (env.ADMIN_NAME || 'Workspace administrator').slice(0,80), email, await passwordHash(password));
}

export async function findAccount(db, email) {
  return await db.prepare(adminSelect + ' WHERE email=?').get(email)
    || await db.prepare('SELECT * FROM users WHERE email=?').get(email);
}

export function recoveryMailer(env, fetcher = fetch) {
  const from=(env.GMAIL_FROM || '').trim();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN || !emailPattern.test(from)) return null;
  return async ({ email, url }) => {
    const tokenResponse = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    });
    if (!tokenResponse.ok) throw new Error('Email service unavailable.');
    const { access_token } = await tokenResponse.json();
    if (!access_token) throw new Error('Email service unavailable.');
    const message = [
      'From: Savor Care <' + from + '>', 'To: ' + email,
      'Subject: Reset your Savor Care password', 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8', '',
      'A password reset was requested for your Savor Care account.',
      'Open this link within 30 minutes to choose a new password:', url, '',
      'If you did not request this, you can ignore this email.',
    ].join('\r\n');
    const sent = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(message).toString('base64url') }),
    });
    if (!sent.ok) throw new Error('Email service unavailable.');
  };
}

export function installAccounts({ app, db, env, appOrigin, auth, role, limiter, insist, textField, passwordHash, verifyPassword, startSession, cookieOptions, options }) {
  const mailer = options.recoveryMailer || recoveryMailer(env);
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && appOrigin);
  const google = options.googleClient || (googleEnabled ? new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, appOrigin + '/api/auth/google/callback') : null);
  const accountType = user => user.role === 'admin' ? 'admin' : 'user';
  const sessionTable = type => type === 'admin' ? 'admin_sessions' : 'sessions';
  const userTable = type => type === 'admin' ? 'admin_accounts' : 'users';
  const validateEmail = value => { const email=textField(value,'Email',254).toLowerCase(); insist(emailPattern.test(email),'Enter a valid email address.'); return email; };

  app.get('/api/auth/options', (req,res) => res.json({ google: googleEnabled, recovery: Boolean(mailer && appOrigin) }));
  app.get('/api/admin/accounts', auth, role('admin'), async (req,res) => {
    const dietitians=await db.prepare("SELECT u.id,u.name,u.email,COUNT(a.patientId) AS patientCount FROM users u LEFT JOIN assignments a ON a.providerId=u.id WHERE u.role='dietitian' GROUP BY u.id ORDER BY u.name").all();
    const patients=await db.prepare("SELECT u.id,u.name,u.email,a.providerId FROM users u LEFT JOIN assignments a ON a.patientId=u.id WHERE u.role='patient' ORDER BY u.name").all();
    res.json({dietitians,patients,recoveryEnabled:Boolean(mailer && appOrigin)});
  });
  app.post('/api/admin/dietitians', auth, role('admin'), limiter(10,15*60000), async(req,res)=>{
    insist(await verifyPassword(textField(req.body.adminPassword,'Your password',256),req.user.passwordHash),'Your administrator password is incorrect.',403);
    const name=textField(req.body.name,'Name',80),email=validateEmail(req.body.email),password=textField(req.body.password,'Initial password',256);
    insist(password.length>=12,'Use a password with at least 12 characters.');
    insist(!(await findAccount(db,email)),'An account with this email already exists.',409);
    const id=randomUUID();
    try { await db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id,name,email,await passwordHash(password),'dietitian'); }
    catch(error){if(String(error.message).includes('UNIQUE'))return res.status(409).json({error:'An account with this email already exists.'});throw error;}
    res.status(201).json({user:{id,name,email,role:'dietitian'}});
  });
  app.patch('/api/admin/assignments',auth,role('admin'),async(req,res)=>{
    const patientId=textField(req.body.patientId,'Patient',80),providerId=textField(req.body.providerId,'Dietitian',80);
    insist(await db.prepare("SELECT id FROM users WHERE id=? AND role='patient'").get(patientId),'Patient not found.',404);
    insist(await db.prepare("SELECT id FROM users WHERE id=? AND role='dietitian'").get(providerId),'Dietitian not found.',404);
    const result=await db.prepare("INSERT INTO assignments (patientId,providerId) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE patientId=? AND status='scheduled') ON CONFLICT(patientId) DO UPDATE SET providerId=excluded.providerId")
      .run(patientId,providerId,patientId);
    insist(result.changes>0,'Finish or cancel the patient’s scheduled appointments before changing their dietitian.',409);
    res.json({ok:true});
  });

  app.post('/api/auth/forgot-password',limiter(10,15*60000),async(req,res)=>{
    const started=Date.now(),email=validateEmail(req.body.email);
    insist(mailer && appOrigin,'Password recovery is not configured yet. Please contact the website owner.',503);
    const now=Date.now(),key=hash(email);
    await db.prepare('DELETE FROM recovery_requests WHERE requestedAt<?').run(now-86400000);
    const request=await db.prepare('INSERT INTO recovery_requests VALUES (?,?) ON CONFLICT(emailHash) DO UPDATE SET requestedAt=excluded.requestedAt WHERE recovery_requests.requestedAt<?').run(key,now,now-60000);
    if(request.changes>0){
      const user=await findAccount(db,email);
      if(user){
        const token=randomBytes(32).toString('hex'),type=accountType(user);
        await db.prepare('INSERT INTO password_resets VALUES (?,?,?,?,NULL) ON CONFLICT(accountId,accountType) DO UPDATE SET tokenHash=excluded.tokenHash,expiresAt=excluded.expiresAt,claim=NULL').run(hash(token),user.id,type,now+30*60000);
        // Delivery happens after queuing so provider latency cannot reveal
        // whether an email belongs to an account through response timing.
        const delivery=Promise.resolve().then(()=>mailer({email,url:appOrigin+'/#reset-password='+token})).catch(async()=>{
          console.warn('Password recovery email could not be delivered. Check the Gmail configuration.');
          await db.prepare('DELETE FROM password_resets WHERE tokenHash=?').run(hash(token));
        }).catch(()=>{}).finally(()=>app.locals.recoveryJobs.delete(delivery));
        app.locals.recoveryJobs.add(delivery);
      }
    }
    await delay(Math.max(0,350-(Date.now()-started)));
    res.json(genericRecovery);
  });
  app.post('/api/auth/reset-password',limiter(15,15*60000),async(req,res)=>{
    const token=textField(req.body.token,'Recovery link',64),password=textField(req.body.password,'Password',256);
    insist(/^[a-f0-9]{64}$/.test(token),'This recovery link is invalid or expired.');
    insist(password.length>=12,'Use a password with at least 12 characters.');
    const tokenHash=hash(token),reset=await db.prepare('SELECT * FROM password_resets WHERE tokenHash=? AND claim IS NULL AND expiresAt>?').get(tokenHash,Date.now());
    insist(reset,'This recovery link is invalid or expired. Request a new one.');
    const claim=randomUUID(),hashed=await passwordHash(password);
    const condition='EXISTS (SELECT 1 FROM password_resets WHERE tokenHash=? AND claim=?)';
    const results=await db.batch([
      {sql:'UPDATE password_resets SET claim=? WHERE tokenHash=? AND claim IS NULL AND expiresAt>?',args:[claim,tokenHash,Date.now()]},
      {sql:'UPDATE '+userTable(reset.accountType)+' SET passwordHash=? WHERE id=? AND '+condition,args:[hashed,reset.accountId,tokenHash,claim]},
      {sql:'DELETE FROM '+sessionTable(reset.accountType)+' WHERE userId=? AND '+condition,args:[reset.accountId,tokenHash,claim]},
    ]);
    insist(results[0].changes>0,'This recovery link is invalid or expired. Request a new one.');
    res.json({message:'Your password has been changed. Sign in with your new password.'});
  });

  app.get('/api/auth/google/start',limiter(20,15*60000),async(req,res)=>{
    if(!googleEnabled)return res.redirect('/?auth_error=google_unavailable');
    const state=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');
    await db.prepare('DELETE FROM google_states WHERE expiresAt<=?').run(Date.now());
    await db.prepare('INSERT INTO google_states VALUES (?,?,?,?)').run(hash(state),nonce,verifier,Date.now()+10*60000);
    res.cookie('savor_google_state',state,{...cookieOptions,sameSite:'lax',maxAge:10*60000,path:'/api/auth/google'});
    res.redirect(google.generateAuthUrl({scope:['openid','email','profile'],state,nonce,code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}));
  });
  app.get('/api/auth/google/callback',limiter(20,15*60000),async(req,res)=>{
    res.clearCookie('savor_google_state',{...cookieOptions,sameSite:'lax',path:'/api/auth/google'});
    try{
      insist(googleEnabled,'Unavailable');
      const state=req.query.state,code=req.query.code;
      const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('savor_google_state='))?.slice(19);
      insist(typeof state==='string' && /^[a-f0-9]{64}$/.test(state) && state===cookie && typeof code==='string','Invalid state');
      const flow=await db.prepare('SELECT * FROM google_states WHERE stateHash=? AND expiresAt>?').get(hash(state),Date.now());
      insist(flow,'Expired state');
      insist((await db.prepare('DELETE FROM google_states WHERE stateHash=?').run(hash(state))).changes>0,'Used state');
      const {tokens}=await google.getToken({code,codeVerifier:flow.verifier});
      const ticket=await google.verifyIdToken({idToken:tokens.id_token,audience:env.GOOGLE_CLIENT_ID});
      const identity=ticket.getPayload();
      insist(identity?.email_verified===true && identity.nonce===flow.nonce && typeof identity.sub==='string','Unverified identity');
      const email=validateEmail(identity.email);
      const linked=await db.prepare('SELECT accountId,accountType FROM google_identities WHERE subject=?').get(identity.sub);
      let user=linked ? await db.prepare((linked.accountType==='admin'?adminSelect:'SELECT * FROM users')+' WHERE id=?').get(linked.accountId) : await findAccount(db,email);
      if(!linked && user){
        // Google is authoritative for Gmail and managed Workspace addresses.
        insist(email.endsWith('@gmail.com') || email.endsWith('@googlemail.com') || identity.hd,'Use password sign-in for this address');
        const existing=await db.prepare('SELECT subject FROM google_identities WHERE accountId=? AND accountType=?').get(user.id,accountType(user));
        insist(!existing || existing.subject===identity.sub,'Identity already linked');
      }
      if(!user){
        insist(!linked,'Account no longer available');
        const provider=await db.prepare("SELECT id FROM users WHERE role='dietitian' ORDER BY id LIMIT 1").get();
        insist(provider,'No dietitian configured');
        const id=randomUUID(),name=(identity.name||email.split('@')[0]).slice(0,80);
        await db.batch([
          {sql:'INSERT INTO users VALUES (?,?,?,?,?)',args:[id,name,email,await passwordHash(randomBytes(32).toString('hex')),'patient']},
          {sql:'INSERT INTO assignments VALUES (?,?)',args:[id,provider.id]},
          {sql:'INSERT INTO google_identities VALUES (?,?,?)',args:[identity.sub,id,'user']},
        ]);
        user={id,name,email,role:'patient'};
      }else if(!linked)await db.prepare('INSERT INTO google_identities VALUES (?,?,?)').run(identity.sub,user.id,accountType(user));
      await startSession(req,res,user.id,user.role);
      res.redirect('/');
    }catch{res.redirect('/?auth_error=google_failed');}
  });
}
