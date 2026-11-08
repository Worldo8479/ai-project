// Explicit network acceptance check. It is NOT part of npm test or CI.
// Pipe {"secretKey":"..."} as JSON on stdin; never put credentials in arguments.
// Creates only fictional test records, then closes sessions, deletes its test
// customers and archives its test catalog/configuration. No browser is used.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createStripeSandboxGateway,isStripeSandboxKey,subscriptionAccess} from '../lib/stripe-sandbox.js';
import {createSandboxBillingService} from '../lib/billing-service.js';

const runId=crypto.randomUUID(),apiVersion='2026-10-28.endive';
const report={runId,startedAt:new Date().toISOString(),apiVersion,checks:[],cleanupErrors:0,passed:false};
let stage='configuration',sqlite,secretKey,productId,priceId,portalConfigurationId,portalIsDefault=false;
const subscriptions=[],extraCustomers=[];
const check=(condition,label)=>{if(!condition)throw Error(label);report.checks.push(label);console.log(JSON.stringify({passed:label}));};
const safeCode=value=>typeof value==='string'&&/^[a-zA-Z0-9_[\].]+$/.test(value)?value:'unknown';
async function api(path,fields,method=fields?'POST':'GET'){
 const response=await fetch('https://api.stripe.com/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Authorization:'Bearer '+secretKey,'Stripe-Version':apiVersion,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':runId+'-'+crypto.randomUUID()}: {})},
  ...(fields?{body:new URLSearchParams(fields)}:{})});
 const value=await response.json();
 if(!response.ok)throw Error('Stripe HTTP '+response.status+' '+safeCode(value.error?.code)+' '+safeCode(value.error?.param));
 if(value.livemode===true)throw Error('Live-mode response refused');
 return value;
}
async function expectReject(task,label){let rejected=false;try{await task();}catch{rejected=true;}check(rejected,label);}
try{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error('Configuration too large');}
 secretKey=JSON.parse(input).secretKey;
 if(!isStripeSandboxKey(secretKey))throw Error('Only explicitly test-mode Stripe credentials are supported');
 sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare:sql=>({bind:(...args)=>({all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})})};
 stage='test catalog';
 const product=await api('products',{name:'RetainerLens verification '+runId,'metadata[verification_run]':runId});productId=product.id;
 check(product.livemode===false,'Product is explicitly test mode');
 const price=await api('prices',{product:productId,currency:'usd',unit_amount:'2900','recurring[interval]':'month'});priceId=price.id;
 const portal=await api('billing_portal/configurations',{'features[invoice_history][enabled]':'true','features[subscription_cancel][enabled]':'true','features[subscription_cancel][mode]':'at_period_end','metadata[verification_run]':runId});portalConfigurationId=portal.id;portalIsDefault=portal.is_default;
 const config={mode:'test',secretKey,priceId,portalConfigurationId,siteOrigin:'https://retainerlens-studio.marco-anderson2011.chatgpt.site'};
 const gateway=createStripeSandboxGateway(config),service=createSandboxBillingService({db,gateway,scope:'verify-'+runId});
 await gateway.validatePrice();check(true,'Stripe validates the exact USD 29 monthly plan');
 const account=user=>sqlite.prepare('SELECT * FROM billing_accounts WHERE user_id=?').get(user);
 const attempt=user=>sqlite.prepare("SELECT c.* FROM billing_checkouts c JOIN billing_accounts a ON a.reference=c.account_reference WHERE a.user_id=? AND c.state NOT IN ('expired','retired')").get(user);
 stage='checkout isolation';
 const concurrent=await Promise.allSettled([service.checkout('fictional-alice'),service.checkout('fictional-alice')]);
 check(concurrent.filter(r=>r.status==='fulfilled').length===1&&concurrent.some(r=>r.status==='rejected'&&r.reason.status===409),'Concurrent checkout clicks create one local attempt');
 const first=attempt('fictional-alice');await service.checkout('fictional-alice');
 check(attempt('fictional-alice').session_id===first.session_id,'Open Checkout session is reused');
 await service.checkout('fictional-bob');
 check(account('fictional-alice').customer_id!==account('fictional-bob').customer_id,'Two app accounts have distinct Stripe customers');
 await expectReject(()=>gateway.retrieveCheckout(account('fictional-bob').customer_id,first.session_id),'A different customer cannot retrieve the app checkout');
 await service.portal('fictional-alice');check(true,'Configured Stripe billing portal session is created');
 stage='checkout expiration';
 await api('checkout/sessions/'+first.session_id+'/expire',{});
 await service.checkout('fictional-alice');
 check(attempt('fictional-alice').session_id!==first.session_id,'Provider-confirmed expiry permits a fresh checkout');
 stage='lost response';
 let lost=false;const providerIds=[];
 const interrupted=createStripeSandboxGateway(config,async(url,options)=>{
  const response=await fetch(url,options);
  if(url.endsWith('/checkout/sessions')&&options.method==='POST'&&response.ok){providerIds.push((await response.clone().json()).id);if(!lost){lost=true;throw Error('Simulated response loss');}}
  return response;
 });
 await expectReject(()=>createSandboxBillingService({db,gateway:interrupted,scope:'verify-'+runId}).checkout('fictional-recovery'),'Lost provider response is reported without claiming success');
 await createSandboxBillingService({db,gateway:interrupted,scope:'verify-'+runId}).checkout('fictional-recovery');
 check(providerIds.length===2&&providerIds[0]===providerIds[1],'Restart resumes the same Stripe Checkout session with its persisted key');
 stage='subscription states';
 const customer=await api('customers',{'metadata[verification_run]':runId});extraCustomers.push(customer.id);
 const subscription=await api('subscriptions',{customer:customer.id,'items[0][price]':priceId,trial_period_days:'3'});subscriptions.push(subscription.id);
 let records=await gateway.listSubscriptions(customer.id);
 check(subscriptionAccess(records,customer.id,priceId).status==='trialing','Provider trial state produces bounded sandbox access');
 await expectReject(()=>gateway.prepareCheckout(customer.id),'An existing provider subscription prevents another checkout');
 await api('subscriptions/'+subscription.id,{cancel_at_period_end:'true'});
 records=await gateway.listSubscriptions(customer.id);
 check(subscriptionAccess(records,customer.id,priceId).cancelsAtPeriodEnd===true,'Scheduled cancellation retains access only to the current period');
 await api('subscriptions/'+subscription.id,undefined,'DELETE');subscriptions.splice(subscriptions.indexOf(subscription.id),1);
 check(subscriptionAccess(await gateway.listSubscriptions(customer.id),customer.id,priceId).status==='inactive','Canceled provider subscription has no sandbox access');
 report.passed=true;
}catch(error){report.failedStage=stage;report.error=stage==='configuration'?'Invalid test configuration':error instanceof Error?error.message:'Verification failed';report.passed=false;
 // Assertions and gateway messages are controlled here; no provider messages,
 // raw response bodies, secrets or hosted session URLs are emitted.
 console.log(JSON.stringify({failedStage:stage,error:report.error}));
}finally{
 if(secretKey&&isStripeSandboxKey(secretKey)){
  const cleanup=async task=>{try{await task();}catch{report.cleanupErrors++;}};
  for(const id of subscriptions)await cleanup(()=>api('subscriptions/'+id,undefined,'DELETE'));
  if(sqlite){
   for(const row of sqlite.prepare('SELECT session_id FROM billing_checkouts WHERE session_id IS NOT NULL').all())await cleanup(async()=>{const session=await api('checkout/sessions/'+row.session_id);if(session.status==='open')await api('checkout/sessions/'+row.session_id+'/expire',{});});
   for(const row of sqlite.prepare('SELECT customer_id FROM billing_accounts WHERE customer_id IS NOT NULL').all())await cleanup(()=>api('customers/'+row.customer_id,undefined,'DELETE'));
  }
  for(const id of extraCustomers)await cleanup(()=>api('customers/'+id,undefined,'DELETE'));
  if(portalConfigurationId&&!portalIsDefault)await cleanup(()=>api('billing_portal/configurations/'+portalConfigurationId,{active:'false'}));
  if(portalIsDefault)report.retainedDefaultPortalConfiguration=true;
  if(priceId)await cleanup(()=>api('prices/'+priceId,{active:'false'}));
  if(productId)await cleanup(()=>api('products/'+productId,{active:'false'}));
 }
 sqlite?.close();report.finishedAt=new Date().toISOString();if(report.cleanupErrors)report.passed=false;
 console.log(JSON.stringify({report}));process.exitCode=report.passed?0:1;
}
