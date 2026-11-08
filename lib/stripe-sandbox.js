// Server-only groundwork. No application route enables purchases yet.
const API_VERSION = '2026-10-28.endive';
export const isStripeSandboxKey = key => typeof key === 'string' && /^(sk|rkcs)_test_[A-Za-z0-9]+$/.test(key);
const id = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
const requireId = (value, prefix) => { if (!id(value, prefix)) throw Error('Invalid billing reference.'); return value; };
const requireKey = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,200}$/.test(value)) throw Error('A stable billing request key is required.'); return value; };

export function subscriptionAccess(subscriptions, customerId, priceId, now = Date.now()) {
  // This describes sandbox state only; it never grants production access.
  const eligible = subscriptions.filter(s => s.customer === customerId && s.livemode === false &&
    ['active', 'trialing'].includes(s.status) && !s.pause_collection).flatMap(s =>
      (s.items?.data ?? []).filter(item => item.price?.id === priceId && item.quantity === 1 &&
        Number.isFinite(item.current_period_end) && item.current_period_end * 1000 > now)
        .map(item => ({status: s.status, subscriptionId: s.id, until: item.current_period_end,
          cancelsAtPeriodEnd: !!s.cancel_at_period_end})));
  eligible.sort((a, b) => b.until - a.until);
  return eligible[0] ?? {status: 'inactive', subscriptionId: null, until: null, cancelsAtPeriodEnd: false};
}

export function createStripeSandboxGateway(config, fetcher = fetch) {
  if (config?.mode !== 'test' || !isStripeSandboxKey(config.secretKey)) {
    throw Error('Billing is disabled. Sandbox configuration is required.');
  }
  const priceId = requireId(config.priceId, 'price');
  const portalConfigurationId = config.portalConfigurationId ? requireId(config.portalConfigurationId, 'bpc') : null;
  const site = new URL(config.siteOrigin);
  if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
    throw Error('A fixed HTTPS site origin is required.');
  }
  const returnUrl = `${site.origin}/app#account`;
  async function call(path, fields, requestKey) {
    const headers = {'Authorization': `Bearer ${config.secretKey}`, 'Stripe-Version': API_VERSION};
    if (fields) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers['Idempotency-Key'] = requireKey(requestKey); }
    let response, data;
    try {
      response = await fetcher(`https://api.stripe.com/v1/${path}`, {
        method: fields ? 'POST' : 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000),
        ...(fields ? {body: new URLSearchParams(fields)} : {})
      });
      data = await response.json();
    } catch { throw Error('Billing is temporarily unavailable. Retry the same request.'); }
    // Do not propagate provider messages: they can contain submitted personal data.
    if (!response.ok || data?.livemode === true) throw Error('Billing request could not be completed.');
    return data;
  }
  async function validatePrice() {
    const price = await call(`prices/${priceId}`);
    if (price.id !== priceId || price.livemode !== false || price.active !== true ||
        price.currency !== 'usd' || price.unit_amount !== 2900 || price.type !== 'recurring' ||
        price.billing_scheme !== 'per_unit' || price.recurring?.interval !== 'month' ||
        price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed' ||
        price.transform_quantity || price.custom_unit_amount) throw Error('The sandbox monthly plan is not configured correctly.');
    return price;
  }
  async function listSubscriptions(customerId) {
    requireId(customerId, 'cus');
    const subscriptions = [];
    let cursor;
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({customer: customerId, status: 'all', limit: '100'});
      if (cursor) params.set('starting_after', cursor);
      const result = await call(`subscriptions?${params}`);
      if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean' ||
          result.data.some(s => s.customer !== customerId || s.livemode !== false)) throw Error('Unable to verify subscriptions.');
      subscriptions.push(...result.data);
      if (!result.has_more) return subscriptions;
      const next = result.data.at(-1)?.id;
      if (!id(next, 'sub') || next === cursor) throw Error('Unable to verify subscriptions.');
      cursor = next;
    }
    throw Error('Unable to verify subscriptions.');
  }
  function hostedUrl(result, host) {
    const url = new URL(result.url);
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password) throw Error('Invalid billing redirect.');
    return url.href;
  }
  function session(result, customerId) {
    if (result.livemode !== false || result.mode !== 'subscription' || result.customer !== customerId ||
        !['open', 'complete', 'expired'].includes(result.status) ||
        !Number.isSafeInteger(result.expires_at) || result.expires_at <= 0) throw Error('Invalid checkout session.');
    return {id: requireId(result.id, 'cs_test'), status: result.status, expiresAt: result.expires_at,
      url: result.status === 'open' ? hostedUrl(result, 'checkout.stripe.com') : null};
  }
  async function createCheckout(customerId, requestKey) {
    requireId(customerId, 'cus');
    const result = await call('checkout/sessions', {
      mode: 'subscription', customer: customerId, 'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1', success_url: returnUrl, cancel_url: returnUrl
    }, requestKey);
    return session(result, customerId);
  }
  return {
    validatePrice, listSubscriptions,
    async retrieveCheckout(customerId, sessionId) {
      requireId(customerId, 'cus'); requireId(sessionId, 'cs_test');
      const result = session(await call(`checkout/sessions/${sessionId}`), customerId);
      if (result.id !== sessionId) throw Error('Invalid checkout session.');
      return result;
    },
    // Only the durable coordinator may resume, with its original key and within
    // the provider's idempotency window. Never expose this as a browser choice.
    resumeCheckout: createCheckout,
    async createCustomer(accountReference, requestKey) {
      // Caller supplies an opaque database reference, never a browser-provided owner ID.
      requireKey(accountReference);
      const result = await call('customers', {'metadata[retainerlens_account]': accountReference}, requestKey);
      if (result.livemode !== false) throw Error('Invalid sandbox customer.');
      return requireId(result.id, 'cus');
    },
    async prepareCheckout(customerId) {
      await validatePrice();
      const subscriptions = await listSubscriptions(customerId);
      if (subscriptions.some(s => !['canceled', 'incomplete_expired'].includes(s.status))) {
        throw Error('An existing subscription needs to be managed in billing settings.');
      }
    },
    async checkout(customerId, requestKey) {
      requireKey(requestKey);
      await this.prepareCheckout(customerId);
      return createCheckout(customerId, requestKey);
    },
    async portal(customerId, requestKey) {
      requireId(customerId, 'cus');
      const result = await call('billing_portal/sessions', {customer: customerId, return_url: returnUrl, ...(portalConfigurationId ? {configuration:portalConfigurationId} : {})}, requestKey);
      if (result.livemode !== false || result.customer !== customerId || (portalConfigurationId && result.configuration !== portalConfigurationId)) throw Error('Invalid billing session.');
      return {url: hostedUrl(result, 'billing.stripe.com')};
    }
  };
}
