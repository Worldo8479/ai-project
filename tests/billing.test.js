import test from 'node:test';
import assert from 'node:assert/strict';
import {createStripeSandboxGateway, subscriptionAccess} from '../lib/stripe-sandbox.js';

const config = {mode:'test', secretKey:'sk_test_fixture', priceId:'price_monthly', siteOrigin:'https://retainerlens.example'};
const price = {id:'price_monthly', active:true, livemode:false, currency:'usd', unit_amount:2900,
  type:'recurring', billing_scheme:'per_unit', recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
const subscription = {id:'sub_one', customer:'cus_owner', livemode:false, status:'active',
  items:{data:[{price:{id:'price_monthly'},quantity:1,current_period_end:2000000000}]}};
const key = 'test-request-key-12345678';
function fixture(responses) {
  const calls=[];
  const gateway=createStripeSandboxGateway(config,async (url,options)=>{
    calls.push({url,options});
    assert.ok(responses.length, 'unexpected provider request');
    const next=responses.shift();
    if(next instanceof Error)throw next;
    return Response.json(next.body ?? next,{status:next.status ?? 200});
  });
  return {gateway,calls};
}

test('billing defaults off and refuses live keys and untrusted return origins',()=>{
  for(const change of [{mode:undefined},{mode:'live'},{secretKey:'sk_live_fake'},
    {siteOrigin:'http://evil.example'},{siteOrigin:'https://user:pass@evil.example'},
    {siteOrigin:'https://retainerlens.example/?next=evil'}]){
    assert.throws(()=>createStripeSandboxGateway({...config,...change}));
  }
});

test('checkout uses a fixed monthly price, server customer, fixed return URL and retry key',async()=>{
  const {gateway,calls}=fixture([price,{data:[],has_more:false},{id:'cs_test_abc123',mode:'subscription',
    customer:'cus_owner',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_abc123'}]);
  const result=await gateway.checkout('cus_owner',key);
  assert.equal(result.id,'cs_test_abc123');
  const {options}=calls[2];
  assert.equal(options.headers['Idempotency-Key'],key);
  assert.equal(options.headers['Stripe-Version'],'2026-10-28.endive');
  assert.equal(options.body.get('mode'),'subscription');
  assert.equal(options.body.get('customer'),'cus_owner');
  assert.equal(options.body.get('line_items[0][price]'),'price_monthly');
  assert.equal(options.body.get('success_url'),'https://retainerlens.example/#account');
  assert.equal(options.redirect,'error');
});

test('wrong price amount, recurrence or live price prevents checkout',async()=>{
  for(const change of [{unit_amount:29000},{currency:'gbp'},{livemode:true},{type:'one_time'},
    {recurring:{interval:'year',interval_count:1,usage_type:'licensed'}}, {active:false}]){
    const {gateway,calls}=fixture([{...price,...change}]);
    await assert.rejects(gateway.checkout('cus_owner',key));
    assert.equal(calls.length,1);
  }
});

test('existing subscriptions in every nonterminal state prevent a second checkout',async()=>{
  for(const status of ['active','trialing','past_due','unpaid','paused','incomplete']){
    const {gateway,calls}=fixture([price,{data:[{...subscription,status}],has_more:false}]);
    await assert.rejects(gateway.checkout('cus_owner',key),/existing subscription/);
    assert.equal(calls.length,2);
  }
});

test('subscription lookup checks all pages and rejects cross-customer records',async()=>{
  const {gateway,calls}=fixture([{data:[{...subscription,id:'sub_old',status:'canceled'}],has_more:true},
    {data:[subscription],has_more:false}]);
  assert.equal((await gateway.listSubscriptions('cus_owner')).length,2);
  assert.match(calls[1].url,/starting_after=sub_old/);
  const other=fixture([{data:[{...subscription,customer:'cus_other'}],has_more:false}]);
  await assert.rejects(other.gateway.listSubscriptions('cus_owner'),/verify subscriptions/);
});

test('portal cannot return a different customer or redirect off Stripe',async()=>{
  for(const change of [{customer:'cus_other'},{url:'https://billing.stripe.com.evil.example/session'},
    {url:'https://secret@billing.stripe.com/session'},{livemode:true}]){
    const {gateway}=fixture([{customer:'cus_owner',livemode:false,url:'https://billing.stripe.com/session',...change}]);
    await assert.rejects(gateway.portal('cus_owner',key));
  }
  const {gateway}=fixture([{customer:'cus_owner',livemode:false,url:'https://billing.stripe.com/session'}]);
  assert.equal((await gateway.portal('cus_owner',key)).url,'https://billing.stripe.com/session');
});

test('customer creation requires opaque references and does not send email',async()=>{
  const {gateway,calls}=fixture([{id:'cus_owner',livemode:false}]);
  await assert.rejects(gateway.createCustomer('person@example.com',key));
  assert.equal(calls.length,0);
  assert.equal(await gateway.createCustomer('opaque-account-123456',key),'cus_owner');
  assert.equal(calls[0].options.body.has('email'),false);
});

test('provider failures do not leak customer details or credentials',async()=>{
  for(const response of [{status:400,body:{error:{message:'person@example.com sk_test_fixture'}}},new Error('secret')]){
    const {gateway}=fixture([response]);
    await assert.rejects(gateway.portal('cus_owner',key),error=>!/(person|fixture|secret)/.test(error.message));
  }
});

test('access requires the right customer and plan, valid period and active status',()=>{
  const now=1900000000000;
  assert.equal(subscriptionAccess([subscription],'cus_owner','price_monthly',now).status,'active');
  const canceledAtEnd={...subscription,cancel_at_period_end:true};
  assert.equal(subscriptionAccess([canceledAtEnd],'cus_owner','price_monthly',now).cancelsAtPeriodEnd,true);
  for(const altered of [{...subscription,customer:'cus_other'},{...subscription,livemode:true},
    {...subscription,status:'past_due'},{...subscription,status:'canceled'},
    {...subscription,pause_collection:{behavior:'void'}},{...subscription,items:{data:[]}}]){
    assert.equal(subscriptionAccess([altered],'cus_owner','price_monthly',now).status,'inactive');
  }
  assert.equal(subscriptionAccess([subscription],'cus_owner','price_other',now).status,'inactive');
  assert.equal(subscriptionAccess([subscription],'cus_owner','price_monthly',2100000000000).status,'inactive');
});
