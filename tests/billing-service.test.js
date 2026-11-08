import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {createSandboxBillingService, handleSandboxBillingRequest} from '../lib/billing-service.js';

function setup(t) {
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  }
  t.after(()=>sqlite.close());
  const db={prepare:sql=>({bind:(...args)=>({all:async()=>({results:sqlite.prepare(sql).all(...args)}),
    run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})})};
  const clock={time:1900000000000};
  const calls={customer:[],prepare:[],checkout:[],retrieve:[],portal:[]};
  const sessions=new Map(), customers=new Map();
  const gateway={
    async createCustomer(reference,key){calls.customer.push({reference,key});if(!customers.has(key))customers.set(key,'cus_'+customers.size);return customers.get(key);},
    async prepareCheckout(customer){calls.prepare.push(customer);},
    async resumeCheckout(customer,key){calls.checkout.push({customer,key});if(!sessions.has(key))sessions.set(key,{id:'cs_test_'+sessions.size,
      status:'open',expiresAt:Math.floor(clock.time/1000)+3600,url:'https://checkout.stripe.com/test/'+sessions.size,customer});return {...sessions.get(key)};},
    async retrieveCheckout(customer,id){calls.retrieve.push({customer,id});const result=[...sessions.values()].find(s=>s.id===id);assert.equal(result.customer,customer);return {...result};},
    async portal(customer,key){calls.portal.push({customer,key});return {url:'https://billing.stripe.com/test/'+customer};}
  };
  const service=createSandboxBillingService({db,gateway,scope:'sandbox-test-scope-1234',now:()=>clock.time});
  const request=(action='checkout',body={},origin='https://test.example')=>new Request('https://test.example/api/billing/'+action,
    {method:'POST',headers:{origin},body:JSON.stringify(body)});
  const send=(user='alice',action='checkout',body={},origin)=>handleSandboxBillingRequest(request(action,body,origin),user,service);
  return {db,sqlite,clock,calls,sessions,customers,gateway,service,send};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('billing is account-scoped and ignores forged customer, owner and retry keys',async t=>{
  const f=setup(t);
  assert.equal((await f.send(null)).status,401);
  assert.equal((await f.send('alice','checkout',{},'https://evil.example')).status,403);
  assert.equal(f.calls.customer.length,0);
  assert.equal((await f.send()).status,200);
  assert.equal((await f.send('bob','checkout',{userId:'alice',customerId:'cus_0',requestKey:'stolen'})).status,200);
  const rows=f.sqlite.prepare('SELECT * FROM billing_accounts ORDER BY user_id').all();
  assert.notEqual(rows[0].customer_id,rows[1].customer_id);
  assert.notEqual(rows[0].reference,rows[1].reference);
  assert.ok(f.calls.customer.every(c=>!['alice','bob'].includes(c.reference)));
  await f.send('bob','portal',{customerId:'cus_0'});
  assert.equal(f.calls.portal[0].customer,rows[1].customer_id);
  assert.throws(()=>f.sqlite.prepare('UPDATE billing_accounts SET customer_id=? WHERE user_id=?').run(rows[0].customer_id,'bob'),/UNIQUE/);
});

test('double clicks are serialized and a later click reuses the open checkout',async t=>{
  const f=setup(t),entered=deferred(),release=deferred(),create=f.gateway.resumeCheckout;
  f.gateway.resumeCheckout=async(...args)=>{entered.resolve();await release.promise;return create(...args);};
  const first=f.send();await entered.promise;
  assert.equal((await f.send()).status,409);
  release.resolve();const result=await (await first).json();
  assert.equal((await (await f.send()).json()).url,result.url);
  assert.equal(f.customers.size,1);assert.equal(f.sessions.size,1);
  assert.equal(f.calls.checkout.length,1);assert.equal(f.calls.retrieve.length,1);
});

test('a lost checkout response resumes with the persisted key after service reconstruction',async t=>{
  const f=setup(t),create=f.gateway.resumeCheckout;let lost=true;
  f.gateway.resumeCheckout=async(...args)=>{const result=await create(...args);if(lost){lost=false;throw Error('network lost after provider creation');}return result;};
  assert.equal((await f.send()).status,503);
  const fresh=createSandboxBillingService({db:f.db,gateway:f.gateway,scope:'sandbox-test-scope-1234',now:()=>f.clock.time});
  assert.ok((await fresh.checkout('alice')).url);
  assert.equal(f.sessions.size,1);assert.equal(f.calls.checkout[0].key,f.calls.checkout[1].key);
  assert.equal(f.calls.prepare.length,1);
});

test('customer creation also resumes safely after a lost response',async t=>{
  const f=setup(t),create=f.gateway.createCustomer;let lost=true;
  f.gateway.createCustomer=async(...args)=>{const result=await create(...args);if(lost){lost=false;throw Error('lost customer response');}return result;};
  assert.equal((await f.send()).status,503);assert.equal((await f.send()).status,200);
  assert.equal(f.customers.size,1);assert.equal(f.calls.customer[0].key,f.calls.customer[1].key);
});

test('preflight rejection cannot become an unchecked checkout on retry',async t=>{
  const f=setup(t);f.gateway.prepareCheckout=async()=>{throw Error('existing active subscription');};
  for(let i=0;i<2;i++)assert.equal((await f.send()).status,503);
  assert.equal(f.calls.checkout.length,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_checkouts').get().n,0);
});

test('uncertain requests beyond the safe retry window require reconciliation',async t=>{
  for(const operation of ['createCustomer','resumeCheckout']){
    const f=setup(t),create=f.gateway[operation];
    f.gateway[operation]=async(...args)=>{await create(...args);throw Error('lost response');};
    assert.equal((await f.send()).status,503);
    f.clock.time+=23*60*60*1000;
    const response=await f.send();assert.equal(response.status,409);
    assert.match((await response.json()).error,/reconciliation/);
    assert.equal(f.calls.customer.length,1);
    assert.equal(f.calls.checkout.length,operation==='resumeCheckout'?1:0);
  }
});

test('only confirmed expiry permits replacing a session; completed checkout never grants access',async t=>{
  const f=setup(t);await f.send();
  const original=[...f.sessions.values()][0];original.status='expired';
  assert.equal((await f.send()).status,200);assert.equal(f.sessions.size,2);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM billing_checkouts WHERE state='expired'").get().n,1);
  [...f.sessions.values()][1].status='complete';
  const result=await f.send();assert.equal(result.status,409);
  assert.match((await result.json()).error,/billing settings/);
  assert.equal(f.sessions.size,2);
  assert.equal(f.sqlite.prepare("SELECT state FROM billing_checkouts WHERE state!='expired'").get().state,'complete');
});

test('expired leases recover with the same key and late writers cannot change state',async t=>{
  const f=setup(t),entered=deferred(),release=deferred(),create=f.gateway.resumeCheckout;let first=true;
  f.gateway.resumeCheckout=async(...args)=>{const result=await create(...args);if(first){first=false;entered.resolve();await release.promise;}return result;};
  const stale=f.send();await entered.promise;f.clock.time+=90001;
  assert.equal((await f.send()).status,200);
  release.resolve();assert.equal((await stale).status,409);
  assert.equal(f.sessions.size,1);assert.equal(f.calls.checkout[0].key,f.calls.checkout[1].key);
  assert.equal(f.sqlite.prepare('SELECT lock_until FROM billing_accounts').get().lock_until,0);
});

test('unknown billing accounts cannot open a portal and provider errors are redacted',async t=>{
  const f=setup(t);assert.equal((await f.send('alice','portal')).status,409);
  f.gateway.createCustomer=async()=>{throw Error('private@example.com sk_test_secret');};
  const response=await f.send();assert.equal(response.status,503);
  assert.doesNotMatch(JSON.stringify(await response.json()),/private|secret|sk_test/);
});

test('real gateway and durable coordinator preserve exact checkout parameters across a lost response',async t=>{
  const {createStripeSandboxGateway}=await import('../lib/stripe-sandbox.js');
  const f=setup(t),posts=[];let lost=true;
  const price={id:'price_monthly',active:true,livemode:false,currency:'usd',unit_amount:2900,
    type:'recurring',billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const gateway=createStripeSandboxGateway({mode:'test',secretKey:'sk_test_fixture',priceId:'price_monthly',
    siteOrigin:'https://test.example'},async(url,options)=>{
    if(url.endsWith('/prices/price_monthly'))return Response.json(price);
    if(url.includes('/subscriptions?'))return Response.json({data:[],has_more:false});
    if(url.endsWith('/customers'))return Response.json({id:'cus_realcontract',livemode:false});
    assert.ok(url.endsWith('/checkout/sessions'));
    posts.push({key:options.headers['Idempotency-Key'],body:options.body.toString()});
    if(lost){lost=false;throw Error('response lost after session was created');}
    return Response.json({id:'cs_test_realcontract',customer:'cus_realcontract',mode:'subscription',livemode:false,
      status:'open',expires_at:f.clock.time/1000+3600,url:'https://checkout.stripe.com/c/pay/realcontract'});
  });
  const service=createSandboxBillingService({db:f.db,gateway,scope:'sandbox-test-scope-1234',now:()=>f.clock.time});
  await assert.rejects(service.checkout('alice'));
  assert.match((await service.checkout('alice')).url,/checkout.stripe.com/);
  assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);
  assert.equal(f.sqlite.prepare('SELECT session_id FROM billing_checkouts').get().session_id,'cs_test_realcontract');
});

test('an ended subscription retires only its own completed checkout and allows a fresh attempt',async t=>{
 for(const status of ['canceled','incomplete_expired']){
  const f=setup(t);assert.equal((await f.send()).status,200);
  const old=[...f.sessions.values()][0];old.status='complete';old.subscriptionId='sub_ended';
  f.gateway.listSubscriptions=async customer=>[{id:'sub_ended',customer,livemode:false,status}];
  assert.equal((await f.send()).status,200);
  assert.equal(f.sessions.size,2);
  const states=f.sqlite.prepare('SELECT state FROM billing_checkouts ORDER BY created_at,request_key').all().map(r=>r.state).sort();
  assert.deepEqual(states,['open','retired']);
  assert.equal((await f.send()).status,200);assert.equal(f.sessions.size,2);
 }
});

test('unknown, foreign, live or still-running subscription states cannot authorize re-subscription',async t=>{
 for(const change of [{status:'active'},{status:'trialing'},{status:'past_due'},{status:'unpaid'},
  {status:'paused'},{status:'incomplete'},{customer:'cus_foreign'},{livemode:true},{id:'sub_unrelated'},null]){
  const f=setup(t);await f.send();const old=[...f.sessions.values()][0];old.status='complete';old.subscriptionId='sub_previous';
  f.gateway.listSubscriptions=async customer=>change===null?[]:[{id:'sub_previous',customer,livemode:false,status:'canceled',...change}];
  const response=await f.send();assert.equal(response.status,409);assert.equal(f.sessions.size,1);
  assert.equal(f.sqlite.prepare('SELECT state FROM billing_checkouts').get().state,'complete');
 }
});

test('re-subscription still checks for any other active subscription before creating checkout',async t=>{
 const f=setup(t);await f.send();const old=[...f.sessions.values()][0];old.status='complete';old.subscriptionId='sub_ended';
 f.gateway.listSubscriptions=async customer=>[{id:'sub_ended',customer,livemode:false,status:'canceled'}];
 f.gateway.prepareCheckout=async()=>{throw Error('Another active provider subscription exists');};
 assert.equal((await f.send()).status,503);assert.equal(f.sessions.size,1);
 assert.equal(f.sqlite.prepare('SELECT state FROM billing_checkouts').get().state,'retired');
 assert.equal((await f.send()).status,503);assert.equal(f.sessions.size,1);
});
