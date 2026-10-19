import { GRANT_ACCESS_SQL } from './crypto-settlement';

export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export function paymentMethod(value: unknown): 'card' | 'crypto' {
  if (value === undefined || value === 'card') return 'card';
  if (value === 'crypto' || value === 'usdc') return 'crypto';
  throw new PaymentError('Choose Card or USDC.', 400);
}
export async function stripeRequest(env: any, path: string, body?: Record<string, string>) {
  if (!env.STRIPE_SECRET_KEY) throw new PaymentError('Stripe payments are temporarily unavailable.', 503);
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      ...(body ? { method: 'POST', body: new URLSearchParams(body) } : {}),
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(12000),
    });
  } catch { throw new PaymentError('Stripe could not be reached. Please try again.', 503); }
  const result = await response.json<any>();
  if (!response.ok || result.error) {
    if (response.status === 404) {
      if (/^accounts\/[^/]+\/capabilities\/crypto_payments$/.test(path)) throw new PaymentError('USDC is not available on this connected Stripe account. Your existing Stripe connection and card payments remain active.');
      if (/^accounts\/[^/?]+$/.test(path)) throw new PaymentError('Stripe could not find this connected account under Jothable.');
      throw new PaymentError('Stripe could not find the requested payment resource.');
    }
    throw new PaymentError(result.error?.message || 'Stripe could not process this request.', response.status >= 500 ? 503 : 409);
  }
  return result;
}
export function usdcStatus(account: any): 'active' | 'pending' | 'not_enabled' | 'unavailable' {
  const status = account.capabilities?.crypto_payments;
  if (status === 'active') return 'active';
  if (status === 'pending') return 'pending';
  // Outside the US, Stripe currently requires private-preview approval.
  return account.country === 'US' ? 'not_enabled' : 'unavailable';
}
export async function connectedSeller(env: any, seller: any, method?: 'card' | 'crypto') {
  if (!seller?.stripe_account_id || seller.stripe_enabled === 0) throw new PaymentError('This seller needs an active Stripe account connected to Jothable.');
  // A successful lookup using the platform key verifies that this account belongs to this platform.
  const account = await stripeRequest(env, `accounts/${encodeURIComponent(seller.stripe_account_id)}`);
  const active = account.id === seller.stripe_account_id && !account.deleted && account.charges_enabled === true
    && account.payouts_enabled === true && account.capabilities?.transfers === 'active';
  await env.DB.prepare('UPDATE user SET stripe_onboarded = ?, stripe_country = ? WHERE stripe_account_id = ?')
    .bind(active ? 1 : 0, account.country || null, seller.stripe_account_id).run();
  if (!active) throw new PaymentError('This seller’s Stripe account is restricted or setup is incomplete.');
  if (method === 'card' && account.capabilities?.card_payments !== 'active') throw new PaymentError('This seller cannot accept card payments yet.');
  if (method === 'crypto' && account.capabilities?.crypto_payments !== 'active') {
    throw new PaymentError('This seller has not enabled USDC in Stripe yet. Ask the seller to complete USDC setup, or pay by card.');
  }
  return account;
}
export async function verifyPaymentEvent(body: string, signature: string | undefined, secret: string | undefined) {
  if (!secret) throw new PaymentError('Payment webhook is not configured.', 503);
  if (!signature) throw new PaymentError('Missing Stripe signature.', 401);
  const parts = signature.split(',').map(value => value.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now()/1000 - Number(timestamp)) > 300) throw new PaymentError('Expired or invalid Stripe signature.', 401);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  let valid = false;
  for (const [name,value] of parts) {
    if (name !== 'v1' || !/^[a-f\d]{64}$/i.test(value || '')) continue;
    const bytes = Uint8Array.from(value.match(/../g)!, hex => parseInt(hex,16));
    if (await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${timestamp}.${body}`))) valid = true;
  }
  if (!valid) throw new PaymentError('Invalid Stripe signature.', 401);
  try { return JSON.parse(body); } catch { throw new PaymentError('Invalid payment payload.', 400); }
}
const guardedGrant = GRANT_ACCESS_SQL.replace('VALUES (?, ?, 1, ?, ?)', `SELECT ?, ?, 1, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM stripe_checkout_fulfillment WHERE session_id = ?)
    AND NOT EXISTS (SELECT 1 FROM purchase WHERE stripe_id = ?)`);
function positiveId(value: unknown) { const id=Number(value); if(!Number.isSafeInteger(id)||id<1) throw new PaymentError('Invalid payment identity.',400);return id; }
function nonnegativeCents(value: unknown) { const amount=Number(value);if(!Number.isSafeInteger(amount)||amount<0) throw new PaymentError('Invalid payment amount.',400);return amount; }
export async function fulfillCheckout(env: any, sessionId: string, flow: 'unlock' | 'gift', expectedUser?: number, expectedStory?: number) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) throw new PaymentError('Invalid checkout session.',400);
  const session = await stripeRequest(env, `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`);
  const metadata = session.metadata || {};
  const userId = positiveId(flow === 'unlock' ? metadata.user_id : metadata.from_user_id);
  const storyId = flow === 'unlock' ? positiveId(metadata.story_id) : null;
  if (expectedUser !== undefined && userId !== Number(expectedUser)) throw new PaymentError('This checkout belongs to another reader.',403);
  if (expectedStory !== undefined && storyId !== Number(expectedStory)) throw new PaymentError('This checkout belongs to another collection.',403);
  if (metadata.jothable_flow && metadata.jothable_flow !== flow) throw new PaymentError('Wrong payment purpose.',400);
  if (session.mode !== 'payment' || session.currency !== 'usd') throw new PaymentError('Invalid checkout payment.',400);
  const intent = session.payment_intent;
  if (session.payment_status !== 'paid' || typeof intent !== 'object' || intent?.status !== 'succeeded') return {status:'pending',storyId};
  const amount = nonnegativeCents(session.amount_total);
  if (amount < 1 || intent.currency !== 'usd' || Number(intent.amount_received) !== amount) throw new PaymentError('Payment amount could not be verified.',409);
  if (metadata.seller_account_id && intent.transfer_data?.destination !== metadata.seller_account_id && !(flow === 'gift' && Number(metadata.author_amount) === 0)) throw new PaymentError('Payment seller could not be verified.',409);
  const method = metadata.payment_method === 'crypto' || session.payment_method_types?.includes('crypto') ? 'stripe_crypto' : 'card';
  let platformCents: number;
  let sellerCents: number;
  let statements: any[];
  let streamId: number | null = null;
  if (flow === 'unlock') {
    if (!['PERM_UNLOCK','TIME_LIMITED'].includes(metadata.unlock_type)) throw new PaymentError('Invalid access type.',400);
    platformCents = Math.round(amount * (metadata.unlock_type === 'PERM_UNLOCK' ? 0.10 : 0.05));
    sellerCents = amount - platformCents;
    if (Number(intent.application_fee_amount) !== platformCents) throw new PaymentError('Payment fee could not be verified.',409);
    const expires = metadata.unlock_type === 'TIME_LIMITED' ? new Date(Date.now()+365*86400000).toISOString() : null;
    statements = [
      env.DB.prepare(guardedGrant).bind(userId, storyId, expires, metadata.unlock_type, session.id, session.id),
      env.DB.prepare(`INSERT INTO purchase (user_id, story_id, amount, platform_cut, seller_cut, purchase_type, method, stripe_id, status)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'completed'
        WHERE NOT EXISTS (SELECT 1 FROM stripe_checkout_fulfillment WHERE session_id = ?)
          AND NOT EXISTS (SELECT 1 FROM purchase WHERE stripe_id = ?)`)
        .bind(userId,storyId,amount/100,platformCents/100,sellerCents/100,metadata.unlock_type,method,session.id,session.id,session.id),
    ];
  } else {
    sellerCents = nonnegativeCents(metadata.author_amount);
    platformCents = nonnegativeCents(metadata.platform_amount);
    if (sellerCents+platformCents !== amount) throw new PaymentError('Gift split could not be verified.',409);
    const recipient = positiveId(metadata.to_user_id);
    const collectionId = metadata.type === 'collection' ? positiveId(metadata.collection_id) : null;
    streamId = metadata.type === 'stream' ? positiveId(metadata.stream_id) : null;
    if (!collectionId && !streamId) throw new PaymentError('Invalid gift destination.',400);
    if (sellerCents > 0 && Number(intent.transfer_data?.amount ?? amount) !== sellerCents) throw new PaymentError('Gift transfer could not be verified.',409);
    statements = [env.DB.prepare(`INSERT INTO gift (stream_id,collection_id,from_user_id,to_user_id,amount,platform_amount,message,stripe_payment_intent_id)
      SELECT ?, ?, ?, ?, ?, ?, '', ?
      WHERE NOT EXISTS (SELECT 1 FROM stripe_checkout_fulfillment WHERE session_id = ?)
        AND NOT EXISTS (SELECT 1 FROM gift WHERE stripe_payment_intent_id = ?)`)
      .bind(streamId,collectionId,userId,recipient,sellerCents/100,platformCents/100,intent.id,session.id,intent.id)];
  }
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO stripe_checkout_fulfillment
    (session_id,payment_intent_id,flow,user_id,story_id,payment_method,amount_cents,platform_cents,seller_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(session.id,intent.id,flow,userId,storyId,method,amount,platformCents,sellerCents));
  // One D1 transaction: webhook retries and the reader return can safely race.
  const result = await env.DB.batch(statements);
  return {status:'confirmed',storyId,streamId,newGift:flow==='gift' && result[0].meta.changes > 0,fromUsername:metadata.from_username || 'Someone',authorAmount:sellerCents/100};
}
