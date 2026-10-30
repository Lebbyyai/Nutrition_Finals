import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { clinicDate } from '../server/app.js';
import { createTestApp as createApp } from './helpers/database.js';

let app, server, origin, patient, clinician;
async function call(path, {method='GET', body, cookie, headers={}, raw}={}) {
  const response=await fetch(origin+path,{method,headers:{...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:raw!==undefined?{body:raw}:{})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
before(async()=>{app=await createApp({dbPath:':memory:',seed:true,env:{NODE_ENV:'test'}});server=app.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
 patient=(await call('/api/auth/login',{method:'POST',body:{email:'maya@example.com',password:'SavorDemo123!'}})).cookie;
 clinician=(await call('/api/auth/login',{method:'POST',body:{email:'alex@example.com',password:'SavorDemo123!'}})).cookie;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await app.locals.close();});

test('every protected workflow rejects anonymous requests',async()=>{
 for(const [method,path,body] of [['GET','/api/dashboard'],['GET',`/api/availability?date=${clinicDate(3)}`],['POST','/api/meals',{}],['POST','/api/water',{}],['POST','/api/appointments',{}],['POST','/api/notes',{}],['PATCH','/api/appointments/missing',{}],['DELETE','/api/meals/missing']])
  assert.equal((await call(path,{method,body})).status,401,`${method} ${path}`);
});
test('registration rejects invalid email, short passwords and empty names',async()=>{
 for(const patch of [{email:'not-an-email'},{password:'short'},{name:'   '}])assert.equal((await call('/api/auth/register',{method:'POST',body:{name:'QA Example',email:'qa@example.com',password:'SavorStrong123!',...patch}})).status,400);
});
test('meal fields reject invalid calendar dates, future dates, times and non-numeric values',async()=>{
 const base={name:'QA meal',type:'lunch',date:clinicDate(),time:'12:00',calories:0,protein:0,fiber:0,mood:'Satisfied',note:''};
 for(const patch of [{date:'2026-02-30'},{date:clinicDate(1)},{time:'24:00'},{time:'12:99'},{calories:'100'},{protein:1001},{fiber:-1},{type:'brunch'},{name:' '}])assert.equal((await call('/api/meals',{method:'POST',cookie:patient,body:{...base,...patch}})).status,400,JSON.stringify(patch));
 const valid=await call('/api/meals',{method:'POST',cookie:patient,body:base});assert.equal(valid.status,201);assert.equal(valid.data.meal.calories,0);
});
test('simultaneous booking attempts reserve only one clinician slot',async()=>{
 const body={date:clinicDate(5),time:'09:30',type:'QA race check'};
 const results=await Promise.all([call('/api/appointments',{method:'POST',cookie:patient,body}),call('/api/appointments',{method:'POST',cookie:patient,body})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
});
test('completed appointments cannot be cancelled or completed again',async()=>{
 const booking=await call('/api/appointments',{method:'POST',cookie:patient,body:{date:clinicDate(6),time:'10:30',type:'QA completion'}});
 const path='/api/appointments/'+booking.data.appointment.id;
 assert.equal((await call(path,{method:'PATCH',cookie:clinician,body:{status:'completed'}})).status,200);
 assert.equal((await call(path,{method:'PATCH',cookie:patient,body:{status:'cancelled'}})).status,409);
 assert.equal((await call(path,{method:'PATCH',cookie:clinician,body:{status:'completed'}})).status,409);
 const another=await call('/api/appointments',{method:'POST',cookie:patient,body:{date:clinicDate(7),time:'11:00',type:'QA concurrent close'}});
 const concurrentPath='/api/appointments/'+another.data.appointment.id;
 const closing=await Promise.all([call(concurrentPath,{method:'PATCH',cookie:clinician,body:{status:'completed'}}),call(concurrentPath,{method:'PATCH',cookie:patient,body:{status:'cancelled'}})]);
 assert.deepEqual(closing.map(result=>result.status).sort(),[200,409]);
});
test('hydration bounds and role rules hold for patient and clinician',async()=>{
 for(const glasses of [-1,31,0.5,'4'])assert.equal((await call('/api/water',{method:'POST',cookie:patient,body:{date:clinicDate(),glasses}})).status,400);
 assert.equal((await call('/api/water',{method:'POST',cookie:patient,body:{date:clinicDate(),glasses:30}})).status,200);
 assert.equal((await call('/api/water',{method:'POST',cookie:clinician,body:{date:clinicDate(),glasses:1}})).status,403);
});
test('valid maximum-length multilingual SOAP notes can be saved',async()=>{
 const value='食'.repeat(3000);
 const result=await call('/api/notes',{method:'POST',cookie:clinician,body:{patientId:'patient-maya',subjective:value,objective:value,assessment:value,plan:value,shared:true}});
 assert.equal(result.status,201);
 assert.equal(result.data.note.plan.length,3000);
  assert.equal((await call('/api/notes',{method:'POST',cookie:clinician,body:{padding:'x'.repeat(100000)}})).status,413);
});
test('records from a second clinician stay inaccessible to the first clinician',async()=>{
 const db=app.locals.db;
 const hash=(await db.prepare("SELECT passwordHash FROM users WHERE id='provider-alex'").get()).passwordHash;
 await db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('provider-other','QA Clinician','other@example.com',hash,'dietitian');
 await db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('patient-other','QA Patient','another@example.com',hash,'patient');
 await db.prepare('INSERT INTO assignments VALUES (?,?)').run('patient-other','provider-other');
 await db.prepare('INSERT INTO meals VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('other-meal','patient-other','Private QA meal','lunch',clinicDate(),'12:00',100,1,1,'Neutral','Private');
 const data=(await call('/api/dashboard',{cookie:clinician})).data;
 assert.ok(!data.patients.some(p=>p.id==='patient-other'));assert.ok(!data.meals.some(m=>m.id==='other-meal'));
 assert.equal((await call('/api/notes',{method:'POST',cookie:clinician,body:{patientId:'patient-other',subjective:'x',objective:'x',assessment:'x',plan:'x',shared:false}})).status,404);
});
test('expired sessions stop authenticating and replacement login revokes the old token',async()=>{
 const login=await call('/api/auth/login',{method:'POST',body:{email:'maya@example.com',password:'SavorDemo123!'}});
 const replacement=await call('/api/auth/login',{method:'POST',cookie:login.cookie,body:{email:'maya@example.com',password:'SavorDemo123!'}});
 assert.notEqual(login.cookie,replacement.cookie);assert.equal((await call('/api/dashboard',{cookie:login.cookie})).status,401);
 await app.locals.db.prepare('UPDATE sessions SET expiresAt=?').run(Date.now()-1);
 assert.equal((await call('/api/dashboard',{cookie:replacement.cookie})).status,401);
 assert.equal((await call('/api/me',{cookie:replacement.cookie})).data.user,null);
});
test('invalid cookies, malformed JSON and non-JSON writes fail safely',async()=>{
 assert.equal((await call('/api/me',{cookie:'savor_session=not-a-token'})).data.user,null);
 assert.equal((await call('/api/auth/login',{method:'POST',raw:'{broken'})).status,400);
 assert.equal((await call('/api/auth/login',{method:'POST',raw:'{}',headers:{'Content-Type':'text/plain'}})).status,415);
 assert.equal((await call('/api/unknown')).status,404);
 assert.equal((await call('/api/health')).headers.get('cache-control'),'no-store');
});
