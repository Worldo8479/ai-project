import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createSandboxWebhookHandler,readSandboxSubscriptionState} from '../lib/billing-webhooks.js';
const scope='sandbox-webhook-fixture',priceId='price_monthly',signingSecret='whsec_notARealSecretOnlyTestFixture';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(t){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 t.after(()=>sqlite.close());
 const clock={time:1900000000000},state={subscriptions:[],calls:0,failBatch:false};
 const query=(sql,args)=>({all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}}),sql,args});
 const db={prepare:sql=>({bind:(...args)=>query(sql,args)}),batch:async statements=>{
   sqlite.exec('BEGIN');try{const results=statements.map((s,i)=>{if(state.failBatch&&i===1)throw Error('simulated database failure');return {meta:{changes:sqlite.prepare(s.sql).run(...s.args).changes}};});sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}
 }};
 const bind=(user='alice',customer='cus_alice',sandbox=scope)=>sqlite.prepare('INSERT INTO billing_accounts(scope,user_id,reference,customer_key,customer_id) VALUES(?,?,?,?,?)').run(sandbox,user,sandbox+user,sandbox+user+'key',customer);
 bind();bind('bob','cus_bob');
 const gateway={listSubscriptions:async customer=>{state.calls++;return state.subscriptions.filter(s=>s.customer===customer);}};
 const options={db,gateway,scope,priceId,signingSecret,mode:'test',now:()=>clock.time};
 const handler=createSandboxWebhookHandler(options);
 const event=(id='evt_first',customer='cus_alice',type='customer.subscription.updated')=>({id,object:'event',livemode:false,api_version:'2026-10-28.endive',created:Math.floor(clock.time/1000),type,data:{object:{id:'sub_fixture',customer,status:'active'}}});
 const send=async(e=event(),change={})=>{
   const payload=typeof e==='string'?e:JSON.stringify(e);
   const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:signingSecret,timestamp:Math.floor(clock.time/1000),...change.sign});
   return handler(new Request('https://private.example/webhook',{method:change.method??'POST',headers:{'stripe-signature':signature,...change.headers},...(change.method==='GET'?{}:{body:change.body??payload})}));
 };
 const subscription=(customer='cus_alice',status='active')=>({id:'sub_'+customer,customer,status,livemode:false,items:{data:[{price:{id:priceId},quantity:1,current_period_end:Math.floor(clock.time/1000)+3600}]}});
 const read=(userId='alice',sandbox=scope)=>readSandboxSubscriptionState({db,scope:sandbox,priceId,userId,now:()=>clock.time});
 return {sqlite,db,clock,state,gateway,options,handler,event,send,subscription,read,bind};
}

test('official SDK rejects tampering, wrong signatures, stale requests and unsigned bodies before database writes',async t=>{
 const f=setup(t),event=f.event();
 for(const change of [{body:JSON.stringify({...event,livemode:true})},{sign:{secret:'wrong'}},{sign:{timestamp:Math.floor(f.clock.time/1000)-301}},{headers:{'stripe-signature':''}}])assert.equal((await f.send(event,change)).status,400);
 assert.equal((await f.send(event,{method:'GET'})).status,405);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_events').get().n,0);assert.equal(f.state.calls,0);
});

test('rejects live, Connect, thin, incompatible and malformed events; ignores unrelated types',async t=>{
 const f=setup(t);
 for(const change of [{livemode:true},{account:'acct_foreign'},{context:'acct_foreign'},{object:'v2.core.event'},{api_version:'wrong'},{id:'invalid'},{data:{object:{customer:'bad'}}}])assert.equal((await f.send({...f.event(),...change})).status,400);
 assert.equal((await f.send(f.event('evt_other','cus_alice','product.updated'))).status,200);
 assert.equal(f.state.calls,0);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_events').get().n,0);
 assert.throws(()=>createSandboxWebhookHandler({...f.options,mode:'live'}));
});

test('body size limit applies to streams even without content-length',async t=>{
 const f=setup(t);assert.equal((await f.send('x'.repeat(256*1024+1))).status,413);
 assert.equal((await f.send(f.event(),{headers:{'content-length':String(256*1024+1)}})).status,413);
 assert.equal(f.state.calls,0);
});

test('signed notifications reconcile only the mapped account; duplicate deliveries do not repeat work',async t=>{
 const f=setup(t),event=f.event();f.state.subscriptions=[f.subscription(),f.subscription('cus_bob')];
 assert.equal((await f.send(event)).status,200);assert.equal((await f.read()).status,'active');assert.equal((await f.read('bob')).status,'inactive');
 assert.equal((await f.send(event)).status,200);assert.equal(f.state.calls,1);
 assert.equal((await f.send({...event,created:event.created-1})).status,400);
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_subscription_state').get().n,1);
 assert.equal((await f.read('alice','another-sandbox-scope')).status,'inactive');
 await assert.rejects(f.read(null),/Sign in/);
});

test('an older active event cannot restore a currently canceled subscription',async t=>{
 const f=setup(t);f.state.subscriptions=[f.subscription()];await f.send();
 f.state.subscriptions=[f.subscription('cus_alice','canceled')];
 const old=f.event('evt_old');old.created-=86400;
 assert.equal((await f.send(old)).status,200);assert.equal((await f.read()).status,'inactive');
});

test('provider failures remain retryable, redact errors, and block cached paid access until reconciled',async t=>{
 const f=setup(t);f.state.subscriptions=[f.subscription()];await f.send();
 const list=f.gateway.listSubscriptions;f.gateway.listSubscriptions=async()=>{throw Error('private provider response');};
 const event=f.event('evt_retry');const failed=await f.send(event);assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private provider/);
 assert.equal((await f.read()).status,'inactive');
 f.gateway.listSubscriptions=list;assert.equal((await f.send(event)).status,200);assert.equal((await f.read()).status,'active');
});

test('events arriving before customer binding retry after it is persisted',async t=>{
 const f=setup(t),event=f.event('evt_early','cus_carol');
 assert.equal((await f.send(event)).status,503);f.bind('carol','cus_carol');f.state.subscriptions=[f.subscription('cus_carol')];
 assert.equal((await f.send(event)).status,200);assert.equal((await f.read('carol')).status,'active');
});

test('notification processing respects the checkout lease and serializes concurrent deliveries',async t=>{
 const f=setup(t);f.state.subscriptions=[f.subscription()];
 f.sqlite.prepare('UPDATE billing_accounts SET lock_token=?,lock_until=? WHERE user_id=?').run('checkout',f.clock.time+90000,'alice');
 assert.equal((await f.send()).status,503);assert.equal(f.state.calls,0);
 f.sqlite.prepare('UPDATE billing_accounts SET lock_until=0 WHERE user_id=?').run('alice');
 const entered=deferred(),release=deferred(),list=f.gateway.listSubscriptions;
 f.gateway.listSubscriptions=async c=>{entered.resolve();await release.promise;return list(c);};
 const one=f.send();await entered.promise;assert.equal((await f.send()).status,503);release.resolve();assert.equal((await one).status,200);
 assert.equal((await f.send()).status,200);assert.equal(f.state.calls,1);
});

test('a superseded lease holder cannot overwrite a newer cancellation or acknowledge its old event',async t=>{
 const f=setup(t),entered=deferred(),release=deferred();let calls=0;
 f.gateway.listSubscriptions=async()=>{if(++calls===1){const old=f.subscription();entered.resolve();await release.promise;return [old];}return [f.subscription('cus_alice','canceled')];};
 const one=f.send();await entered.promise;f.clock.time+=90001;
 assert.equal((await f.send(f.event('evt_new'))).status,200);release.resolve();assert.equal((await one).status,503);
 assert.equal(f.sqlite.prepare('SELECT status FROM billing_subscription_state').get().status,'inactive');
 assert.equal(f.sqlite.prepare('SELECT processed_at FROM billing_events WHERE event_id=?').get('evt_first').processed_at,null);
});

test('receipt failure rolls back access changes and a retry finishes both atomically',async t=>{
 const f=setup(t);f.state.subscriptions=[f.subscription()];f.state.failBatch=true;
 assert.equal((await f.send()).status,503);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_subscription_state').get().n,0);
 assert.equal(f.sqlite.prepare('SELECT processed_at FROM billing_events').get().processed_at,null);
 f.state.failBatch=false;assert.equal((await f.send()).status,200);assert.equal((await f.read()).status,'active');
});

test('foreign and live provider records cannot become persisted access',async t=>{
 const f=setup(t);for(const subscription of [f.subscription('cus_bob'),{...f.subscription(),livemode:true}]){
 f.gateway.listSubscriptions=async()=>[subscription];assert.equal((await f.send()).status,503);
 }assert.equal((await f.read()).status,'inactive');
});

test('access requires an unexpired period and recent reconciliation, while fresh cancellation remains inactive',async t=>{
 const f=setup(t);f.state.subscriptions=[f.subscription()];await f.send();
 f.clock.time+=5*60*1000;assert.equal((await f.read()).status,'inactive');assert.equal((await f.read()).needsRefresh,true);
 await f.send(f.event('evt_refresh'));assert.equal((await f.read()).status,'active');
 f.state.subscriptions[0].items.data[0].current_period_end=Math.floor(f.clock.time/1000)+1;
 await f.send(f.event('evt_short'));f.clock.time+=1000;assert.equal((await f.read()).status,'inactive');assert.equal((await f.read()).needsRefresh,true);
 f.state.subscriptions=[f.subscription('cus_alice','canceled')];await f.send(f.event('evt_cancel'));
 assert.deepEqual(await f.read(),{status:'inactive',needsRefresh:false,until:null,cancelsAtPeriodEnd:false});
});
