// Server-only, sandbox-only state reconciliation. No checkout or charge occurs.
import {subscriptionAccess} from './stripe-sandbox.js';
import {BillingStateError} from './billing-service.js';
const LEASE_MS=90000,FRESH_MS=5*60*1000;
const unavailable=()=>new BillingStateError('Subscription status is temporarily unavailable. Your working review is unchanged.',503);
function validate({mode,scope,priceId}){
 if(mode!=='test'||typeof scope!=='string'||!/^[a-zA-Z0-9_-]{16,200}$/.test(scope)||typeof priceId!=='string'||!/^price_[A-Za-z0-9]+$/.test(priceId))throw Error('Sandbox reconciliation configuration is required.');
}
function requireUser(userId){if(typeof userId!=='string'||!userId.trim()||userId.length>500)throw new BillingStateError('Sign in is required.',401);}
export async function readSandboxSubscriptionState({db,scope,priceId,userId,now=Date.now}){
 requireUser(userId);
 const {results}=await db.prepare(`SELECT s.*,EXISTS(SELECT 1 FROM billing_events e
  WHERE e.scope=a.scope AND e.customer_id=a.customer_id AND e.processed_at IS NULL) AS pending
  FROM billing_accounts a LEFT JOIN billing_subscription_state s ON s.account_reference=a.reference
  WHERE a.scope=? AND a.user_id=?`).bind(scope,userId).all();
 const state=results[0],time=now();
 const fresh=!!(state && typeof priceId==='string' && state.price_id===priceId && !state.pending &&
  Number.isSafeInteger(state.verified_at) && state.verified_at<=time && time-state.verified_at<FRESH_MS);
 const active=!!(fresh && ['active','trialing'].includes(state.status) && state.valid_until*1000>time);
 const expired=state && ['active','trialing'].includes(state.status) && state.valid_until*1000<=time;
 return {status:active?state.status:'inactive',needsRefresh:!fresh||!!expired,until:active?state.valid_until:null,cancelsAtPeriodEnd:active&&!!state.cancels_at_period_end};
}

// Caller owns the account lease. The transaction rejects expired or superseded
// holders, and can acknowledge only receipts selected BEFORE the provider read.
export async function persistSandboxSubscriptionState({db,account,token,scope,priceId,subscriptions,eventIds=[],now=Date.now}){
 if(eventIds.length>50 || !Array.isArray(subscriptions) || subscriptions.some(s=>s.customer!==account.customer_id||s.livemode!==false))throw unavailable();
 const verified=now(),access=subscriptionAccess(subscriptions,account.customer_id,priceId,verified);
 const query=(sql,...values)=>db.prepare(sql).bind(...values);
 const fence='EXISTS(SELECT 1 FROM billing_accounts WHERE reference=? AND lock_token=? AND lock_until>?)';
 const statements=[query(`INSERT INTO billing_subscription_state(account_reference,status,subscription_id,valid_until,cancels_at_period_end,verified_at,price_id)
  SELECT ?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT(account_reference) DO UPDATE SET status=excluded.status,
  subscription_id=excluded.subscription_id,valid_until=excluded.valid_until,cancels_at_period_end=excluded.cancels_at_period_end,
  verified_at=excluded.verified_at,price_id=excluded.price_id`,account.reference,access.status,access.subscriptionId,access.until,
  Number(access.cancelsAtPeriodEnd),verified,priceId,account.reference,token,verified)];
 if(eventIds.length)statements.push(query(`UPDATE billing_events SET processed_at=? WHERE scope=? AND customer_id=?
  AND event_id IN (${eventIds.map(()=>'?').join(',')}) AND processed_at IS NULL AND ${fence}`,
  verified,scope,account.customer_id,...eventIds,account.reference,token,verified));
 const results=await db.batch(statements);
 if(results[0].meta.changes!==1 || (eventIds.length&&results[1].meta.changes!==eventIds.length))throw unavailable();
}

export function createSandboxSubscriptionService({db,gateway,scope,priceId,mode,now=Date.now}){
 validate({scope,priceId,mode});
 const query=(sql,...values)=>db.prepare(sql).bind(...values);
 const first=async(sql,...values)=>(await query(sql,...values).all()).results[0]??null;
 const read=userId=>readSandboxSubscriptionState({db,scope,priceId,userId,now});
 return {async status(userId){
  requireUser(userId);
  const cached=await read(userId);if(!cached.needsRefresh)return cached;
  const account=await first('SELECT * FROM billing_accounts WHERE scope=? AND user_id=?',scope,userId);
  // Status reads must not create customers or accounts, even for new users.
  if(!account?.customer_id)return {status:'inactive',needsRefresh:false,until:null,cancelsAtPeriodEnd:false};
  const token=crypto.randomUUID();
  const acquired=await query('UPDATE billing_accounts SET lock_token=?,lock_until=? WHERE reference=? AND lock_until<=?',token,now()+LEASE_MS,account.reference,now()).run();
  if(acquired.meta.changes!==1)throw unavailable();
  try{
   const current=await read(userId);if(!current.needsRefresh)return current;
   const {results:events}=await query('SELECT event_id FROM billing_events WHERE scope=? AND customer_id=? AND processed_at IS NULL LIMIT 51',scope,account.customer_id).all();
   if(events.length>50)throw unavailable();
   const subscriptions=await gateway.listSubscriptions(account.customer_id);
   await persistSandboxSubscriptionState({db,account,token,scope,priceId,subscriptions,eventIds:events.map(e=>e.event_id),now});
   const result=await read(userId);
   // A notification arriving DURING the provider read remains pending. It may
   // describe a newer change, so this request must not claim verified access.
   if(result.needsRefresh)throw unavailable();
   return result;
  }catch{throw unavailable();}finally{
   await query('UPDATE billing_accounts SET lock_token=NULL,lock_until=0 WHERE reference=? AND lock_token=?',account.reference,token).run();
  }
 }};
}
