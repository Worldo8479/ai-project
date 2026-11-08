// Local workerd + D1 acceptance; fixtures only, no Stripe network calls or keys.
// Uses the esbuild/Miniflare versions locked by our Wrangler toolchain.
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import Stripe from 'stripe';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const scope='sandbox-worker-fixture',secret='whsec_notARealSecretOnlyTestFixture';
const source=`import {createSandboxWebhookHandler} from './lib/billing-webhooks.js';
export default {async fetch(request,env) {
 const gateway={async listSubscriptions(customer) {
  const state=await env.DB.prepare('SELECT data FROM verification_provider WHERE customer=?').bind(customer).first();
  if(!state)throw Error('Fixture unavailable');return JSON.parse(state.data);
 }};
 return createSandboxWebhookHandler({db:env.DB,gateway,scope:${JSON.stringify(scope)},priceId:'price_monthly',
  signingSecret:${JSON.stringify(secret)},mode:'test'})(request);
}};`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'verification-worker.js'},bundle:true,write:false,
 platform:'browser',format:'esm',conditions:['workerd','browser'],target:'es2022'});
const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB']});
const checks=[];
try {
 const db=await mf.getD1Database('DB');
 for(const name of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
  const sql=await readFile('drizzle/'+name,'utf8');
  await db.batch(sql.split('--> statement-breakpoint').filter(s=>s.trim()).map(s=>db.prepare(s)));
 }
 await db.prepare('INSERT INTO billing_accounts(scope,user_id,reference,customer_key,customer_id) VALUES(?,?,?,?,?)').bind(scope,'alice','account_worker','key_worker','cus_worker').run();
 await db.prepare('CREATE TABLE verification_provider(customer TEXT PRIMARY KEY,data TEXT NOT NULL)').run();
 const subscription={id:'sub_worker',customer:'cus_worker',livemode:false,status:'active',items:{data:[{price:{id:'price_monthly'},quantity:1,current_period_end:Math.floor(Date.now()/1000)+3600}]}};
 await db.prepare('INSERT INTO verification_provider VALUES(?,?)').bind('cus_worker',JSON.stringify([subscription])).run();
 const event={id:'evt_worker',object:'event',livemode:false,api_version:'2026-10-28.endive',created:Math.floor(Date.now()/1000),type:'customer.subscription.updated',data:{object:subscription}};
 const send=async(value=event,tamper=false)=>{
  const payload=JSON.stringify(value),signature=Stripe.webhooks.generateTestHeaderString({payload,secret});
  return mf.dispatchFetch('https://fixture.invalid/webhook',{method:'POST',headers:{'stripe-signature':signature},body:payload+(tamper?' ':'')});
 };
 assert.equal((await send(event,true)).status,400);checks.push('Workerd rejects altered signed bytes');
 assert.equal((await send()).status,200);
 assert.equal((await db.prepare('SELECT status FROM billing_subscription_state').first()).status,'active');
 checks.push('WebCrypto SDK verification and transactional D1 snapshot succeed');
 assert.equal((await send()).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM billing_events').first()).n,1);checks.push('Repeated delivery is idempotent in D1');
 await db.prepare('UPDATE verification_provider SET data=?').bind(JSON.stringify([{...subscription,status:'canceled'}])).run();
 assert.equal((await send({...event,id:'evt_delayed',created:event.created-86400})).status,200);
 assert.equal((await db.prepare('SELECT status FROM billing_subscription_state').first()).status,'inactive');checks.push('Delayed active event reconciles current cancellation');
 console.log(JSON.stringify({passed:true,runtime:'local workerd with D1',provider:'fixture only',checks}));
} finally {await mf.dispose();}
