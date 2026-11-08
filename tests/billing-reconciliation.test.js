import test from 'node:test';
import assert from 'node:assert/strict';
import {billingDatabase} from './helpers/billing-database.js';
import {createSandboxSubscriptionService,readSandboxSubscriptionState} from '../lib/billing-reconciliation.js';
const scope='sandbox-status-fixture',priceId='price_monthly';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(t){
 const {db,sqlite}=billingDatabase(t),clock={time:1900000000000},calls=[];
 const bind=(user='alice',customer='cus_alice',sandbox=scope)=>sqlite.prepare('INSERT INTO billing_accounts(scope,user_id,reference,customer_key,customer_id) VALUES(?,?,?,?,?)').run(sandbox,user,sandbox+user,sandbox+user+'key',customer);
 const subscription=(customer='cus_alice',status='active')=>({id:'sub_'+customer,customer,livemode:false,status,items:{data:[{price:{id:priceId},quantity:1,current_period_end:clock.time/1000+3600}]}});
 const state={subscriptions:[subscription()]};
 const gateway={listSubscriptions:async customer=>{calls.push(customer);return state.subscriptions.filter(s=>s.customer===customer);}};
 const options={db,gateway,scope,priceId,mode:'test',now:()=>clock.time},service=createSandboxSubscriptionService(options);
 const pending=(id='evt_pending',customer='cus_alice')=>sqlite.prepare('INSERT INTO billing_events(scope,event_id,customer_id,payload_hash,event_type,received_at) VALUES(?,?,?,?,?,?)').run(scope,id,customer,'hash','customer.subscription.updated',clock.time);
 const read=()=>readSandboxSubscriptionState({...options,userId:'alice'});
 bind();bind('bob','cus_bob');return {db,sqlite,clock,calls,bind,subscription,state,gateway,options,service,pending,read};
}
test('status refreshes the mapped customer, reuses fresh state and does not create accounts',async t=>{
 const f=fixture(t);assert.equal((await f.service.status('alice')).status,'active');assert.equal((await f.service.status('alice')).status,'active');assert.equal(f.calls.length,1);
 assert.equal((await f.service.status('bob')).status,'inactive');assert.deepEqual(f.calls,['cus_alice','cus_bob']);
 assert.equal((await f.service.status('new')).status,'inactive');assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_accounts').get().n,2);
 await assert.rejects(f.service.status(null));assert.throws(()=>createSandboxSubscriptionService({...f.options,mode:'live'}));
});
test('cache expires, detects changed plan IDs and cannot share state between sandbox scopes',async t=>{
 const f=fixture(t);await f.service.status('alice');f.clock.time+=300000;await f.service.status('alice');assert.equal(f.calls.length,2);
 const otherPlan=createSandboxSubscriptionService({...f.options,priceId:'price_other'});assert.equal((await otherPlan.status('alice')).status,'inactive');assert.equal(f.calls.length,3);
 assert.equal((await f.service.status('alice')).status,'active');
 const otherScope=createSandboxSubscriptionService({...f.options,scope:'another-sandbox-fixture'});assert.equal((await otherScope.status('alice')).status,'inactive');assert.equal(f.calls.length,4);
});
test('renewal is refreshed at the period boundary; canceled or failed subscriptions lose save access',async t=>{
 const f=fixture(t);await f.service.status('alice');f.clock.time+=3600000;f.state.subscriptions=[f.subscription()];
 const renewed=await f.service.status('alice');assert.equal(renewed.status,'active');assert.equal(renewed.until,f.clock.time/1000+3600);
 for(const status of ['past_due','canceled','unpaid','paused','incomplete']){f.pending('evt_'+status);f.state.subscriptions=[f.subscription('cus_alice',status)];assert.equal((await f.service.status('alice')).status,'inactive');}
});
test('known pending events reconcile with the snapshot, leaving other owners untouched',async t=>{
 const f=fixture(t);f.pending();f.pending('evt_bob','cus_bob');assert.equal((await f.service.status('alice')).status,'active');
 const rows=f.sqlite.prepare('SELECT event_id,processed_at FROM billing_events ORDER BY event_id').all();assert.equal(rows.find(r=>r.event_id==='evt_bob').processed_at,null);assert.equal(rows.find(r=>r.event_id==='evt_pending').processed_at,f.clock.time);
});
test('an event arriving during the provider read remains pending and prevents a stale grant',async t=>{
 const f=fixture(t),list=f.gateway.listSubscriptions;f.gateway.listSubscriptions=async customer=>{const result=await list(customer);f.pending();return result;};
 await assert.rejects(f.service.status('alice'),e=>e.status===503);assert.equal((await f.read()).status,'inactive');
 assert.equal(f.sqlite.prepare('SELECT processed_at FROM billing_events').get().processed_at,null);
 f.gateway.listSubscriptions=list;f.state.subscriptions=[];assert.equal((await f.service.status('alice')).status,'inactive');
});
test('provider errors do not revive expired access and do not acknowledge pending events',async t=>{
 const f=fixture(t);await f.service.status('alice');f.clock.time+=300000;f.pending();
 f.gateway.listSubscriptions=async()=>{throw Error('private provider detail');};
 await assert.rejects(f.service.status('alice'),e=>e.status===503&&!e.message.includes('private provider'));assert.equal((await f.read()).status,'inactive');
 assert.equal(f.sqlite.prepare('SELECT processed_at FROM billing_events').get().processed_at,null);
});
test('concurrent refreshes serialize and an expired lease holder cannot overwrite a newer state',async t=>{
 const f=fixture(t),entered=deferred(),release=deferred();let calls=0;
 f.gateway.listSubscriptions=async()=>{if(++calls===1){const old=f.subscription();entered.resolve();await release.promise;return [old];}return [];};
 const first=f.service.status('alice');await entered.promise;await assert.rejects(f.service.status('alice'),e=>e.status===503);
 f.clock.time+=90001;assert.equal((await f.service.status('alice')).status,'inactive');release.resolve();await assert.rejects(first,e=>e.status===503);
 assert.equal((await f.read()).status,'inactive');assert.equal(f.sqlite.prepare('SELECT status FROM billing_subscription_state').get().status,'inactive');
});
test('failed receipt transactions roll back refreshed access and remain retryable',async t=>{
 const f=fixture(t);f.pending();f.sqlite.exec("CREATE TRIGGER fail_receipt BEFORE UPDATE ON billing_events BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
 await assert.rejects(f.service.status('alice'),e=>e.status===503);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM billing_subscription_state').get().n,0);
 f.sqlite.exec('DROP TRIGGER fail_receipt');assert.equal((await f.service.status('alice')).status,'active');
});
test('foreign/live provider responses and excessive pending backlogs never grant access',async t=>{
 const f=fixture(t);
 for(const item of [f.subscription('cus_bob'),{...f.subscription(),livemode:true}]){f.gateway.listSubscriptions=async()=>[item];await assert.rejects(f.service.status('alice'),e=>e.status===503);}
 for(let n=0;n<51;n++)f.pending('evt_backlog'+n);
 let called=false;f.gateway.listSubscriptions=async()=>{called=true;return [];};await assert.rejects(f.service.status('alice'),e=>e.status===503);assert.equal(called,false);
});
