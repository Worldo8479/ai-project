import test from 'node:test';
import assert from 'node:assert/strict';
import {billingDatabase} from './helpers/billing-database.js';
import {handleReviewRequest} from '../lib/review-service.js';
import {reviewWriteAccess} from '../lib/review-access.js';
import {createSandboxSubscriptionService} from '../lib/billing-reconciliation.js';
const input={month:'2026-11',currency:'USD',target:50,expectedRevision:null,rows:[{client:'Fictional',fee:2000,hours:20,rate:45,other:0}]};
const request=(method='POST',body=input,suffix='',origin='https://test.example')=>new Request('https://test.example/api/reviews'+suffix,{method,headers:{origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
test('private preview remains writable; unknown modes and live billing credentials are refused',async()=>{
 for(const mode of [undefined,null,'','private-preview'])assert.deepEqual(await reviewWriteAccess({BILLING_ACCESS_MODE:mode},null,'alice'),{allowed:true});
 for(const mode of ['live','typo'])await assert.rejects(reviewWriteAccess({BILLING_ACCESS_MODE:mode},null,'alice'));
 await assert.rejects(reviewWriteAccess({BILLING_ACCESS_MODE:'sandbox',STRIPE_SANDBOX_SECRET_KEY:'sk_live_fixture'},null,'alice'));
});
test('inactive accounts cannot create or overwrite saved reviews, including with forged subscription fields',async t=>{
 const {db,sqlite}=billingDatabase(t);let owners=[];
 const options={authorizeSave:async user=>{owners.push(user);return {allowed:false};}};
 assert.equal((await handleReviewRequest(request('POST',{...input,subscription:'active',userId:'bob'}),'alice',db,options)).status,402);
 assert.deepEqual(owners,['alice']);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM reviews').get().n,0);
 const saved=await(await handleReviewRequest(request(),'alice',db)).json();
 assert.equal((await handleReviewRequest(request('POST',{...input,expectedRevision:saved.revision,target:60}),'alice',db,options)).status,402);
 assert.equal(sqlite.prepare('SELECT target FROM reviews').get().target,50);
});
test('read, export, trash and restore remain available during a billing outage or lapse',async t=>{
 const {db}=billingDatabase(t);const saved=await(await handleReviewRequest(request(),'alice',db)).json();let consulted=0;
 const options={authorizeSave:async()=>{consulted++;throw Error('billing outage');}};
 assert.equal((await handleReviewRequest(request('GET'),'alice',db,options)).status,200);
 const exported=await handleReviewRequest(request('GET',null,'?format=export'),'alice',db,options);assert.equal(exported.status,200);assert.equal((await exported.json()).reviews.length,1);
 const trashed=await handleReviewRequest(request('DELETE',{...input,expectedRevision:saved.revision}),'alice',db,options);assert.equal(trashed.status,200);
 const version=(await trashed.json()).revision;
 assert.equal((await handleReviewRequest(request('PUT',{...input,expectedRevision:version}),'alice',db,options)).status,200);assert.equal(consulted,0);
});
test('subscription refresh drives save decisions while outages and invalid requests make no writes',async t=>{
 const {db,sqlite}=billingDatabase(t),scope='sandbox-review-fixture',priceId='price_monthly';
 sqlite.prepare('INSERT INTO billing_accounts(scope,user_id,reference,customer_key,customer_id) VALUES(?,?,?,?,?)').run(scope,'alice','ref_alice','key_alice','cus_alice');
 let fail=false,called=0;
 const gateway={listSubscriptions:async()=>{called++;if(fail)throw Error('provider private detail');return [{id:'sub_alice',customer:'cus_alice',livemode:false,status:'active',items:{data:[{price:{id:priceId},quantity:1,current_period_end:Math.floor(Date.now()/1000)+3600}]}}];}};
 const service=createSandboxSubscriptionService({db,gateway,scope,priceId,mode:'test'}),options={authorizeSave:async user=>({allowed:(await service.status(user)).status==='active'})};
 assert.equal((await handleReviewRequest(request(),null,db,options)).status,401);
 assert.equal((await handleReviewRequest(request('POST',input,'','https://evil.example'),'alice',db,options)).status,403);assert.equal(called,0);
 assert.equal((await handleReviewRequest(request(),'alice',db,options)).status,200);
 fail=true;sqlite.exec('UPDATE billing_subscription_state SET verified_at=0');
 const result=await handleReviewRequest(request('POST',{...input,month:'2026-12'}),'alice',db,options);assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private detail/);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM reviews').get().n,1);
});


test('server sandbox configuration uses the mapped customer and configured price through the actual gateway',async t=>{
 const {db,sqlite}=billingDatabase(t),scope='sandbox-config-fixture',priceId='price_plan',now=()=>1900000000000;
 const environment={BILLING_ACCESS_MODE:'sandbox',STRIPE_SANDBOX_SCOPE:scope,STRIPE_SANDBOX_PRICE_ID:priceId,
  STRIPE_SANDBOX_SECRET_KEY:'sk_test_fixture',BILLING_SITE_ORIGIN:'https://test.example'};
 sqlite.prepare('INSERT INTO billing_accounts(scope,user_id,reference,customer_key,customer_id) VALUES(?,?,?,?,?)').run(scope,'alice','ref_alice','key_alice','cus_alice');
 let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(new URL(url).searchParams.get('customer'),'cus_alice');assert.equal(options.headers.Authorization,'Bearer sk_test_fixture');
  return Response.json({data:[{id:'sub_alice',customer:'cus_alice',status:'active',livemode:false,items:{data:[{price:{id:priceId},quantity:1,current_period_end:now()/1000+3600}]}}],has_more:false});};
 assert.deepEqual(await reviewWriteAccess(environment,db,'alice',{fetcher,now}),{allowed:true});
 assert.deepEqual(await reviewWriteAccess(environment,db,'bob',{fetcher,now}),{allowed:false});assert.equal(calls,1);
});
