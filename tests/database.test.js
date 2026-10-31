import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createClient } from '@libsql/client';
import { openDatabase, wrapClient, databaseDiagnostic } from '../server/database.js';
import { createApp } from '../server/app.js';

test('startup diagnostics report safe codes and HTTP status without private messages', async()=>{
 const error=Object.assign(new Error('private-token and private-url'),{code:'SERVER_ERROR',cause:{status:401,message:'private-token'}});
 assert.equal(databaseDiagnostic(error),'SERVER_ERROR, HTTP 401');
 assert.equal(databaseDiagnostic({code:'private-token',message:'private-url'}),'UNKNOWN');
 const client={executeMultiple:async()=>{throw error;},close:()=>{throw new Error('private-close-error');}};
 await assert.rejects(createApp({databaseClient:client,env:{NODE_ENV:'test'}}),e=>{
  assert.match(e.message,/schema: SERVER_ERROR, HTTP 401/);
  assert.ok(!e.message.includes('private-'));return true;
 });
});

test('cloud mode requires complete credentials and never silently opens SQLite',async()=>{
 for(const env of [{DATABASE_DRIVER:'turso'},{TURSO_DATABASE_URL:'libsql://example.turso.io'},{TURSO_AUTH_TOKEN:'fictional-test-token'},{DATABASE_DRIVER:'other'},{DATABASE_DRIVER:'sqlite',TURSO_DATABASE_URL:'libsql://example.turso.io',TURSO_AUTH_TOKEN:'fictional-test-token'}]) {
  await assert.rejects(openDatabase({env,dbPath:':memory:'}));
 }
 for(const url of ['http://example.turso.io','not-a-url','file:local.db','https://user:password@example.turso.io']) {
  await assert.rejects(openDatabase({env:{TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'fictional-test-token'},dbPath:':memory:'}));
 }
});

test('both official cloud client entry points initialize without exposing their token',async()=>{
 for(const url of ['libsql://example.turso.io','turso://example.turso.io']) {
  const db=await openDatabase({env:{DATABASE_DRIVER:'turso',TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:'fictional-test-token'}});
  assert.equal(db.kind,'turso');assert.equal(db.authToken,undefined);await db.close();
 }
});

test('asynchronous batch rolls back all statements when a later insert fails',async()=>{
 const client=createClient({url:':memory:'});const db=wrapClient(client);
 try {
  await db.exec('CREATE TABLE checks(id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await assert.rejects(db.batch([{sql:'INSERT INTO checks VALUES (?,?)',args:['a','valid']},{sql:'INSERT INTO checks VALUES (?,?)',args:['b',null]}]));
  assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM checks').get()).total,0);
 } finally {await db.close();}
});

test('newer SDK array rows retain named columns and nulls in API JSON',async()=>{
 const row=['patient-maya','Maya',null];
 Object.defineProperty(row,'name',{value:'Maya',enumerable:false});
 const client={execute:async()=>({columns:['id','name','note'],rows:[row]}),close:()=>{}};
 const db=wrapClient(client);
 assert.deepEqual(await db.prepare('SELECT id,name,note FROM users').get(),{id:'patient-maya',name:'Maya',note:null});
 assert.deepEqual(await db.prepare('SELECT id,name,note FROM users').all(),[{id:'patient-maya',name:'Maya',note:null}]);
});

test('seed initialization is atomic when a database write fails',async()=>{
 const client=createClient({url:':memory:'});let closed=false;
 const failingClient={execute:s=>client.execute(s),executeMultiple:s=>client.executeMultiple(s),batch:statements=>client.batch([...statements,{sql:'INSERT INTO assignments VALUES (?,?)',args:['missing','missing']}],'write'),close:()=>{closed=true;}};
 try {
  await client.execute('PRAGMA foreign_keys=ON');
  await assert.rejects(createApp({databaseClient:failingClient,seed:true,env:{NODE_ENV:'test'}}),/Database initialization failed/);
  assert.equal((await client.execute('SELECT COUNT(*) AS total FROM users')).rows[0].total,0);
  assert.equal(closed,true);
 }finally{client.close();}
});

test('database outage produces unhealthy status and generic errors without local fallback',async()=>{
 const client=createClient({url:':memory:'});let offline=false;
 const faultClient={execute:s=>{if(offline)throw new Error('private-database-diagnostic');return client.execute(s);},executeMultiple:s=>client.executeMultiple(s),batch:(s,mode)=>client.batch(s,mode),close:()=>client.close()};
 const app=await createApp({databaseClient:faultClient,seed:true,env:{NODE_ENV:'test'}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try {
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'maya@example.com',password:'SavorDemo123!'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(base+'/api/health')).json()).storage,'turso');
  offline=true;
  const health=await fetch(base+'/api/health');assert.equal(health.status,503);assert.deepEqual(await health.json(),{status:'unavailable'});
  const dashboard=await fetch(base+'/api/dashboard',{headers:{Cookie:cookie}});assert.equal(dashboard.status,500);assert.ok(!(await dashboard.text()).includes('private-database-diagnostic'));
  offline=false;
  assert.equal((await (await fetch(base+'/api/dashboard',{headers:{Cookie:cookie}})).json()).meals.length,7);
 }finally{await new Promise(resolve=>server.close(resolve));await app.locals.close();}
});
