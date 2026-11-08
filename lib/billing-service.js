// Server-only sandbox coordinator. No public route enables purchases yet.
// The caller must provide platform-authenticated identity and a stable scope
// for ONE Stripe sandbox. Never accept scope, customer IDs or retry keys from UI.
const LEASE_MS = 90000;
const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
export class BillingStateError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const busy = () => new BillingStateError('Billing is already being updated. Please try again shortly.');
const reconcile = () => new BillingStateError('An earlier billing request needs reconciliation before another checkout can start.');
const requireUser = user => {
  if (typeof user !== 'string' || !user.trim() || user.length > 500) {
    throw new BillingStateError('Sign in to manage your subscription.', 401);
  }
};

export function createSandboxBillingService({db, gateway, scope, now = Date.now}) {
  if (typeof scope !== 'string' || !/^[a-zA-Z0-9_-]{16,200}$/.test(scope)) throw Error('A stable sandbox scope is required.');
  const run = (sql, ...values) => db.prepare(sql).bind(...values).run();
  const first = async (sql, ...values) => (await db.prepare(sql).bind(...values).all()).results[0] ?? null;
  const held = `EXISTS (SELECT 1 FROM billing_accounts a WHERE a.reference=billing_checkouts.account_reference AND a.lock_token=? AND a.lock_until>?)`;
  async function lock(userId, action) {
    requireUser(userId);
    await run(`INSERT INTO billing_accounts(scope,user_id,reference,customer_key)
      VALUES (?,?,?,?) ON CONFLICT(scope,user_id) DO NOTHING`, scope, userId, crypto.randomUUID(), crypto.randomUUID());
    const token = crypto.randomUUID();
    const acquired = await run(`UPDATE billing_accounts SET lock_token=?,lock_until=?
      WHERE scope=? AND user_id=? AND lock_until<=?`, token, now()+LEASE_MS, scope, userId, now());
    if (acquired.meta.changes !== 1) throw busy();
    try {
      const account = await first('SELECT * FROM billing_accounts WHERE scope=? AND user_id=?', scope, userId);
      const update = async (sql, ...values) => {
        const result = await run(sql, ...values, token, now());
        if (result.meta.changes !== 1) throw busy();
      };
      return await action(account, token, update);
    } finally {
      // A late request cannot release the newer request's lease.
      await run('UPDATE billing_accounts SET lock_token=NULL,lock_until=0 WHERE scope=? AND user_id=? AND lock_token=?', scope, userId, token);
    }
  }
  async function customer(account, update) {
    if (account.customer_id) return account.customer_id;
    if (account.customer_requested_at !== null && now()-account.customer_requested_at >= SAFE_RETRY_MS) throw reconcile();
    if (account.customer_requested_at === null) {
      await update(`UPDATE billing_accounts SET customer_requested_at=? WHERE reference=? AND lock_token=? AND lock_until>?`, now(), account.reference);
    }
    const id = await gateway.createCustomer(account.reference, account.customer_key);
    await update(`UPDATE billing_accounts SET customer_id=? WHERE reference=? AND customer_id IS NULL AND lock_token=? AND lock_until>?`, id, account.reference);
    return id;
  }
  return {
    checkout(userId) {
      return lock(userId, async (account, token, update) => {
        const customerId = await customer(account, update);
        let attempt = await first("SELECT * FROM billing_checkouts WHERE account_reference=? AND state NOT IN ('expired','retired')", account.reference);
        let result;
        if (attempt?.session_id) {
          // Fetch current state; an old cached redirect must not reopen a paid or
          // expired session. Never infer payment from a browser success URL.
          result = await gateway.retrieveCheckout(customerId, attempt.session_id);
          await update(`UPDATE billing_checkouts SET state=?,expires_at=? WHERE request_key=? AND ${held}`,
            result.status, result.expiresAt, attempt.request_key);
          if (result.status === 'expired') { attempt = null; result = null; }
          else if (result.status === 'complete' && result.subscriptionId) {
            // A completed session alone is not permission to create another
            // subscription. Confirm its exact subscription belongs to this
            // customer and has permanently ended before retiring the attempt.
            const subscriptions = await gateway.listSubscriptions(customerId);
            const previous = subscriptions.find(s => s.id === result.subscriptionId &&
              s.customer === customerId && s.livemode === false);
            if (previous && ['canceled','incomplete_expired'].includes(previous.status)) {
              await update(`UPDATE billing_checkouts SET state='retired' WHERE request_key=? AND ${held}`, attempt.request_key);
              attempt = null; result = null;
            }
          }
        }
        if (!attempt) {
          await gateway.prepareCheckout(customerId);
          const key = crypto.randomUUID();
          await update(`INSERT INTO billing_checkouts(request_key,account_reference,created_at)
            SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM billing_accounts WHERE reference=? AND lock_token=? AND lock_until>?)`,
            key, account.reference, now(), account.reference);
          attempt = {request_key:key, created_at:now()};
          result = await gateway.resumeCheckout(customerId, key);
        } else if (!attempt.session_id) {
          // Stripe may prune idempotency keys after 24h. Uncertain old requests
          // stop here for provider reconciliation instead of risking a duplicate.
          if (now()-attempt.created_at >= SAFE_RETRY_MS) throw reconcile();
          result = await gateway.resumeCheckout(customerId, attempt.request_key);
        }
        await update(`UPDATE billing_checkouts SET session_id=?,state=?,expires_at=? WHERE request_key=? AND ${held}`,
          result.id, result.status, result.expiresAt, attempt.request_key);
        if (result.status !== 'open') throw new BillingStateError('This checkout is no longer open. Manage your subscription in billing settings.');
        if (result.expiresAt * 1000 <= now()) throw new BillingStateError('Checkout is expiring. Please try again shortly.');
        return {url:result.url};
      });
    },
    portal(userId) {
      return lock(userId, async account => {
        if (!account.customer_id) throw new BillingStateError('There is no billing account to manage yet.');
        return gateway.portal(account.customer_id, crypto.randomUUID());
      });
    }
  };
}

// Kept unmounted until genuine sandbox lifecycle verification and webhook
// delivery are configured. Tests exercise the same identity/origin boundary.
export async function handleSandboxBillingRequest(request, userId, service) {
  const json = (body, status) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
  try { requireUser(userId); } catch (e) { return json({error:e.message}, e.status); }
  if (request.method !== 'POST') return json({error:'Method not supported.'},405);
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'This request must come from this site.'},403);
  // No body fields are used: ownership and all billing configuration are server supplied.
  const action = new URL(request.url).pathname.split('/').at(-1);
  if (!['checkout','portal'].includes(action)) return json({error:'Unknown billing action.'},404);
  try { return json(await service[action](userId),200); }
  catch (e) { return json({error:e instanceof BillingStateError ? e.message : 'Billing is temporarily unavailable. Please retry.'}, e instanceof BillingStateError ? e.status : 503); }
}
