// Server-only, unmounted sandbox notification processing. Never accepts live events.
import Stripe from 'stripe';
import {subscriptionAccess} from './stripe-sandbox.js';
const VERSION = '2026-10-28.endive';
const MAX_BYTES = 256 * 1024;
const LEASE_MS = 90000;
const FRESH_MS = 5 * 60 * 1000;
const types = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed','customer.subscription.created','customer.subscription.updated',
  'customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed',
  'invoice.paid','invoice.payment_failed','invoice.payment_action_required']);
const id = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
class NotificationError extends Error { constructor(status) { super('Notification could not be processed.'); this.status=status; } }
const unavailable = () => new NotificationError(503);
const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function rawBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new NotificationError(413);
  const reader=request.body?.getReader();
  if (!reader) throw new NotificationError(400);
  const chunks=[];let size=0;
  try {
    for (;;) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES){await reader.cancel();throw new NotificationError(413);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}

export function createSandboxWebhookHandler({db,gateway,scope,priceId,signingSecret,mode,now=Date.now}) {
  if(mode!=='test' || !/^[a-zA-Z0-9_-]{16,200}$/.test(scope ?? '') || !id(priceId,'price') ||
    typeof signingSecret!=='string' || !/^whsec_[A-Za-z0-9]{16,}$/.test(signingSecret)) throw Error('Sandbox webhook configuration is required.');
  const subtle=Stripe.createSubtleCryptoProvider();
  const query=(sql,...values)=>db.prepare(sql).bind(...values);
  const first=async(sql,...values)=>(await query(sql,...values).all()).results[0] ?? null;
  async function process(event,hash) {
    if(event?.object!=='event' || !id(event.id,'evt') || event.livemode!==false || event.account || event.context ||
      event.api_version!==VERSION || !Number.isSafeInteger(event.created)) throw new NotificationError(400);
    if(!types.has(event.type))return {received:true,ignored:true};
    const customerId=event.data?.object?.customer;
    if(!id(customerId,'cus'))throw new NotificationError(400);
    await query(`INSERT INTO billing_events(scope,event_id,customer_id,payload_hash,event_type,received_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(scope,event_id) DO NOTHING`,scope,event.id,customerId,hash,event.type,now()).run();
    const receipt=await first('SELECT * FROM billing_events WHERE scope=? AND event_id=?',scope,event.id);
    if(receipt.payload_hash!==hash)throw new NotificationError(400);
    if(receipt.processed_at!==null)return {received:true};
    // A webhook can arrive before customer creation finishes persisting its ID.
    // Return retryable failure, never silently drop the account's first event.
    const account=await first('SELECT * FROM billing_accounts WHERE scope=? AND customer_id=?',scope,customerId);
    if(!account)throw unavailable();
    const token=crypto.randomUUID();
    const locked=await query(`UPDATE billing_accounts SET lock_token=?,lock_until=?
      WHERE reference=? AND lock_until<=?`,token,now()+LEASE_MS,account.reference,now()).run();
    if(locked.meta.changes!==1)throw unavailable();
    try {
      // Another delivery may have completed while this request was waiting.
      const current=await first('SELECT processed_at FROM billing_events WHERE scope=? AND event_id=?',scope,event.id);
      if(current.processed_at!==null)return {received:true};
      // Event snapshots and browser redirects never grant access. Re-fetch under
      // the same account lease used by checkout to handle out-of-order events.
      const subscriptions=await gateway.listSubscriptions(customerId);
      if(!Array.isArray(subscriptions) || subscriptions.some(s=>s.customer!==customerId || s.livemode!==false))throw unavailable();
      const access=subscriptionAccess(subscriptions,customerId,priceId,now());
      const verified=now();
      const fence='EXISTS(SELECT 1 FROM billing_accounts WHERE reference=? AND lock_token=? AND lock_until>?)';
      // D1 batches are transactions: a failed receipt write rolls back the
      // snapshot too. Both writes reject an expired/superseded lease holder.
      const results=await db.batch([
        query(`INSERT INTO billing_subscription_state(account_reference,status,subscription_id,valid_until,cancels_at_period_end,verified_at)
          SELECT ?,?,?,?,?,? WHERE ${fence}
          ON CONFLICT(account_reference) DO UPDATE SET status=excluded.status,subscription_id=excluded.subscription_id,
          valid_until=excluded.valid_until,cancels_at_period_end=excluded.cancels_at_period_end,verified_at=excluded.verified_at`,
          account.reference,access.status,access.subscriptionId,access.until,Number(access.cancelsAtPeriodEnd),verified,account.reference,token,verified),
        query(`UPDATE billing_events SET processed_at=? WHERE scope=? AND event_id=? AND ${fence}`,
          verified,scope,event.id,account.reference,token,verified)
      ]);
      if(results.some(r=>r.meta.changes!==1))throw unavailable();
      return {received:true};
    } finally {
      await query('UPDATE billing_accounts SET lock_token=NULL,lock_until=0 WHERE reference=? AND lock_token=?',account.reference,token).run();
    }
  }
  return async request => {
    if(request.method!=='POST')return json({error:'Method not supported.'},405);
    let event,bytes;
    try {
      bytes=await rawBody(request);
      // Verify original bytes with the official SDK before parsing or writing.
      event=await Stripe.webhooks.constructEventAsync(bytes,request.headers.get('stripe-signature') ?? '',signingSecret,300,subtle,now());
    } catch(e) {return json({error:'Invalid notification.'},e instanceof NotificationError?e.status:400);}
    try {
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      return json(await process(event,hash));
    } catch(e) {return json({error:'Notification could not be processed.'},e instanceof NotificationError?e.status:503);}
  };
}

// Server-side reader for future enforcement. Requires a platform-authenticated
// user ID. It is not wired into app access until sandbox acceptance is complete.
export async function readSandboxSubscriptionState({db,scope,userId,now=Date.now}) {
  if(typeof userId!=='string' || !userId.trim() || userId.length>500)throw Error('Sign in is required.');
  const {results}=await db.prepare(`SELECT s.*,EXISTS(SELECT 1 FROM billing_events e
    WHERE e.scope=a.scope AND e.customer_id=a.customer_id AND e.processed_at IS NULL) AS pending
    FROM billing_accounts a LEFT JOIN billing_subscription_state s ON s.account_reference=a.reference
    WHERE a.scope=? AND a.user_id=?`).bind(scope,userId).all();
  const state=results[0],time=now();
  const fresh=state && !state.pending && Number.isSafeInteger(state.verified_at) &&
    state.verified_at<=time && time-state.verified_at<FRESH_MS;
  const active=!!(fresh && ['active','trialing'].includes(state.status) && state.valid_until*1000>time);
  const expired=state && ['active','trialing'].includes(state.status) && state.valid_until*1000<=time;
  return {status:active?state.status:'inactive',needsRefresh:!fresh || !!expired,
    until:active?state.valid_until:null,cancelsAtPeriodEnd:active && !!state.cancels_at_period_end};
}
