// Explicit Stripe test-clock acceptance. No live keys, browser or real card data.
// Pipe {"secretKey":"..."} as JSON on stdin. This is not run by npm test/CI.
import {isStripeSandboxKey,createStripeSandboxGateway,subscriptionAccess} from '../lib/stripe-sandbox.js';
const runId=crypto.randomUUID(),version='2026-10-28.endive';
const report={runId,startedAt:new Date().toISOString(),apiVersion:version,testMoneyOnly:true,checks:[],cleanupErrors:0,passed:false};
let secretKey,stage='configuration',clockId,productId,priceId,simulatedTime=Math.floor(Date.now()/1000);
const check=(condition,label)=>{if(!condition)throw Error(label);report.checks.push(label);console.log(JSON.stringify({passed:label}));};
const safeCode=value=>typeof value==='string'&&/^[a-zA-Z0-9_[\].]+$/.test(value)?value:'unknown';
async function api(path,fields,method=fields?'POST':'GET'){
 const response=await fetch('https://api.stripe.com/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+secretKey,'Stripe-Version':version,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':runId+'-'+crypto.randomUUID()}: {})},...(fields?{body:new URLSearchParams(fields)}:{})});
 const value=await response.json();
 if(!response.ok)throw Error('Stripe HTTP '+response.status+' '+safeCode(value.error?.code)+' '+safeCode(value.error?.param)+(response.status===403?' — this operation requires permission from the claimed sandbox.':''));
 if(value.livemode===true)throw Error('Live-mode response refused');
 return value;
}
async function advance(time){
 await api('test_helpers/test_clocks/'+clockId+'/advance',{frozen_time:String(time)});
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  const clock=await api('test_helpers/test_clocks/'+clockId);
  if(clock.status==='ready'){if(clock.frozen_time!==time)throw Error('Unexpected simulated time');simulatedTime=time;return;}
  if(clock.status!=='advancing')throw Error('Test clock failed');
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw Error('Test clock did not become ready; inspect this clock before resuming');
}
try{
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error('Invalid configuration');}
 secretKey=JSON.parse(input).secretKey;if(!isStripeSandboxKey(secretKey))throw Error('Only test credentials are supported');
 stage='test fixtures';
 const product=await api('products',{name:'RetainerLens lifecycle '+runId,'metadata[verification_run]':runId});productId=product.id;
 check(product.livemode===false,'All lifecycle fixtures use test mode');
 const price=await api('prices',{product:productId,currency:'usd',unit_amount:'2900','recurring[interval]':'month'});priceId=price.id;
 stage='create test clock';
 const clock=await api('test_helpers/test_clocks',{frozen_time:String(simulatedTime),name:'RetainerLens lifecycle '+runId});clockId=clock.id;
 stage='clock customer and payment method';
 const customer=await api('customers',{test_clock:clockId,payment_method:'pm_card_visa','invoice_settings[default_payment_method]':'pm_card_visa','metadata[verification_run]':runId});
 const gateway=createStripeSandboxGateway({mode:'test',secretKey,priceId,siteOrigin:'https://retainerlens-studio.marco-anderson2011.chatgpt.site'});
 const access=async()=>subscriptionAccess(await gateway.listSubscriptions(customer.id),customer.id,priceId,simulatedTime*1000);
 let subscription=await api('subscriptions',{customer:customer.id,'items[0][price]':priceId,payment_behavior:'error_if_incomplete'});
 const subId=subscription.id;
 stage='initial test payment';
 let invoice=await api('invoices/'+subscription.latest_invoice);
 check(subscription.status==='active'&&invoice.status==='paid'&&invoice.currency==='usd'&&invoice.amount_paid===2900,'A successful test card pays the initial USD 29 invoice');
 check((await access()).status==='active','Successful test payment has bounded active access');
 stage='collection pause';
 await api('subscriptions/'+subId,{'pause_collection[behavior]':'void'});
 check((await access()).status==='inactive','Paused collection does not grant sandbox access');
 await api('subscriptions/'+subId,{pause_collection:''});
 check((await access()).status==='active','Resuming collection restores current-period access');
 stage='successful renewal';
 const firstPeriodEnd=subscription.items.data[0].current_period_end;
 await advance(firstPeriodEnd);await advance(firstPeriodEnd+3601);
 subscription=await api('subscriptions/'+subId);invoice=await api('invoices/'+subscription.latest_invoice);
 check(subscription.status==='active'&&invoice.status==='paid'&&invoice.amount_paid===2900&&invoice.billing_reason==='subscription_cycle','A scheduled renewal collects a second USD 29 test payment');
 check((await access()).until>firstPeriodEnd,'Renewal advances the access expiry');
 stage='failed renewal';
 const failingMethod=await api('payment_methods/pm_card_chargeCustomerFail/attach',{customer:customer.id});
 await api('subscriptions/'+subId,{default_payment_method:failingMethod.id});
 const secondPeriodEnd=subscription.items.data[0].current_period_end;
 await advance(secondPeriodEnd);await advance(secondPeriodEnd+3601);
 subscription=await api('subscriptions/'+subId);invoice=await api('invoices/'+subscription.latest_invoice);
 check(subscription.status==='past_due'&&invoice.status==='open'&&invoice.amount_remaining===2900,'A declined renewal leaves an unpaid invoice and past-due subscription');
 check((await access()).status==='inactive','Failed renewal does not grant sandbox access');
 stage='payment recovery';
 const replacement=await api('payment_methods/pm_card_visa/attach',{customer:customer.id});
 await api('subscriptions/'+subId,{default_payment_method:replacement.id});
 const recovered=await api('invoices/'+invoice.id+'/pay',{payment_method:replacement.id});
 check(recovered.status==='paid'&&recovered.amount_paid===2900,'A replacement test payment method pays the outstanding invoice');
 check((await access()).status==='active','Successful recovery restores active access');
 stage='cancellation and restore';
 subscription=await api('subscriptions/'+subId,{cancel_at_period_end:'true'});
 const finalPeriodEnd=subscription.items.data[0].current_period_end;
 let entitlement=await access();check(entitlement.status==='active'&&entitlement.cancelsAtPeriodEnd&&entitlement.until===finalPeriodEnd,'Scheduled cancellation keeps access to the paid period end');
 await api('subscriptions/'+subId,{cancel_at_period_end:'false'});
 check(!(await access()).cancelsAtPeriodEnd,'Cancellation can be withdrawn before the period ends');
 await api('subscriptions/'+subId,{cancel_at_period_end:'true'});await advance(finalPeriodEnd+1);
 check((await access()).status==='inactive','Scheduled cancellation removes access after the period ends');
 const invoices=await api('invoices?customer='+customer.id+'&limit=100');
 check(invoices.has_more===false&&invoices.data.filter(i=>i.status==='paid').length===3&&invoices.data.reduce((sum,i)=>sum+i.amount_paid,0)===8700,'Cancellation creates no fourth payment: total test receipts remain USD 87');
 stage='test refund';
 const payments=await api('invoice_payments?invoice='+recovered.id+'&limit=100');
 const payment=payments.data.find(p=>p.status==='paid'&&p.payment?.type==='payment_intent');
 if(!payment)throw Error('No successful invoice payment available for refund verification');
 const refund=await api('refunds',{payment_intent:payment.payment.payment_intent,amount:'2900','metadata[verification_run]':runId});
 check(refund.status==='succeeded'&&refund.amount===2900&&refund.currency==='usd','A test refund returns the recovered USD 29 payment');
 const charge=await api('charges/'+refund.charge);
 check(charge.livemode===false&&charge.refunded===true&&charge.amount_refunded===2900,'Provider charge records the full test refund');
 stage='initial payment failure';
 const declining=await api('customers',{test_clock:clockId,payment_method:'pm_card_chargeCustomerFail','invoice_settings[default_payment_method]':'pm_card_chargeCustomerFail','metadata[verification_run]':runId});
 const incomplete=await api('subscriptions',{customer:declining.id,'items[0][price]':priceId,payment_behavior:'default_incomplete'});
 check(incomplete.status==='incomplete'&&subscriptionAccess(await gateway.listSubscriptions(declining.id),declining.id,priceId,simulatedTime*1000).status==='inactive','A failed initial payment never grants sandbox access');
 await advance(simulatedTime+23*3600+1);
 const expired=await api('subscriptions/'+incomplete.id);
 check(expired.status==='incomplete_expired','An unpaid initial subscription expires without becoming active');
 report.passed=true;
}catch(error){report.failedStage=stage;report.error=stage==='configuration'?'Invalid test configuration':error instanceof Error?error.message:'Lifecycle verification failed';console.log(JSON.stringify({failedStage:stage,error:report.error}));}
finally{
 // Deleting this run's clock removes its fictional customers and subscriptions.
 // No existing user customers or clocks are selected for cleanup.
 const cleanup=async task=>{try{await task();}catch{report.cleanupErrors++;}};
 if(secretKey&&isStripeSandboxKey(secretKey)){
  if(clockId)await cleanup(()=>api('test_helpers/test_clocks/'+clockId,undefined,'DELETE'));
  if(priceId)await cleanup(()=>api('prices/'+priceId,{active:'false'}));
  if(productId)await cleanup(()=>api('products/'+productId,{active:'false'}));
 }
 report.finishedAt=new Date().toISOString();if(report.cleanupErrors)report.passed=false;
 console.log(JSON.stringify({report}));process.exitCode=report.passed?0:1;
}
