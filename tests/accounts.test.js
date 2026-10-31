import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestApp } from './helpers/database.js';
import { recoveryMailer } from '../server/accounts.js';

const adminEmail='owner@example.com',adminPassword='OwnerPassword123!';
async function fixture(t,overrides={}){
  const messages=[];
  const env={NODE_ENV:'test',APP_ORIGIN:'http://localhost:3014',ADMIN_EMAIL:adminEmail,ADMIN_PASSWORD:adminPassword,...overrides.env};
  const app=await createTestApp({dbPath:':memory:',seed:true,...overrides,env,recoveryMailer:overrides.recoveryMailer===null?undefined:overrides.recoveryMailer|| (async m=>messages.push(m))});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));await app.locals.close();});
  const base='http://127.0.0.1:'+server.address().port;
  async function request(path,{method='GET',body,cookie,redirect='follow'}={}){
    const response=await fetch(base+'/api'+path,{method,redirect,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    const cookies=response.headers.getSetCookie();
    return {status:response.status,json,text,headers:response.headers,cookie:(cookies.find(c=>c.startsWith('savor_session='))||cookies[0])?.split(';')[0]};
  }
  async function login(email,password){return request('/auth/login',{method:'POST',body:{email,password}});}
  return {app,request,login,messages};
}
const resetToken=message=>new URL(message.url).hash.slice('#reset-password='.length);

test('admin bootstrap rejects invalid settings and clinical email collisions with safe diagnostics',async()=>{
  for(const [env,code] of [
    [{ADMIN_EMAIL:'owner@example.com'},'ADMIN_CONFIG_INVALID'],
    [{ADMIN_EMAIL:'maya@example.com',ADMIN_PASSWORD:adminPassword},'ADMIN_EMAIL_IN_USE'],
  ])await assert.rejects(createTestApp({dbPath:':memory:',seed:true,env:{NODE_ENV:'test',...env}}),error=>{
    assert.ok(error.message.includes(code));assert.ok(!error.message.includes(adminPassword));return true;
  });
});

test('admin bootstrap preserves seeded clinical records and has no clinical dashboard access',async t=>{
  const f=await fixture(t);const admin=await f.login(adminEmail,adminPassword);
  assert.equal(admin.json.user.role,'admin');assert.equal(admin.json.user.passwordHash,undefined);
  const dashboard=await f.request('/dashboard',{cookie:admin.cookie});assert.deepEqual(dashboard.json.meals,[]);assert.deepEqual(dashboard.json.notes,[]);
  assert.equal((await f.app.locals.db.prepare('SELECT COUNT(*) AS total FROM meals').get()).total,7);
  assert.equal((await f.request('/notes',{method:'POST',cookie:admin.cookie,body:{}})).status,403);
  assert.equal((await f.request('/meals/missing',{method:'PATCH',cookie:admin.cookie,body:{}})).status,403);
  const logout=await f.request('/auth/logout',{method:'POST',cookie:admin.cookie,body:{}});assert.equal(logout.status,200);
  assert.equal((await f.request('/admin/accounts',{cookie:admin.cookie})).status,401);
});

test('only a reauthenticated administrator can create dietitians and duplicate emails are rejected',async t=>{
  const f=await fixture(t),admin=await f.login(adminEmail,adminPassword),patient=await f.login('maya@example.com','SavorDemo123!'),doctor=await f.login('alex@example.com','SavorDemo123!');
  const body={name:'Dr. Casey Reyes',email:'casey@example.com',password:'CaseyPassword123!',adminPassword,role:'admin'};
  assert.equal((await f.request('/admin/accounts')).status,401);
  for(const cookie of [patient.cookie,doctor.cookie])assert.equal((await f.request('/admin/dietitians',{method:'POST',cookie,body})).status,403);
  assert.equal((await f.request('/admin/dietitians',{method:'POST',cookie:admin.cookie,body:{...body,adminPassword:'wrong'}})).status,403);
  const created=await f.request('/admin/dietitians',{method:'POST',cookie:admin.cookie,body});assert.equal(created.status,201);assert.equal(created.json.user.role,'dietitian');assert.equal(created.json.user.passwordHash,undefined);
  assert.equal((await f.login(body.email,body.password)).json.user.role,'dietitian');
  assert.equal((await f.request('/admin/dietitians',{method:'POST',cookie:admin.cookie,body})).status,409);
  assert.equal((await f.request('/auth/register',{method:'POST',body:{name:'Intruder',email:adminEmail,password:'AnotherPassword123!',role:'admin'}})).status,409);
});

test('administrators can assign patients but scheduled appointments prevent reassignment',async t=>{
  const f=await fixture(t),admin=await f.login(adminEmail,adminPassword);
  const created=await f.request('/admin/dietitians',{method:'POST',cookie:admin.cookie,body:{name:'Dr. Casey',email:'casey@example.com',password:'CaseyPassword123!',adminPassword}});
  const assign={method:'PATCH',cookie:admin.cookie,body:{patientId:'patient-maya',providerId:created.json.user.id}};
  assert.equal((await f.request('/admin/assignments',assign)).status,409);
  await f.app.locals.db.prepare("UPDATE appointments SET status='cancelled'").run();
  assert.equal((await f.request('/admin/assignments',assign)).status,200);
  const clinician=await f.login('casey@example.com','CaseyPassword123!');
  assert.equal((await f.request('/dashboard',{cookie:clinician.cookie})).json.patients[0].id,'patient-maya');
  assert.equal((await f.request('/admin/accounts',{cookie:clinician.cookie})).status,403);
});

for(const [label,email,password] of [['patient','maya@example.com','SavorDemo123!'],['dietitian','alex@example.com','SavorDemo123!'],['admin',adminEmail,adminPassword]]){
  test(label+' password recovery is private, single-use, and revokes existing sessions',async t=>{
    const f=await fixture(t),login=await f.login(email,password);
    const result=await f.request('/auth/forgot-password',{method:'POST',body:{email}});
    assert.equal(result.status,200);assert.equal(f.messages.length,1);assert.ok(!JSON.stringify(result.json).includes('reset-password='));
    const token=resetToken(f.messages[0]);
    const stored=await f.app.locals.db.prepare('SELECT * FROM password_resets').get();assert.notEqual(stored.tokenHash,token);
    assert.equal((await f.request('/auth/reset-password',{method:'POST',body:{token,password:'tiny'}})).status,400);
    const body={token,password:'ChangedPassword123!'};
    assert.equal((await f.request('/auth/reset-password',{method:'POST',body})).status,200);
    assert.equal((await f.request('/me',{cookie:login.cookie})).json.user,null);
    assert.equal((await f.login(email,password)).status,401);
    assert.equal((await f.login(email,body.password)).status,200);
    assert.equal((await f.request('/auth/reset-password',{method:'POST',body})).status,400);
  });
}

test('recovery treats unknown addresses identically and applies persistent email cooldown',async t=>{
  const f=await fixture(t);
  const known=await f.request('/auth/forgot-password',{method:'POST',body:{email:'maya@example.com'}});
  const unknown=await f.request('/auth/forgot-password',{method:'POST',body:{email:'missing@example.com'}});
  assert.deepEqual(known.json,unknown.json);
  await f.request('/auth/forgot-password',{method:'POST',body:{email:'maya@example.com'}});
  assert.equal(f.messages.length,1);
  await f.app.locals.db.prepare('UPDATE password_resets SET expiresAt=0').run();
  assert.equal((await f.request('/auth/reset-password',{method:'POST',body:{token:resetToken(f.messages[0]),password:'ChangedPassword123!'}})).status,400);
  assert.equal((await f.request('/auth/reset-password',{method:'POST',body:{token:'0'.repeat(64),password:'ChangedPassword123!'}})).status,400);
});

test('concurrent reset submissions can consume a recovery link only once',async t=>{
  const f=await fixture(t);await f.request('/auth/forgot-password',{method:'POST',body:{email:'maya@example.com'}});
  const token=resetToken(f.messages[0]);
  const results=await Promise.all(['FirstPassword123!','SecondPassword123!'].map(password=>f.request('/auth/reset-password',{method:'POST',body:{token,password}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});

test('unconfigured email recovery is explicit and never returns a reset token',async t=>{
  const f=await fixture(t,{recoveryMailer:null});
  assert.equal((await f.request('/auth/options')).json.recovery,false);
  for(const email of ['maya@example.com','missing@example.com'])assert.equal((await f.request('/auth/forgot-password',{method:'POST',body:{email}})).status,503);
});

test('Gmail delivery uses HTTPS OAuth and encodes the intended recovery message',async()=>{
  const calls=[];
  const send=recoveryMailer({GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GMAIL_REFRESH_TOKEN:'refresh',GMAIL_FROM:'sender@gmail.com'},async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>({access_token:'private-access'})};
  });
  await send({email:'patient@example.com',url:'https://example.com/#reset-password=fictional'});
  assert.equal(calls.length,2);assert.equal(calls[1].url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  const raw=Buffer.from(JSON.parse(calls[1].options.body).raw,'base64url').toString();
  assert.ok(raw.includes('To: patient@example.com'));assert.ok(raw.includes('#reset-password=fictional'));assert.ok(!raw.includes('private-access'));
});

function mockGoogle(){
  return {identity:{sub:'google-patient',email:'newpatient@gmail.com',email_verified:true,name:'New Patient'},flow:null,
    generateAuthUrl(options){this.flow=options;return 'https://accounts.google.com/o/oauth2/v2/auth?state='+options.state;},
    async getToken(){return {tokens:{id_token:'verified-by-mock'}};},
    async verifyIdToken(){return {getPayload:()=>({...this.identity,nonce:this.flow.nonce})};},
  };
}
async function googleStart(f){const start=await f.request('/auth/google/start',{redirect:'manual'});return {start,state:new URL(start.headers.get('location')).searchParams.get('state')};}
const googleEnv={GOOGLE_CLIENT_ID:'fictional-client',GOOGLE_CLIENT_SECRET:'fictional-secret'};

test('Google sign-in uses state and PKCE, creates only patients, and rejects replay',async t=>{
  const google=mockGoogle(),f=await fixture(t,{env:googleEnv,googleClient:google});
  const {start,state}=await googleStart(f);
  assert.ok(google.flow.code_challenge);assert.equal(google.flow.code_challenge_method,'S256');
  assert.ok(start.headers.get('set-cookie').includes('SameSite=Lax'));
  const callback='/auth/google/callback?state='+state+'&code=fictional';
  assert.ok((await f.request(callback,{redirect:'manual'})).headers.get('location').includes('google_failed'));
  const result=await f.request(callback,{cookie:start.cookie,redirect:'manual'});assert.equal(result.headers.get('location'),'/');
  const user=(await f.request('/me',{cookie:result.cookie})).json.user;assert.equal(user.role,'patient');assert.equal(user.email,'newpatient@gmail.com');
  assert.ok((await f.request(callback,{cookie:start.cookie,redirect:'manual'})).headers.get('location').includes('google_failed'));
});

test('Google login retains authorized dietitian/admin roles and never links an unverified identity',async t=>{
  const google=mockGoogle(),f=await fixture(t,{env:googleEnv,googleClient:google});
  for(const [email,expected] of [['alex@example.com','dietitian'],[adminEmail,'admin']]){
    google.identity={sub:'google-'+expected,email,email_verified:true,hd:'example.com'};
    const {start,state}=await googleStart(f);
    const result=await f.request('/auth/google/callback?state='+state+'&code=fake',{cookie:start.cookie,redirect:'manual'});
    assert.equal((await f.request('/me',{cookie:result.cookie})).json.user.role,expected);
  }
  google.identity={sub:'unverified',email:'alex@example.com',email_verified:false};
  const {start,state}=await googleStart(f);
  assert.ok((await f.request('/auth/google/callback?state='+state+'&code=fake',{cookie:start.cookie,redirect:'manual'})).headers.get('location').includes('google_failed'));
});

test('adding the first admin to an existing database preserves patient data and sessions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'savor-admin-')),dbPath=join(dir,'existing.db');
  let app;
  try{
    app=await createTestApp({dbPath,seed:true,env:{NODE_ENV:'test'}});
    await app.locals.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('patient-real','Existing Patient','existing@example.com','existing-hash','patient');
    await app.locals.db.prepare('INSERT INTO assignments VALUES (?,?)').run('patient-real','provider-alex');
    await app.locals.db.prepare('INSERT INTO meals VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('retained-meal','patient-real','Tinola','lunch','2026-10-31','12:00',0,0,0,'Satisfied','Retain this entry');
    await app.locals.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('existing-session','patient-real',Date.now()+60000);
    await app.locals.close();app=null;
    app=await createTestApp({dbPath,seed:true,env:{NODE_ENV:'test',ADMIN_EMAIL:adminEmail,ADMIN_PASSWORD:adminPassword}});
    assert.equal((await app.locals.db.prepare('SELECT name FROM meals WHERE id=?').get('retained-meal')).name,'Tinola');
    assert.equal((await app.locals.db.prepare('SELECT COUNT(*) AS count FROM users').get()).count,3);
    assert.ok(await app.locals.db.prepare('SELECT * FROM sessions WHERE tokenHash=?').get('existing-session'));
    assert.ok(await app.locals.db.prepare('SELECT * FROM admin_accounts').get());
    const initialAdmin=await app.locals.db.prepare('SELECT * FROM admin_accounts').get();
    await app.locals.close();app=null;
    app=await createTestApp({dbPath,seed:true,env:{NODE_ENV:'test',ADMIN_EMAIL:adminEmail}});
    assert.deepEqual(await app.locals.db.prepare('SELECT * FROM admin_accounts').get(),initialAdmin);
  }finally{if(app)await app.locals.close();await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

test('Google callback rejects expired flows, nonce mismatches and unsafe email auto-linking',async t=>{
  const google=mockGoogle(),f=await fixture(t,{env:googleEnv,googleClient:google});
  let flow=await googleStart(f);
  await f.app.locals.db.prepare('UPDATE google_states SET expiresAt=0').run();
  assert.ok((await f.request('/auth/google/callback?state='+flow.state+'&code=fake',{cookie:flow.start.cookie,redirect:'manual'})).headers.get('location').includes('google_failed'));
  flow=await googleStart(f);
  google.verifyIdToken=async()=>({getPayload:()=>({...google.identity,nonce:'wrong-nonce'})});
  assert.ok((await f.request('/auth/google/callback?state='+flow.state+'&code=fake',{cookie:flow.start.cookie,redirect:'manual'})).headers.get('location').includes('google_failed'));
  flow=await googleStart(f);
  google.verifyIdToken=async()=>({getPayload:()=>({sub:'third-party-address',email:'alex@example.com',email_verified:true,nonce:google.flow.nonce})});
  assert.ok((await f.request('/auth/google/callback?state='+flow.state+'&code=fake',{cookie:flow.start.cookie,redirect:'manual'})).headers.get('location').includes('google_failed'));
});
