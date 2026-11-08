// Server-only, unmounted sandbox notification processing. Never accepts live events.
import Stripe from 'stripe';
import {persistSandboxSubscriptionState} from './billing-reconciliation.js';
export {readSandboxSubscriptionState} from './billing-reconciliation.js';
const VERSION = '2026-10-28.endive';
const MAX_BYTES = 256 * 1024;
const LEASE_MS = 90000;
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
      await persistSandboxSubscriptionState({db,account,token,scope,priceId,subscriptions,eventIds:[event.id],now});
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
