import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { SPA_HTML } from './spa_html';
import { AccessToken } from 'livekit-server-sdk';
import bcrypt from 'bcryptjs';
import { createPublicClient, decodeEventLog, encodeFunctionData, http, keccak256, parseAbi, stringToHex } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_UNLOCK_WEBHOOK_SECRET: string;
  APP_URL: string;
  LIVE_ROOM: DurableObjectNamespace;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  LIVEKIT_WS_URL: string;
  STRIPE_GIFT_WEBHOOK_SECRET: string;
  ARBITRUM_RPC_URL?: string;
  CRYPTO_SPLIT_CONTRACT?: `0x${string}`;
  CRYPTO_QUOTE_PRIVATE_KEY?: `0x${string}`;
  CRYPTO_USDC_ADDRESS?: `0x${string}`;
  CRYPTO_USDT_ADDRESS?: `0x${string}`;
  CRYPTO_DAI_ADDRESS?: `0x${string}`;
}

const BLOCKED_GIFT_COUNTRIES = ['HK'];
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const PRIVATE_KEY = /^0x[a-fA-F0-9]{64}$/;
const HANDLE = /^[A-Za-z0-9._-]{1,80}$/;
const NO_WHITESPACE = /\s/;
const CRYPTO_ABI = parseAbi([
  'function splitA((bytes32 orderId,bytes32 itemId,bytes32 readerRef,address writer,address token,uint256 usdAmountE6,uint64 deadline,uint256 nonce) purchase, bytes signature)',
  'function splitB((bytes32 orderId,bytes32 itemId,bytes32 readerRef,address writer,address token,uint256 usdAmountE6,uint64 deadline,uint256 nonce) purchase, bytes signature)',
  'function quoteTokenAmount(address token, uint256 usdAmountE6) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event CryptoPurchase(bytes32 indexed orderId, bytes32 indexed itemId, bytes32 indexed readerRef, address payer, address writer, address token, uint8 splitId, uint256 tokenAmount, uint256 platformAmount)',
]);

function cryptoTokenAddress(env: Env, symbol: string): `0x${string}` | null {
  const address = symbol === 'USDC' ? env.CRYPTO_USDC_ADDRESS : symbol === 'USDT' ? env.CRYPTO_USDT_ADDRESS : symbol === 'DAI' ? env.CRYPTO_DAI_ADDRESS : undefined;
  return address && EVM_ADDRESS.test(address) ? address : null;
}

function cryptoConfigured(env: Env): boolean {
  return !!(env.CRYPTO_SPLIT_CONTRACT && EVM_ADDRESS.test(env.CRYPTO_SPLIT_CONTRACT) && env.CRYPTO_QUOTE_PRIVATE_KEY && PRIVATE_KEY.test(env.CRYPTO_QUOTE_PRIVATE_KEY) && cryptoTokenAddress(env, 'USDC') && cryptoTokenAddress(env, 'USDT') && cryptoTokenAddress(env, 'DAI'));
}

function cryptoClient(env: Env) {
  return createPublicClient({ chain: arbitrum, transport: http(env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc') });
}

function bytes32Ref(value: string): `0x${string}` {
  return keccak256(stringToHex(value));
}

const app = new Hono<{ Bindings: Env; Variables: { userId: number; username: string; publicName: string } }>();

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }));

// ── Password hashing ──
async function hashPassword(password: string): Promise<string> {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try { return bcrypt.compareSync(password, stored); } catch { return false; }
}

// ── Auth middleware ──
async function authMiddleware(c: any, next: any) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verify(auth.substring(7), c.env.JWT_SECRET, 'HS256');
    c.set('userId', payload.userId);
    c.set('username', payload.username);
    c.set('publicName', payload.publicName);
    await next();
  } catch { return c.json({ error: 'Invalid token' }, 401); }
}

// ── Optional auth middleware (sets userId if token present, doesn't require it) ──
async function optionalAuth(c: any, next: any) {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = await verify(auth.substring(7), c.env.JWT_SECRET, 'HS256');
      c.set('userId', payload.userId);
      c.set('username', payload.username);
      c.set('publicName', payload.publicName);
    } catch { /* invalid token, continue as anonymous */ }
  }
  await next();
}

// ── Word count helper ──
function wordCount(text: string): number {
  if (!text) return 0;
  return text.replace(/<[^>]*>/g, ' ').replace(/[#*>`~\[\]{}|]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ═══════════════════════════════════════════
// LIVEKIT TOKEN HELPER
// ═══════════════════════════════════════════

async function createLiveKitToken(apiKey: string, apiSecret: string, identity: string, roomName: string, canPublish: boolean): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: '30m' });
  at.addGrant({ room: roomName, roomJoin: true, canPublish, canSubscribe: true });
  return await at.toJwt();
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════

app.get('/api/auth/check/username', async (c) => {
  const username = c.req.query('username');
  if (!username) return c.json({ error: 'Username required' }, 400);
  if (NO_WHITESPACE.test(username)) return c.json({ error: 'Username cannot contain spaces' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first();
  return c.json({ available: !existing });
});

app.get('/api/auth/check/display', async (c) => {
  const display = c.req.query('display');
  const userId = c.req.query('userId');
  if (!display) return c.json({ error: 'Display required' }, 400);
  if (NO_WHITESPACE.test(display)) return c.json({ error: 'Display name cannot contain spaces' }, 400);
  let sql = 'SELECT id FROM user WHERE display = ?';
  const params: any[] = [display];
  if (userId) { sql += ' AND id != ?'; params.push(userId); }
  const existing = await c.env.DB.prepare(sql).bind(...params).first();
  return c.json({ available: !existing });
});

app.post('/api/auth/register', async (c) => {
  const { username, display, password, arbitrumWallet } = await c.req.json();
  if (!username || !display || !password) return c.json({ error: 'All fields required' }, 400);
  if (NO_WHITESPACE.test(username) || NO_WHITESPACE.test(display) || username.trim() !== username || display.trim() !== display) return c.json({ error: 'Username and display name cannot contain spaces.' }, 400);
  if (password.length < 7) return c.json({ error: 'Password must be at least 7 characters' }, 400);
  if (arbitrumWallet && (typeof arbitrumWallet !== 'string' || !EVM_ADDRESS.test(arbitrumWallet.trim()))) return c.json({ error: 'Enter a valid Arbitrum/EVM wallet address or leave it blank.' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE username = ? OR display = ?').bind(username, display).first();
  if (existing) return c.json({ error: 'Username or display name already taken' }, 409);
  const hashed = await hashPassword(password);
  const wallet = typeof arbitrumWallet === 'string' && EVM_ADDRESS.test(arbitrumWallet.trim()) ? arbitrumWallet.trim() : null;
  const result = await c.env.DB.prepare('INSERT INTO user (username, display, password, arbitrum_wallet, crypto_okay) VALUES (?, ?, ?, ?, ?)').bind(username, display, hashed, wallet, wallet ? 1 : 0).run();
  const userId = result.meta.last_row_id;
  const token = await sign({ userId, username, publicName: display }, c.env.JWT_SECRET);
  return c.json({ token, userId, username, publicName: display }, 201);
});

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM user WHERE username = ?').bind(username).first<any>();
  if (!user || !await verifyPassword(password, user.password)) return c.json({ error: 'Invalid credentials' }, 401);
  if (user.deactivated) return c.json({ error: 'Account is deactivated. Reactivate via /security with your security questions.' }, 403);
  const token = await sign({ userId: user.id, username: user.username, publicName: user.display }, c.env.JWT_SECRET);
  return c.json({ token, userId: user.id, username: user.username, publicName: user.display });
});

app.get('/api/auth/status', authMiddleware, async (c) => {
  const user = await c.env.DB.prepare('SELECT id, display, username, introduction, contact, contact_on, totp_enabled, admin FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json(user);
});

app.get('/api/auth/questions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, question FROM question ORDER BY id').all();
  return c.json(results);
});

app.post('/api/auth/questions', authMiddleware, async (c) => {
  const { questions } = await c.req.json();
  if (!Array.isArray(questions) || questions.length < 3) return c.json({ error: 'At least 3 security questions required' }, 400);
  const userId = c.get('userId');
  await c.env.DB.prepare('DELETE FROM security WHERE user_id = ?').bind(userId).run();
  for (const q of questions) {
    await c.env.DB.prepare('INSERT INTO security (user_id, question_id, answer) VALUES (?, ?, ?)').bind(userId, q.questionId, q.answer).run();
  }
  return c.json({ message: 'Security questions saved' });
});

app.get('/api/auth/questions/me', authMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT s.id, s.question_id, s.answer, q.question FROM security s JOIN question q ON s.question_id = q.id WHERE s.user_id = ?').bind(c.get('userId')).all();
  return c.json(results);
});

app.post('/api/auth/questions/verify', async (c) => {
  const { username, answers } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first<{ id: number }>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT question_id, answer FROM security WHERE user_id = ?').bind(user.id).all<{ question_id: number; answer: string }>();
  let correct = 0;
  for (const a of answers) {
    const found = results.find(r => r.question_id === a.questionId);
    if (found && found.answer.toLowerCase().trim() === a.answer.toLowerCase().trim()) correct++;
  }
  if (correct < 3) return c.json({ error: 'Incorrect answers' }, 401);
  return c.json({ verified: true, userId: user.id });
});

app.post('/api/auth/reset-password', async (c) => {
  const { userId, newPassword } = await c.req.json();
  if (!userId || !newPassword) return c.json({ error: 'Missing fields' }, 400);
  const hashed = await hashPassword(newPassword);
  await c.env.DB.prepare('UPDATE user SET password = ? WHERE id = ?').bind(hashed, userId).run();
  return c.json({ message: 'Password reset successful' });
});

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════

app.get('/api/profile', authMiddleware, async (c) => {
  const user = await c.env.DB.prepare('SELECT id, display, username, introduction, contact, contact_on, totp_enabled, admin, created_at, arbitrum_wallet, crypto_okay, twitter_username, reddit_username, substack_username FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json(user);
});

app.put('/api/profile', authMiddleware, async (c) => {
  const { display, introduction, contact, contact_on, twitter_username, reddit_username, substack_username } = await c.req.json();
  const userId = c.get('userId');
  if (display !== undefined && (!display || NO_WHITESPACE.test(display) || display.trim() !== display)) return c.json({ error: 'Display name cannot be empty or contain spaces.' }, 400);
  if (display) {
    const existing = await c.env.DB.prepare('SELECT id FROM user WHERE display = ? AND id != ?').bind(display, userId).first();
    if (existing) return c.json({ error: 'Display name already taken' }, 409);
  }
  for (const [name, value] of [['twitter_username', twitter_username], ['reddit_username', reddit_username], ['substack_username', substack_username]] as const) {
    if (value !== undefined && value !== null && value !== '' && !HANDLE.test(String(value))) return c.json({ error: `${name.replace('_username', '')} must be a username without spaces.` }, 400);
  }
  const current = await c.env.DB.prepare('SELECT twitter_username, reddit_username, substack_username FROM user WHERE id = ?').bind(userId).first<any>();
  const social = (next: unknown, previous: string | null) => next === undefined ? previous : next || null;
  await c.env.DB.prepare('UPDATE user SET display = COALESCE(?, display), introduction = COALESCE(?, introduction), contact = COALESCE(?, contact), contact_on = COALESCE(?, contact_on), twitter_username = ?, reddit_username = ?, substack_username = ?, updated_at = datetime("now") WHERE id = ?').bind(display, introduction, contact, contact_on, social(twitter_username, current?.twitter_username || null), social(reddit_username, current?.reddit_username || null), social(substack_username, current?.substack_username || null), userId).run();
  return c.json({ message: 'Profile updated' });
});

app.put('/api/profile/crypto-wallet', authMiddleware, async (c) => {
  const { address } = await c.req.json<{ address?: string }>();
  const normalized = address?.trim();
  if (!normalized || !EVM_ADDRESS.test(normalized)) {
    return c.json({ error: 'Enter a valid Arbitrum/EVM wallet address beginning with 0x.' }, 400);
  }
  await c.env.DB.prepare('UPDATE user SET arbitrum_wallet = ?, crypto_okay = 1, updated_at = datetime("now") WHERE id = ?').bind(normalized, c.get('userId')).run();
  return c.json({ address: normalized, cryptoOkay: true });
});

app.delete('/api/profile/crypto-wallet', authMiddleware, async (c) => {
  await c.env.DB.prepare('UPDATE user SET arbitrum_wallet = NULL, crypto_okay = 0, updated_at = datetime("now") WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ address: null, cryptoOkay: false });
});

// Get recently viewed notes for the authenticated user
app.get('/api/profile/recent-views', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT last_view_fiction FROM user WHERE id = ?').bind(userId).first<{ last_view_fiction: string }>();
  if (!user?.last_view_fiction) return c.json({ notes: [] });

  const ids = user.last_view_fiction.split(',').map(Number).filter(id => !isNaN(id));
  if (ids.length === 0) return c.json({ notes: [] });

  // Get the notes in the order they were viewed (most recent first)
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.word_count, w.story_id, w.free, w.created_at, s.title as story_title, u.display as author_display
     FROM writing w
     JOIN story s ON w.story_id = s.id
     JOIN user u ON s.user_id = u.id
     WHERE w.id IN (${placeholders})`
  ).bind(...ids).all();

  // Sort by the order in last_view_fiction (most recent last → reverse for display)
  const ordered = [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const found = (results as any[]).find(r => r.id === ids[i]);
    if (found) ordered.push(found);
  }

  return c.json({ notes: ordered });
});

// Get user's own notes
app.get('/api/profile/my-notes', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.word_count, w.story_id, w.free, w.created_at, w.live, s.title as story_title
     FROM writing w
     JOIN story s ON w.story_id = s.id
     WHERE s.user_id = ?
     ORDER BY w.updated_at DESC
     LIMIT 100`
  ).bind(userId).all();
  return c.json({ notes: results });
});

// ═══════════════════════════════════════════
// TOTP
// ═══════════════════════════════════════════

app.get('/api/auth/totp/status', authMiddleware, async (c) => {
  const user = await c.env.DB.prepare('SELECT totp_enabled, totp_secret FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json({ enabled: user?.totp_enabled, hasSecret: !!user?.totp_secret });
});

// ── TOTP Utilities (HMAC-based, RFC 6238 compliant) ──
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Uint8Array): string {
  let result = '';
  let bits = 0, value = 0;
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32[(value << (5 - bits)) & 31];
  return result;
}

function base32Decode(s: string): Uint8Array {
  const cleaned = s.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const ch of cleaned) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function generateTOTPSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

function intTo8BytesBE(v: number): Uint8Array {
  const b = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { b[i] = v & 0xff; v >>>= 8; }
  return b;
}

async function totpAtTime(secretBytes: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secretBytes as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, intTo8BytesBE(counter) as BufferSource));
  const offset = hmac[19] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return (code % 1000000).toString().padStart(6, '0');
}

async function verifyTOTP(secretBase32: string, token: string): Promise<boolean> {
  try {
    const secretBytes = base32Decode(secretBase32);
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (let offset = -1; offset <= 1; offset++) {
      if (await totpAtTime(secretBytes, counter + offset) === token) return true;
    }
    return false;
  } catch { return false; }
}

app.post('/api/auth/totp/setup', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const secret = generateTOTPSecret();
  await c.env.DB.prepare('UPDATE user SET totp_secret = ? WHERE id = ?').bind(secret, userId).run();
  const username = c.get('username');
  const uri = `otpauth://totp/Nocative:${encodeURIComponent(username)}?secret=${secret}&issuer=Nocative&algorithm=SHA1&digits=6&period=30`;
  return c.json({ secret, qrUrl: uri });
});

app.post('/api/auth/totp/verify', authMiddleware, async (c) => {
  const { code } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT totp_secret FROM user WHERE id = ?').bind(c.get('userId')).first<{ totp_secret: string }>();
  if (!user?.totp_secret) return c.json({ error: 'TOTP not set up' }, 400);
  const valid = await verifyTOTP(user.totp_secret, code.trim());
  if (!valid) return c.json({ error: 'Invalid code' }, 401);
  await c.env.DB.prepare('UPDATE user SET totp_enabled = 1 WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ message: 'TOTP enabled' });
});

app.post('/api/auth/totp/disable', authMiddleware, async (c) => {
  await c.env.DB.prepare('UPDATE user SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ message: 'TOTP disabled' });
});

// ═══════════════════════════════════════════
// DEACTIVATION / REACTIVATION
// ═══════════════════════════════════════════

app.post('/api/auth/deactivate', authMiddleware, async (c) => {
  const userId = c.get('userId');
  await c.env.DB.prepare('UPDATE user SET deactivated = 1 WHERE id = ?').bind(userId).run();
  return c.json({ message: 'Account deactivated. To reactivate, visit /security and verify your security questions.' });
});

app.post('/api/auth/reactivate', async (c) => {
  const { username, answers, totpCode } = await c.req.json();
  if (!username || !answers || !totpCode) return c.json({ error: 'Username, answers, and TOTP code required' }, 400);

  const user = await c.env.DB.prepare('SELECT * FROM user WHERE username = ?').bind(username).first<any>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!user.deactivated) return c.json({ error: 'Account is not deactivated' }, 400);
  if (!user.totp_enabled) return c.json({ error: 'TOTP must be enabled to reactivate. Contact support.' }, 400);

  // Verify TOTP
  const valid = await verifyTOTP(user.totp_secret, totpCode.trim());
  if (!valid) return c.json({ error: 'Invalid TOTP code' }, 401);

  // Verify security questions - at least 3 correct, specifically question 3 must be correct
  const { results } = await c.env.DB.prepare('SELECT question_id, answer FROM security WHERE user_id = ?').bind(user.id).all<{ question_id: number; answer: string }>();
  let correct = 0;
  let q3Correct = false;
  for (const a of answers) {
    const found = results.find(r => r.question_id === a.questionId);
    if (found && found.answer.toLowerCase().trim() === a.answer.toLowerCase().trim()) {
      correct++;
      // Question 3 is the third security question (0-indexed: index 2)
      if (a.questionId === answers[2]?.questionId) q3Correct = true;
    }
  }
  // Verify that question 3 (the third answer in order) is correct
  if (answers.length >= 3) {
    const q3Answer = answers[2];
    const q3InDb = results.find(r => r.question_id === q3Answer.questionId);
    if (!q3InDb || q3InDb.answer.toLowerCase().trim() !== q3Answer.answer.toLowerCase().trim()) {
      return c.json({ error: 'Question 3 answer is incorrect. Reactivation requires all questions be answered correctly, especially question 3.' }, 401);
    }
  }

  if (correct < 3) {
    return c.json({ error: 'Incorrect answers. At least 3 security questions must be correct.' }, 401);
  }

  await c.env.DB.prepare('UPDATE user SET deactivated = 0 WHERE id = ?').bind(user.id).run();
  return c.json({ message: 'Account reactivated. You can now log in.' });
});

// ═══════════════════════════════════════════
// PLANS
// ═══════════════════════════════════════════

app.get('/api/plans', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM plan ORDER BY price').all();
  return c.json(results);
});

app.get('/api/plans/current', authMiddleware, async (c) => {
  const sub = await c.env.DB.prepare('SELECT s.*, p.name as plan_name, p.price FROM subscription s JOIN plan p ON s.plan_id = p.id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 1').bind(c.get('userId')).first();
  return c.json(sub);
});

// ═══════════════════════════════════════════
// STRIPE
// ═══════════════════════════════════════════

app.post('/api/stripe/checkout', authMiddleware, async (c) => {
  const { planId } = await c.req.json();
  const plan = await c.env.DB.prepare('SELECT * FROM plan WHERE id = ?').bind(planId).first<any>();
  if (!plan) return c.json({ error: 'Plan not found' }, 404);

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'payment_method_types[]': 'card', mode: 'payment',
      success_url: `${c.env.APP_URL}/fiction?payment=success`,
      cancel_url: `${c.env.APP_URL}/fiction?payment=cancelled`,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `${plan.name} Plan`,
      'line_items[0][price_data][unit_amount]': Math.round(plan.price * 100).toString(),
      'line_items[0][quantity]': '1',
      'metadata[plan_id]': planId.toString(),
      'metadata[user_id]': c.get('userId').toString(),
    }).toString(),
  }).then((r: any) => r.json());

  return c.json({ url: session.url, sessionId: session.id });
});

app.post('/api/stripe/webhook', async (c) => {
  try {
    const body = await c.req.text();
    const sig = c.req.header('stripe-signature');
    if (!sig) return c.json({ error: 'No signature' }, 400);

    let event: any;
    try { event = JSON.parse(body); } catch { return c.json({ error: 'Invalid payload' }, 400); }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const planId = parseInt(session.metadata.plan_id);
      const userId = parseInt(session.metadata.user_id);
      const amount = session.amount_total / 100;
      await c.env.DB.prepare("UPDATE subscription SET status = 'expired' WHERE user_id = ? AND status = 'active'").bind(userId).run();
      const endDate = new Date(); endDate.setFullYear(endDate.getFullYear() + 100);
      await c.env.DB.prepare('INSERT INTO subscription (user_id, plan_id, status, end_date, payment_method, mode, pre_col_lim, own_col_lim, own_wd_lim) VALUES (?, ?, "active", ?, "visa", "forever", 0, ?, ?)').bind(userId, planId, endDate.toISOString(), 999, 100000).run();
      await c.env.DB.prepare('INSERT INTO purchase (user_id, amount, platform_cut, seller_cut, purchase_type, method, stripe_id, status) VALUES (?, ?, 0, 0, "PERM_UNLOCK", "visa", ?, "completed")').bind(userId, amount, session.id).run();
    }
    return c.json({ received: true });
  } catch (err: any) {
    console.error('POST /api/stripe/webhook error:', err?.message || err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ═══════════════════════════════════════════
// STRIPE CONNECT (Express)
// ═══════════════════════════════════════════

// Check writer's Connect onboarding status (re-checks Stripe API for latest state)
app.get('/api/stripe/connect/status', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT stripe_account_id, stripe_onboarded, stripe_enabled FROM user WHERE id = ?').bind(userId).first<{ stripe_account_id: string | null; stripe_onboarded: number | null; stripe_enabled: number | null }>();
  let onboarded = !!user?.stripe_onboarded;
  // If connected, re-check Stripe API for latest status
  if (user?.stripe_account_id && user.stripe_enabled !== 0 && !onboarded) {
    try {
      const stripeRes = await fetch(`https://api.stripe.com/v1/accounts/${user.stripe_account_id}`, {
        headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}` },
      });
      if (stripeRes.ok) {
        const account = await stripeRes.json();
        if (account.charges_enabled && account.payouts_enabled) {
          onboarded = true;
          await c.env.DB.prepare('UPDATE user SET stripe_onboarded = 1 WHERE id = ?').bind(userId).run();
        }
      }
    } catch { /* ignore stripe api errors */ }
  }
  const state = !user?.stripe_account_id ? 'null' : user.stripe_enabled === 0 || !onboarded ? 'disabled' : 'fully connected';
  return c.json({ stripeAccountId: user?.stripe_account_id || null, connected: !!user?.stripe_account_id, onboarded, enabled: user?.stripe_enabled !== 0, state });
});

app.post('/api/stripe/connect/disable', authMiddleware, async (c) => {
  const account = await c.env.DB.prepare('SELECT stripe_account_id FROM user WHERE id = ?').bind(c.get('userId')).first<{ stripe_account_id: string | null }>();
  if (!account?.stripe_account_id) return c.json({ error: 'No Stripe connection exists.' }, 409);
  await c.env.DB.prepare('UPDATE user SET stripe_enabled = 0, updated_at = datetime("now") WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ state: 'disabled' });
});

app.post('/api/stripe/connect/enable', authMiddleware, async (c) => {
  const account = await c.env.DB.prepare('SELECT stripe_account_id, stripe_onboarded FROM user WHERE id = ?').bind(c.get('userId')).first<{ stripe_account_id: string | null; stripe_onboarded: number | null }>();
  if (!account?.stripe_account_id) return c.json({ error: 'No Stripe connection exists.' }, 409);
  await c.env.DB.prepare('UPDATE user SET stripe_enabled = 1, updated_at = datetime("now") WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ state: account.stripe_onboarded ? 'fully connected' : 'disabled' });
});

app.delete('/api/stripe/connect', authMiddleware, async (c) => {
  const account = await c.env.DB.prepare('SELECT stripe_account_id FROM user WHERE id = ?').bind(c.get('userId')).first<{ stripe_account_id: string | null }>();
  if (!account?.stripe_account_id) return c.json({ error: 'No Stripe connection exists.' }, 409);
  const response = await fetch(`https://api.stripe.com/v1/accounts/${account.stripe_account_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}` } });
  const result = await response.json<any>();
  if (!response.ok || result.error) return c.json({ error: result.error?.message || 'Stripe would not disconnect this account.' }, 409);
  await c.env.DB.prepare('UPDATE user SET stripe_account_id = NULL, stripe_onboarded = 0, stripe_enabled = 0, stripe_country = NULL, updated_at = datetime("now") WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ state: 'null' });
});

// Start Stripe Connect Express onboarding
app.post('/api/stripe/connect/onboard', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const username = c.get('username');
  const user = await c.env.DB.prepare('SELECT stripe_account_id FROM user WHERE id = ?').bind(userId).first<{ stripe_account_id: string | null }>();

  let stripeAccountId = user?.stripe_account_id;
  let country = 'US';
  try {
    const body = await c.req.json<{ country?: string }>();
    if (body.country) country = body.country;
  } catch { /* no body or invalid JSON, use default US */ }

  if (!stripeAccountId) {
    const createRes = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        type: 'express',
        country,
        email: `${username}@nocative.local`,
        'capabilities[card_payments][requested]': 'true',
        'business_type': 'individual',
        'business_profile[url]': c.env.APP_URL,
        'business_profile[product_description]': 'Content creator on Nocative',
      }).toString(),
    }).then((r: any) => r.json());

    if (createRes.error) return c.json({ error: createRes.error.message || 'Failed to create Stripe account' }, 500);
    stripeAccountId = createRes.id;
    await c.env.DB.prepare('UPDATE user SET stripe_account_id = ?, stripe_country = ?, stripe_enabled = 1 WHERE id = ?').bind(stripeAccountId, createRes.country || country, userId).run();
  }

  const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      account: stripeAccountId,
      'return_url': `${c.env.APP_URL}/fiction/profile?connect=success`,
      'refresh_url': `${c.env.APP_URL}/fiction/profile?connect=refresh`,
      type: 'account_onboarding',
    }).toString(),
  }).then((r: any) => r.json());

  if (linkRes.error) return c.json({ error: linkRes.error.message || 'Failed to create onboarding link' }, 500);
  return c.json({ url: linkRes.url, stripeAccountId });
});

// Stripe Connect webhook for account.updated
app.post('/api/stripe/connect-webhook', async (c) => {
  try {
    const body = await c.req.text();
    const sig = c.req.header('stripe-signature');
    if (!sig) return c.json({ error: 'No signature' }, 400);

    let event: any;
    try { event = JSON.parse(body); } catch { return c.json({ error: 'Invalid payload' }, 400); }

    // In production, verify signature with STRIPE_CONNECT_WEBHOOK_SECRET
    if (event.type === 'account.updated') {
      const account = event.data.object;
      const accountId = account.id;
      const user = await c.env.DB.prepare('SELECT id FROM user WHERE stripe_account_id = ?').bind(accountId).first<{ id: number }>();
      if (user) {
        const fullyOnboarded = account.charges_enabled && account.payouts_enabled;
        console.log(`Connect account ${accountId} updated for user ${user.id}: charges=${account.charges_enabled}, payouts=${account.payouts_enabled}, onboarded=${fullyOnboarded}, country=${account.country}`);
        await c.env.DB.prepare('UPDATE user SET stripe_onboarded = ?, stripe_country = ? WHERE id = ?').bind(fullyOnboarded ? 1 : 0, account.country || null, user.id).run();
      }
    }
    return c.json({ received: true });
  } catch (err: any) {
    console.error('POST /api/stripe/connect-webhook error:', err?.message || err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ═══════════════════════════════════════════
// LIVE STREAMING
// ═══════════════════════════════════════════

// Start a live stream (host only)
app.post('/api/live/start', authMiddleware, async (c) => {
  const { title } = await c.req.json();
  if (!title) return c.json({ error: 'Title required' }, 400);
  const userId = c.get('userId');

  const roomName = `room_${userId}_${Date.now()}`;
  const hostIdentity = `host_${userId}`;
  const livekitToken = await createLiveKitToken(c.env.LIVEKIT_API_KEY, c.env.LIVEKIT_API_SECRET, hostIdentity, roomName, true);

  const result = await c.env.DB.prepare(
    'INSERT INTO live_stream (user_id, title, room_name, livekit_token) VALUES (?, ?, ?, ?)'
  ).bind(userId, title, roomName, livekitToken).run();
  const streamId = result.meta.last_row_id;

  // Start DO 20-min alarm
  const doId = c.env.LIVE_ROOM.idFromName(streamId.toString());
  const stub = c.env.LIVE_ROOM.get(doId);
  await stub.fetch(new Request('http://dummy/start', { method: 'POST' }));

  return c.json({ streamId, roomName, livekitToken, wsUrl: c.env.LIVEKIT_WS_URL }, 201);
});

// End a live stream (host only)
app.post('/api/live/end', authMiddleware, async (c) => {
  const { streamId } = await c.req.json();
  const userId = c.get('userId');

  const stream = await c.env.DB.prepare('SELECT * FROM live_stream WHERE id = ? AND user_id = ?').bind(streamId, userId).first<any>();
  if (!stream) return c.json({ error: 'Stream not found or not yours' }, 404);

  await c.env.DB.prepare('UPDATE live_stream SET active = 0, ended_at = datetime("now") WHERE id = ?').bind(streamId).run();

  // Clear DO chat + cancel alarm
  const doId = c.env.LIVE_ROOM.idFromName(streamId.toString());
  const stub = c.env.LIVE_ROOM.get(doId);
  await stub.fetch(new Request('http://dummy/end', { method: 'POST' }));

  return c.json({ message: 'Stream ended' });
});

// List active streams
app.get('/api/live/active', optionalAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ls.*, u.display as author_display
     FROM live_stream ls
     JOIN user u ON ls.user_id = u.id
     WHERE ls.active = 1
     ORDER BY ls.started_at DESC`
  ).all();
  return c.json({ streams: results });
});

// Get host's active stream (for resume/reconnect after refresh)
app.get('/api/live/active/mine', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const stream = await c.env.DB.prepare(
    `SELECT ls.*, u.display as author_display
     FROM live_stream ls
     JOIN user u ON ls.user_id = u.id
     WHERE ls.active = 1 AND ls.user_id = ?
     ORDER BY ls.started_at DESC LIMIT 1`
  ).bind(userId).first<any>();
  if (!stream) return c.json({ stream: null });

  const livekitToken = await createLiveKitToken(c.env.LIVEKIT_API_KEY, c.env.LIVEKIT_API_SECRET, `host_${userId}`, stream.room_name, true);
  return c.json({ stream: { ...stream, livekitToken, wsUrl: c.env.LIVEKIT_WS_URL } });
});

// Get stream details (+ generate viewer token)
app.get('/api/live/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const stream = await c.env.DB.prepare(
    `SELECT ls.*, u.display as author_display, u.stripe_account_id, u.stripe_onboarded, u.stripe_enabled, u.stripe_country
     FROM live_stream ls
     JOIN user u ON ls.user_id = u.id
     WHERE ls.id = ?`
  ).bind(id).first<any>();
  if (!stream) return c.json({ error: 'Stream not found' }, 404);

  const userId = c.get('userId');
  const isHost = Number(stream.user_id) === Number(userId);

  const authorCanReceiveGifts = !!(stream.stripe_account_id && stream.stripe_onboarded && stream.stripe_enabled !== 0 && !BLOCKED_GIFT_COUNTRIES.includes(stream.stripe_country));

  let viewerToken: string | null = null;
  if (isHost) {
    viewerToken = await createLiveKitToken(c.env.LIVEKIT_API_KEY, c.env.LIVEKIT_API_SECRET, `host_${userId}`, stream.room_name, true);
  } else {
    viewerToken = await createLiveKitToken(c.env.LIVEKIT_API_KEY, c.env.LIVEKIT_API_SECRET, `viewer_${userId}`, stream.room_name, false);
  }

  return c.json({ ...stream, viewerToken, wsUrl: c.env.LIVEKIT_WS_URL, isHost, author_can_receive_gifts: authorCanReceiveGifts });
});

// Gift (tip) during a stream — Checkout Session with destination charge
app.post('/api/live/:id/gift', authMiddleware, async (c) => {
  const streamId = c.req.param('id');
  const { author_amount, platform_amount } = await c.req.json();
  const userId = c.get('userId');
  const username = c.get('username');

  const authorGift = Math.round((author_amount || 0) * 100);
  const platformGift = Math.round((platform_amount || 0) * 100);
  const total = authorGift + platformGift;

  if (total === 0) return c.json({ error: 'Gift amount must be greater than zero' }, 400);

  const stream = await c.env.DB.prepare('SELECT * FROM live_stream WHERE id = ? AND active = 1').bind(streamId).first<any>();
  if (!stream) return c.json({ error: 'Stream not found or not active' }, 404);

  const params: Record<string, string> = {
    'payment_method_types[]': 'card',
    mode: 'payment',
    success_url: `${c.env.APP_URL}/live/${streamId}?gift=success`,
    cancel_url: `${c.env.APP_URL}/live/${streamId}`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `Gift for ${stream.title}`,
    'line_items[0][price_data][unit_amount]': total.toString(),
    'line_items[0][quantity]': '1',
    'metadata[stream_id]': streamId,
    'metadata[from_user_id]': userId.toString(),
    'metadata[to_user_id]': stream.user_id.toString(),
    'metadata[from_username]': username,
    'metadata[author_amount]': authorGift.toString(),
    'metadata[platform_amount]': platformGift.toString(),
    'metadata[type]': 'stream',
  };

  if (authorGift > 0) {
    // Validate author can receive gifts
    if (authorGift < 100) return c.json({ error: 'Minimum author gift is $1' }, 400);
    const writer = await c.env.DB.prepare('SELECT stripe_account_id, stripe_onboarded, stripe_enabled, stripe_country FROM user WHERE id = ?').bind(stream.user_id).first<{ stripe_account_id: string; stripe_onboarded: number; stripe_enabled: number; stripe_country: string }>();
    if (!writer?.stripe_account_id || !writer?.stripe_onboarded || writer.stripe_enabled === 0) {
      return c.json({ error: 'Writer is not set up to receive payments' }, 400);
    }
    if (BLOCKED_GIFT_COUNTRIES.includes(writer.stripe_country)) {
      return c.json({ error: 'Gifts to authors in this region are not supported' }, 400);
    }
    params['payment_intent_data[transfer_data][destination]'] = writer.stripe_account_id;
    if (platformGift > 0) {
      // 3>1+1: explicitly route only the author portion to the connected account
      params['payment_intent_data[transfer_data][amount]'] = authorGift.toString();
    }
  }

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  }).then((r: any) => r.json());

  if (session.error) return c.json({ error: session.error.message || 'Payment failed' }, 500);
  return c.json({ url: session.url });
});

// Gift (tip) from a collection/notes page — same destination charge logic
app.post('/api/collections/:id/gift', authMiddleware, async (c) => {
  const collectionId = c.req.param('id');
  const { author_amount, platform_amount } = await c.req.json();
  const userId = c.get('userId');
  const username = c.get('username');

  const authorGift = Math.round((author_amount || 0) * 100);
  const platformGift = Math.round((platform_amount || 0) * 100);
  const total = authorGift + platformGift;

  if (total === 0) return c.json({ error: 'Gift amount must be greater than zero' }, 400);

  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(collectionId).first<any>();
  if (!story) return c.json({ error: 'Collection not found' }, 404);

  const params: Record<string, string> = {
    'payment_method_types[]': 'card',
    mode: 'payment',
    success_url: `${c.env.APP_URL}/fiction/collections/${collectionId}/notes?gift=success`,
    cancel_url: `${c.env.APP_URL}/fiction/collections/${collectionId}/notes`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `Gift for ${story.title}`,
    'line_items[0][price_data][unit_amount]': total.toString(),
    'line_items[0][quantity]': '1',
    'metadata[collection_id]': collectionId,
    'metadata[from_user_id]': userId.toString(),
    'metadata[to_user_id]': story.user_id.toString(),
    'metadata[from_username]': username,
    'metadata[author_amount]': authorGift.toString(),
    'metadata[platform_amount]': platformGift.toString(),
    'metadata[type]': 'collection',
  };

  if (authorGift > 0) {
    if (authorGift < 100) return c.json({ error: 'Minimum author gift is $1' }, 400);
    const writer = await c.env.DB.prepare('SELECT stripe_account_id, stripe_onboarded, stripe_enabled, stripe_country FROM user WHERE id = ?').bind(story.user_id).first<{ stripe_account_id: string; stripe_onboarded: number; stripe_enabled: number; stripe_country: string }>();
    if (!writer?.stripe_account_id || !writer?.stripe_onboarded || writer.stripe_enabled === 0) {
      return c.json({ error: 'Writer is not set up to receive payments' }, 400);
    }
    if (BLOCKED_GIFT_COUNTRIES.includes(writer.stripe_country)) {
      return c.json({ error: 'Gifts to authors in this region are not supported' }, 400);
    }
    params['payment_intent_data[transfer_data][destination]'] = writer.stripe_account_id;
    if (platformGift > 0) {
      params['payment_intent_data[transfer_data][amount]'] = authorGift.toString();
    }
  }

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  }).then((r: any) => r.json());

  if (session.error) return c.json({ error: session.error.message || 'Payment failed' }, 500);
  return c.json({ url: session.url });
});

// Stripe webhook for gift payment confirmations
app.post('/api/stripe/gift-webhook', async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'No signature' }, 400);

  if (c.env.STRIPE_GIFT_WEBHOOK_SECRET) {
    try {
      const parts = sig.split(',');
      let timestamp = '', sigValue = '';
      for (const p of parts) {
        const [k, ...v] = p.split('=');
        if (k === 't') timestamp = v.join('=');
        if (k === 'v1') sigValue = v.join('=');
      }
      const signedPayload = `${timestamp}.${body}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(c.env.STRIPE_GIFT_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (expectedHex !== sigValue) {
        console.error('Gift webhook: invalid signature');
        return c.json({ error: 'Invalid signature' }, 401);
      }
    } catch (e: any) {
      console.error('Gift webhook signature error:', e?.message || e);
      return c.json({ error: 'Signature verification failed' }, 401);
    }
  }

  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const fromUserId = parseInt(session.metadata.from_user_id);
    const toUserId = parseInt(session.metadata.to_user_id);
    const authorCents = parseInt(session.metadata.author_amount || '0');
    const platformCents = parseInt(session.metadata.platform_amount || '0');
    const giftType = session.metadata.type;

    const existing = await c.env.DB.prepare('SELECT id FROM gift WHERE stripe_payment_intent_id = ?').bind(session.payment_intent).first();
    if (existing) {
      console.log('Gift webhook: duplicate event, skipping');
      return c.json({ received: true });
    }

    let streamId: number | null = null;
    let collectionId: number | null = null;

    if (giftType === 'stream' && session.metadata.stream_id) {
      streamId = parseInt(session.metadata.stream_id);
    } else if (giftType === 'collection' && session.metadata.collection_id) {
      collectionId = parseInt(session.metadata.collection_id);
    }

    await c.env.DB.prepare(
      'INSERT INTO gift (stream_id, collection_id, from_user_id, to_user_id, amount, platform_amount, message, stripe_payment_intent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(streamId, collectionId, fromUserId, toUserId, authorCents / 100, platformCents / 100, '', session.payment_intent).run();

    // Notify DO to broadcast gift system message to chat (stream gifts only)
    if (streamId) {
      const fromUsername = session.metadata.from_username || 'Someone';
      const doId = c.env.LIVE_ROOM.idFromName(streamId.toString());
      const stub = c.env.LIVE_ROOM.get(doId);
      await stub.fetch(new Request(`http://dummy/gift?from=${encodeURIComponent(fromUsername)}&amount=${authorCents / 100}`, { method: 'POST' }));
    }
  }

  return c.json({ received: true });
});

// WebSocket endpoint for Durable Object chat
app.get('/api/live/:id/ws', async (c) => {
  const streamId = c.req.param('id');
  const role = c.req.query('role');
  const token = c.req.query('token');

  if (!token || !role || !['host', 'viewer'].includes(role)) {
    return c.json({ error: 'Invalid params' }, 400);
  }

  let payload: any;
  try {
    payload = await verify(token, c.env.JWT_SECRET, 'HS256');
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const doId = c.env.LIVE_ROOM.idFromName(streamId);
  const stub = c.env.LIVE_ROOM.get(doId);
  const url = new URL(c.req.url);
  url.searchParams.set('userId', payload.userId.toString());
  url.searchParams.set('username', payload.publicName || payload.username);
  return stub.fetch(new Request(url.toString(), c.req.raw));
});

// ═══════════════════════════════════════════
// COLLECTIONS (STORIES)
// ═══════════════════════════════════════════

app.get('/api/collections', async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const requestedPageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const pageSize = Math.min(10, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 10));
  const title = url.searchParams.get('title') || '';
  const author = url.searchParams.get('author') || '';
  const genre = url.searchParams.get('genre') || '';
  const labels = url.searchParams.get('labels') || '';
  const twLim = parseInt(url.searchParams.get('twLim') || '0');

  let sql = `SELECT s.*, u.display as author_display,
    (SELECT COALESCE(SUM(w.word_count), 0) FROM writing w WHERE w.story_id = s.id) as total_word_count,
    (SELECT COUNT(*) FROM writing w WHERE w.story_id = s.id) as total_note_count,
    (SELECT COUNT(*) FROM story_emotion se WHERE se.story_id = s.id AND se.emotion = 'like') as total_likes
    FROM story s JOIN user u ON s.user_id = u.id WHERE 1=1`;
  const params: any[] = [];

  if (title) { sql += ' AND s.title LIKE ?'; params.push(`%${title}%`); }
  if (author) { sql += ' AND u.display LIKE ?'; params.push(`%${author}%`); }
  if (genre) { sql += ' AND s.genre = ?'; params.push(genre); }

  sql += ' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  let collections = results as any[];

  if (labels) {
    const labelArr = labels.split(',').map((l: string) => l.trim()).filter((l: any) => l);
    const filtered: any[] = [];
    for (const col of collections) {
      const { results: storyLabels } = await c.env.DB.prepare('SELECT l.name FROM story_label sl JOIN label l ON sl.label_id = l.id WHERE sl.story_id = ?').bind(col.id).all<any>();
      if (labelArr.some((l: string) => storyLabels.some((sl: any) => sl.name === l))) filtered.push(col);
    }
    collections = filtered;
  }
  if (twLim > 0) collections = collections.filter((c: any) => (c.total_word_count || 0) >= twLim);

  for (const col of collections) {
    const { results: storyLabels } = await c.env.DB.prepare('SELECT l.name FROM story_label sl JOIN label l ON sl.label_id = l.id WHERE sl.story_id = ?').bind(col.id).all();
    (col as any).labels = storyLabels;
  }

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as total FROM story').first<{ total: number }>();
  return c.json({ collections, pagination: { page, pageSize, total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / pageSize) } });
});

app.get('/api/collections/author/:display', async (c) => {
  const display = c.req.param('display');
  const user = await c.env.DB.prepare('SELECT id FROM user WHERE display = ?').bind(display).first<{ id: number }>();
  if (!user) return c.json({ error: 'Author not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.updated_at DESC').bind(user.id).all();
  return c.json(results);
});

app.get('/api/authors/:display', async (c) => {
  const display = c.req.param('display');
  const author = await c.env.DB.prepare(
    'SELECT id, display, username, introduction, contact, contact_on, twitter_username, reddit_username, substack_username FROM user WHERE display = ?'
  ).bind(display).first<any>();
  if (!author) return c.json({ error: 'Author not found' }, 404);

  const { results: collections } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.description, s.genre, s.updated_at,
      (SELECT COUNT(*) FROM writing w WHERE w.story_id = s.id AND w.live = 1) as published_note_count,
      (SELECT COALESCE(SUM(w.word_count), 0) FROM writing w WHERE w.story_id = s.id AND w.live = 1) as published_word_count
     FROM story s WHERE s.user_id = ? ORDER BY s.updated_at DESC`
  ).bind(author.id).all();

  const { results: browsedNotes } = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.story_id, w.word_count, w.created_at, w.updated_at, s.title as story_title, MAX(wv.updated) as viewed_at
     FROM writing_view wv
     JOIN writing w ON wv.writing_id = w.id
     JOIN story s ON w.story_id = s.id
     WHERE wv.finger = ? AND s.user_id = ? AND w.live = 1
     GROUP BY w.id
     ORDER BY viewed_at DESC LIMIT 50`
  ).bind(author.id.toString(), author.id).all();

  return c.json({
    author: {
      ...author,
      contact: author.contact_on ? (author.contact || '') : null,
    },
    collections,
    browsedNotes,
  });
});

app.get('/api/collections/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display, u.username as author_username FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(id).first<any>();
  if (!story) return c.json({ error: 'Not found' }, 404);

  const userId = c.get('userId');
  // Draft enforcement: only author sees non-live chapters
  let chaptersQuery = 'SELECT id, title, created_at, updated_at, word_count, live, free FROM writing WHERE story_id = ?';
  const chaptersParams: any[] = [id];
  if (!userId || userId !== story.user_id) {
    chaptersQuery += ' AND live = 1';
  }
  chaptersQuery += ' ORDER BY created_at';
  const { results: chapters } = await c.env.DB.prepare(chaptersQuery).bind(...chaptersParams).all();
  const { results: labels } = await c.env.DB.prepare('SELECT l.name FROM story_label sl JOIN label l ON sl.label_id = l.id WHERE sl.story_id = ?').bind(id).all();
  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM story_emotion WHERE story_id = ? AND emotion = "like"').bind(id).first<{ cnt: number }>();

  // Check if author has Stripe Connect account (for C2)
  const authorUser = await c.env.DB.prepare('SELECT stripe_account_id, stripe_country, stripe_onboarded, stripe_enabled, arbitrum_wallet, crypto_okay FROM user WHERE id = ?').bind(story.user_id).first<{ stripe_account_id: string | null; stripe_country: string | null; stripe_onboarded: number | null; stripe_enabled: number | null; arbitrum_wallet: string | null; crypto_okay: number | null }>();

  // Get pricing
  const pricing = await c.env.DB.prepare('SELECT rental_price, perm_price FROM story WHERE id = ?').bind(id).first<{ rental_price: number; perm_price: number }>();

  const authorCanReceiveGifts = !!(authorUser?.stripe_account_id && authorUser?.stripe_onboarded && authorUser?.stripe_enabled !== 0 && !BLOCKED_GIFT_COUNTRIES.includes(authorUser?.stripe_country || ''));

  const stripeSaleOkay = !!(authorUser?.stripe_account_id && authorUser?.stripe_onboarded && authorUser?.stripe_enabled !== 0);
  const cryptoSaleOkay = !!(authorUser?.arbitrum_wallet && authorUser?.crypto_okay && cryptoConfigured(c.env));
  return c.json({ ...story, chapters, labels, likeCount: likeCount?.cnt || 0, author_stripe_connected: stripeSaleOkay, author_crypto_connected: cryptoSaleOkay, author_sale_enabled: stripeSaleOkay || cryptoSaleOkay, author_can_receive_gifts: authorCanReceiveGifts, rental_price: pricing?.rental_price || 14, perm_price: pricing?.perm_price || 21, sellable_count: story.sellable_count || 0 });
});

app.get('/api/collections/:id/notes', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  const userId = c.get('userId');

  // Check if user is the author
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  const isAuthor = userId && story && story.user_id === userId;

  let sql = 'SELECT w.id, w.title, w.created_at, w.updated_at, w.word_count, w.live, w.free, \
    (SELECT COUNT(*) FROM writing_view WHERE writing_id = w.id) as view_count, \
    (SELECT COUNT(*) FROM writing_emotion WHERE writing_id = w.id AND emotion = \'like\') as like_count \
    FROM writing w WHERE w.story_id = ?';
  const params: any[] = [id];
  if (!isAuthor) {
    sql += ' AND live = 1';
  }
  sql += ' ORDER BY created_at LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as total FROM writing WHERE story_id = ?').bind(id).first<{ total: number }>();
  return c.json({ notes: results, pagination: { page, pageSize, total: count?.total || 0, totalPages: Math.ceil((count?.total || 0) / pageSize) } });
});

// Get collection pricing
app.get('/api/collections/:id/pricing', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const pricing = await c.env.DB.prepare('SELECT rental_price, perm_price FROM story WHERE id = ?').bind(id).first<{ rental_price: number; perm_price: number }>();
  return c.json({ rental_price: pricing?.rental_price || 14, perm_price: pricing?.perm_price || 21 });
});

// Set collection pricing (author only) — once per 24 hours, resets at UTC 00:00
app.put('/api/collections/:id/pricing', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { rental_price, perm_price } = await c.req.json();
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id, pricing_updated_at FROM story WHERE id = ?').bind(id).first<{ user_id: number; pricing_updated_at: string | null }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  if (!Number.isFinite(Number(rental_price)) || Number(rental_price) < 14 || !Number.isFinite(Number(perm_price)) || Number(perm_price) < 21) {
    return c.json({ error: 'Minimum pricing is $14 for a 1-year rental and $21 for permanent access.' }, 400);
  }

  // Check 24-hour cooldown — resets at UTC 00:00
  // If pricing was already changed today (UTC), block until next UTC midnight
  if (story.pricing_updated_at) {
    const lastUpdate = new Date(story.pricing_updated_at);
    const now = new Date();
    const lastUpdateUtcDay = Date.UTC(lastUpdate.getUTCFullYear(), lastUpdate.getUTCMonth(), lastUpdate.getUTCDate());
    const nowUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (lastUpdateUtcDay === nowUtcDay) {
      const utcMidnightNext = new Date(nowUtcDay + 24 * 60 * 60 * 1000);
      const hoursLeft = Math.ceil((utcMidnightNext.getTime() - now.getTime()) / (1000 * 60 * 60));
      return c.json({ error: `You can only change pricing once per day. Try again in ${hoursLeft} hour(s) (at 00:00 UTC).` }, 429);
    }
  }

  await c.env.DB.prepare('UPDATE story SET rental_price = ?, perm_price = ?, pricing_updated_at = datetime("now") WHERE id = ?').bind(rental_price || 14, perm_price || 21, id).run();
  return c.json({ message: 'Pricing updated' });
});

// Mark current published chapters as sellable (author only)
app.post('/api/collections/:id/mark-sellable', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  const payout = await c.env.DB.prepare('SELECT stripe_account_id, stripe_onboarded, stripe_enabled, arbitrum_wallet, crypto_okay FROM user WHERE id = ?').bind(userId).first<any>();
  const stripeOkay = !!(payout?.stripe_account_id && payout?.stripe_onboarded && payout?.stripe_enabled !== 0);
  const cryptoOkay = !!(payout?.arbitrum_wallet && payout?.crypto_okay && cryptoConfigured(c.env));
  if (!stripeOkay && !cryptoOkay) return c.json({ error: 'Connect Stripe or add an Arbitrum wallet before marking a collection for sale.' }, 409);

  // Count all published (live=1) chapters in this collection
  const result = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing WHERE story_id = ? AND live = 1').bind(id).first<{ cnt: number }>();
  const sellableCount = result?.cnt || 0;

  await c.env.DB.prepare('UPDATE story SET sellable_count = ? WHERE id = ?').bind(sellableCount, id).run();
  return c.json({ sellable_count: sellableCount, message: `${sellableCount} chapters marked as sellable` });
});

app.post('/api/collections', authMiddleware, async (c) => {
  const { title, description, genre, labels } = await c.req.json();
  if (!title) return c.json({ error: 'Title required' }, 400);
  const userId = c.get('userId');
  try {
    const result = await c.env.DB.prepare('INSERT INTO story (title, description, genre, user_id) VALUES (?, ?, ?, ?)').bind(title, description || '', genre || null, userId).run();
    const storyId = result.meta.last_row_id;
    if (labels) {
      const labelArr = (typeof labels === 'string' ? labels.split(',') : labels).map((l: string) => l.trim()).filter((l: string) => l);
      for (const name of labelArr) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
        const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
        if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO story_label (story_id, label_id) VALUES (?, ?)').bind(storyId, label.id).run();
      }
    }
    return c.json({ id: storyId, title, description, genre }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'A collection with this title already exists' }, 409);
    throw e;
  }
});

app.put('/api/collections/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { title, description, genre, labels } = await c.req.json();
  const userId = c.get('userId');
  if (typeof title !== 'string' || !title.trim()) return c.json({ error: 'Collection title is required.' }, 400);
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (Number(story.user_id) !== Number(userId)) return c.json({ error: 'Forbidden' }, 403);
  const normalizedGenre = typeof genre === 'string' && genre.trim() ? genre.trim() : null;
  const normalizedDescription = typeof description === 'string' ? description : '';
  await c.env.DB.prepare('UPDATE story SET title = ?, description = ?, genre = ?, updated_at = datetime("now") WHERE id = ?').bind(title.trim(), normalizedDescription, normalizedGenre, id).run();
  if (labels !== undefined) {
    await c.env.DB.prepare('DELETE FROM story_label WHERE story_id = ?').bind(id).run();
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels || []).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO story_label (story_id, label_id) VALUES (?, ?)').bind(id, label.id).run();
    }
  }
  const updated = await c.env.DB.prepare('SELECT id, title, description, genre, updated_at FROM story WHERE id = ?').bind(id).first<any>();
  return c.json({ message: 'Updated', collection: updated });
});

app.delete('/api/collections/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const { totpCode } = await c.req.json().catch(() => ({ totpCode: undefined }));
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // If user has TOTP enabled, require TOTP code
  const user = await c.env.DB.prepare('SELECT totp_enabled, totp_secret FROM user WHERE id = ?').bind(userId).first<{ totp_enabled: number; totp_secret: string }>();
  if (user?.totp_enabled) {
    if (!totpCode) return c.json({ error: 'TOTP code required', totpRequired: true }, 401);
    const valid = await verifyTOTP(user.totp_secret, totpCode.trim());
    if (!valid) return c.json({ error: 'Invalid TOTP code' }, 401);
  }

  // Check if any active unlocks exist for this collection (rental or permanent)
  const activeUnlock = await c.env.DB.prepare('SELECT id FROM story_unlock WHERE story_id = ? AND active = 1 LIMIT 1').bind(id).first();
  if (activeUnlock) {
    return c.json({ error: 'Cannot delete a collection that has active purchases. Readers who rented or bought access must retain it.' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM story WHERE id = ?').bind(id).run();
  return c.json({ message: 'Deleted' });
});

// Toggle like/emotion on a collection
app.post('/api/collections/:id/emotion', authMiddleware, async (c) => {
  const storyId = c.req.param('id');
  const { emotion } = await c.req.json();
  const userId = c.get('userId');
  if (emotion === 'indifferent') {
    await c.env.DB.prepare('DELETE FROM story_emotion WHERE story_id = ? AND user_id = ?').bind(storyId, userId).run();
  } else {
    await c.env.DB.prepare('INSERT OR REPLACE INTO story_emotion (story_id, user_id, emotion) VALUES (?, ?, ?)').bind(storyId, userId, emotion).run();
  }
  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM story_emotion WHERE story_id = ? AND emotion = "like"').bind(storyId).first<{ cnt: number }>();
  return c.json({ likeCount: likeCount?.cnt || 0 });
});

// Check if user liked a collection
app.get('/api/collections/:id/emotion/status', authMiddleware, async (c) => {
  const storyId = c.req.param('id');
  const userId = c.get('userId');
  const existing = await c.env.DB.prepare('SELECT emotion FROM story_emotion WHERE story_id = ? AND user_id = ?').bind(storyId, userId).first<{ emotion: string }>();
  return c.json({ liked: existing?.emotion === 'like' });
});

// ═══════════════════════════════════════════
// NOTE EMOTION (per-chapter likes)
// ═══════════════════════════════════════════

app.post('/api/notes/:id/emotion', authMiddleware, async (c) => {
  const noteId = c.req.param('id');
  const { emotion } = await c.req.json();
  const userId = c.get('userId');
  if (emotion === 'indifferent') {
    await c.env.DB.prepare('DELETE FROM writing_emotion WHERE writing_id = ? AND user_id = ?').bind(noteId, userId).run();
  } else {
    await c.env.DB.prepare('INSERT OR REPLACE INTO writing_emotion (writing_id, user_id, emotion) VALUES (?, ?, ?)').bind(noteId, userId, emotion).run();
  }
  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_emotion WHERE writing_id = ? AND emotion = "like"').bind(noteId).first<{ cnt: number }>();
  return c.json({ likeCount: likeCount?.cnt || 0 });
});

app.get('/api/notes/:id/emotion/status', authMiddleware, async (c) => {
  const noteId = c.req.param('id');
  const userId = c.get('userId');
  const existing = await c.env.DB.prepare('SELECT emotion FROM writing_emotion WHERE writing_id = ? AND user_id = ?').bind(noteId, userId).first<{ emotion: string }>();
  return c.json({ liked: existing?.emotion === 'like' });
});

// ═══════════════════════════════════════════
// NOTES (WRITINGS)
// ═══════════════════════════════════════════

app.get('/api/notes', async (c) => {
  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const requestedPageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const pageSize = Math.min(10, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 10));
  const title = url.searchParams.get('title') || '';
  const author = url.searchParams.get('author') || '';
  const genre = url.searchParams.get('genre') || '';
  const labels = url.searchParams.get('labels') || '';
  const twLim = parseInt(url.searchParams.get('twLim') || '0');
  const freeFilter = url.searchParams.get('free') || ''; // '1'=free only, '0'=paid only, ''=both
  const minLikes = parseInt(url.searchParams.get('minLikes') || '0');
  const minViews = parseInt(url.searchParams.get('minViews') || '0');
  const sortBy = url.searchParams.get('sortBy') || '';
  const sortOrder = url.searchParams.get('sortOrder') || 'desc';

  let sql = `SELECT w.id, w.title, w.created_at, w.updated_at, w.story_id, w.word_count, w.live, w.free, s.title as story_title, s.genre, u.display as author_display,
    (SELECT COUNT(*) FROM writing_emotion we WHERE we.writing_id = w.id AND we.emotion = 'like') as noteLikeCount,
    (SELECT COUNT(*) FROM writing_view wv WHERE wv.writing_id = w.id) as view_count
    FROM writing w
    JOIN story s ON w.story_id = s.id
    JOIN user u ON s.user_id = u.id
    WHERE w.live = 1`;
  const params: any[] = [];

  if (title) { sql += ' AND w.title LIKE ?'; params.push(`%${title}%`); }
  if (author) { sql += ' AND u.display LIKE ?'; params.push(`%${author}%`); }
  if (genre) { sql += ' AND s.genre = ?'; params.push(genre); }
  if (twLim > 0) { sql += ' AND w.word_count >= ?'; params.push(twLim); }
  if (freeFilter === '1') { sql += ' AND w.free = 1'; }
  else if (freeFilter === '0') { sql += ' AND w.free = 0'; }

  if (sortBy === 'createdAt') sql += ` ORDER BY w.created_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else if (sortBy === 'updatedAt') sql += ` ORDER BY w.updated_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else if (sortBy === 'noteLikeCount') sql += ` ORDER BY noteLikeCount ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else if (sortBy === 'view_count') sql += ` ORDER BY view_count ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else sql += ' ORDER BY w.updated_at DESC';

  sql += ' LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  // Apply minLikes/minViews filters in JS (since they're computed columns)
  let filtered = results as any[];
  for (const note of filtered) {
    const { results: noteLabels } = await c.env.DB.prepare('SELECT l.name FROM writing_label wl JOIN label l ON wl.label_id = l.id WHERE wl.writing_id = ?').bind(note.id).all();
    note.labels = noteLabels;
    note.noteLikeCount = note.noteLikeCount || 0;
    note.view_count = note.view_count || 0;
  }
  if (minLikes > 0) filtered = filtered.filter((n: any) => (n.noteLikeCount || 0) >= minLikes);
  if (minViews > 0) filtered = filtered.filter((n: any) => (n.view_count || 0) >= minViews);

  // Count total (without minLikes/minViews filters for simplicity, or recalculate)
  let countSql = 'SELECT COUNT(*) as total FROM writing w JOIN story s ON w.story_id = s.id JOIN user u ON s.user_id = u.id WHERE w.live = 1';
  const countParams: any[] = [];
  if (title) { countSql += ' AND w.title LIKE ?'; countParams.push(`%${title}%`); }
  if (author) { countSql += ' AND u.display LIKE ?'; countParams.push(`%${author}%`); }
  if (genre) { countSql += ' AND s.genre = ?'; countParams.push(genre); }
  if (twLim > 0) { countSql += ' AND w.word_count >= ?'; countParams.push(twLim); }
  if (freeFilter === '1') { countSql += ' AND w.free = 1'; }
  else if (freeFilter === '0') { countSql += ' AND w.free = 0'; }
  const countResult = await c.env.DB.prepare(countSql).bind(...countParams).first<{ total: number }>();
  return c.json({ notes: filtered, pagination: { page, pageSize, total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / pageSize) } });
});

app.get('/api/notes/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT w.*, s.title as story_title, s.user_id as story_user_id, u.display as author_display FROM writing w JOIN story s ON w.story_id = s.id JOIN user u ON s.user_id = u.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);

  const userId = c.get('userId');
  // Allow if: note is free, user is the author, or user has unlocked the story
  const isAuthor = Number(note.story_user_id) === Number(userId);
  if (!note.free && !isAuthor) {
    if (!userId) return c.json({ error: 'This content is locked. Purchase to read.' }, 403);
    const unlock = await c.env.DB.prepare('SELECT id FROM story_unlock WHERE user_id = ? AND story_id = ? AND active = 1').bind(userId, note.story_id).first();
    if (!unlock) return c.json({ error: 'This content is locked. Purchase to read.' }, 403);
  }

  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM story_emotion WHERE story_id = ? AND emotion = "like"').bind(note.story_id).first<{ cnt: number }>();
  const noteLikeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_emotion WHERE writing_id = ? AND emotion = "like"').bind(id).first<{ cnt: number }>();
  const viewCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_view WHERE writing_id = ?').bind(id).first<{ cnt: number }>();
  const { results: noteLabels } = await c.env.DB.prepare('SELECT l.name FROM writing_label wl JOIN label l ON wl.label_id = l.id WHERE wl.writing_id = ?').bind(id).all();

  return c.json({ ...note, likeCount: likeCount?.cnt || 0, noteLikeCount: noteLikeCount?.cnt || 0, viewCount: viewCount?.cnt || 0, labels: noteLabels });
});

app.post('/api/notes', authMiddleware, async (c) => {
  const { storyId, title, text, labels } = await c.req.json();
  if (!storyId || !title) return c.json({ error: 'storyId and title required' }, 400);
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(storyId).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Story not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  const wc = wordCount(text || '');
  const result = await c.env.DB.prepare('INSERT INTO writing (title, text, story_id, word_count) VALUES (?, ?, ?, ?)').bind(title, text || '', storyId, wc).run();
  const noteId = result.meta.last_row_id;

  if (labels) {
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (?, ?)').bind(noteId, label.id).run();
    }
  }

  return c.json({ id: noteId, title, word_count: wc }, 201);
});

app.put('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { title, text, labels, live } = await c.req.json();
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // Published chapters cannot be edited
  if (note.live === 1 && (text !== undefined || title !== undefined)) {
    return c.json({ error: 'Published chapters cannot be edited. Create a new chapter instead.' }, 400);
  }

  const wc = text !== undefined ? wordCount(text) : note.word_count;
  await c.env.DB.prepare('UPDATE writing SET title = COALESCE(?, title), text = COALESCE(?, text), word_count = ?, live = COALESCE(?, live), updated_at = datetime("now") WHERE id = ?').bind(title, text, wc, live, id).run();

  if (labels !== undefined) {
    await c.env.DB.prepare('DELETE FROM writing_label WHERE writing_id = ?').bind(id).run();
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels || []).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (?, ?)').bind(id, label.id).run();
    }
  }
  return c.json({ message: 'Updated' });
});

app.patch('/api/notes/:id/autosave', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { text, title, labels } = await c.req.json();
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // Published chapters cannot be edited via autosave
  if (note.live === 1) {
    return c.json({ error: 'Published chapters cannot be edited. Create a new chapter instead.' }, 400);
  }

  const wc = text !== undefined ? wordCount(text) : note.word_count;
  await c.env.DB.prepare('UPDATE writing SET text = COALESCE(?, text), title = COALESCE(?, title), word_count = ?, updated_at = datetime("now") WHERE id = ?').bind(text, title, wc, id).run();
  await c.env.DB.prepare('INSERT OR REPLACE INTO writing_autosave (writing_id, user_id, text, title, updated_at) VALUES (?, ?, ?, ?, datetime("now"))').bind(id, userId, text || '', title || '').run();

  return c.json({ message: 'Auto-saved', wordCount: wc, updatedAt: new Date().toISOString() });
});

app.delete('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // Published chapters cannot be deleted
  if (note.live === 1) {
    return c.json({ error: 'Published chapters cannot be deleted. They are permanent once published.' }, 400);
  }

  // Check if the parent story has any permanent unlocks
  const permUnlock = await c.env.DB.prepare('SELECT id FROM story_unlock WHERE story_id = ? AND unlock_type = ? AND active = 1 LIMIT 1').bind(note.story_id, 'PERM_UNLOCK').first();
  if (permUnlock) {
    return c.json({ error: 'Cannot delete chapters from a collection that has been permanently purchased.' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM writing WHERE id = ?').bind(id).run();
  return c.json({ message: 'Deleted' });
});

// ═══════════════════════════════════════════
// PUBLIC PROFILE
// ═══════════════════════════════════════════

app.get('/api/public/profile/:display', async (c) => {
  const display = c.req.param('display');
  const user = await c.env.DB.prepare('SELECT id, display, introduction, contact, contact_on FROM user WHERE display = ?').bind(display).first<any>();
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Only show contact if user has made it public
  return c.json({
    display: user.display,
    introduction: user.introduction || '',
    contact: user.contact_on ? (user.contact || '') : null,
  });
});

// ═══════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════

app.post('/api/notes/:id/view', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  await c.env.DB.prepare('INSERT OR IGNORE INTO writing_view (writing_id, finger) VALUES (?, ?)').bind(id, userId.toString()).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_view WHERE writing_id = ?').bind(id).first<{ cnt: number }>();
  return c.json({ viewCount: count?.cnt || 0 });
});

// ═══════════════════════════════════════════
// PURCHASE / UNLOCK
// ═══════════════════════════════════════════

app.post('/api/crypto/quotes', authMiddleware, async (c) => {
  if (!cryptoConfigured(c.env)) return c.json({ error: 'Crypto checkout is not configured yet.' }, 503);
  const { storyId, unlockType, tokenSymbol } = await c.req.json<{ storyId: number | string; unlockType: string; tokenSymbol: string }>();
  const userId = c.get('userId');
  const symbol = String(tokenSymbol || '').toUpperCase();
  const token = cryptoTokenAddress(c.env, symbol);
  if (!token) return c.json({ error: 'Choose USDC, USDT, or DAI.' }, 400);
  const type = unlockType === 'PERM_UNLOCK' ? 'PERM_UNLOCK' : 'TIME_LIMITED';
  const splitId = type === 'PERM_UNLOCK' ? 1 : 0;

  const story = await c.env.DB.prepare(
    'SELECT s.id, s.title, s.user_id, s.rental_price, s.perm_price, s.sellable_count, u.arbitrum_wallet, u.crypto_okay FROM story s JOIN user u ON u.id = s.user_id WHERE s.id = ?'
  ).bind(storyId).first<any>();
  if (!story) return c.json({ error: 'Story not found' }, 404);
  if (story.user_id === userId) return c.json({ error: 'You cannot buy your own collection.' }, 400);
  if ((story.sellable_count || 0) < 1) return c.json({ error: 'This collection is not for sale.' }, 409);
  if (!story.crypto_okay || !story.arbitrum_wallet || !EVM_ADDRESS.test(story.arbitrum_wallet)) return c.json({ error: 'This writer does not accept crypto payments.' }, 409);

  const fiatPrice = type === 'PERM_UNLOCK' ? Math.max(21, Number(story.perm_price || 21)) : Math.max(14, Number(story.rental_price || 14));
  const cryptoUsd = fiatPrice * (type === 'PERM_UNLOCK' ? 0.5 : 0.7);
  const usdAmountE6 = BigInt(Math.round(cryptoUsd * 1_000_000));
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 15 * 60;
  const nonce = BigInt(now) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));
  const rawOrder = crypto.getRandomValues(new Uint8Array(32));
  const orderId = `0x${Array.from(rawOrder, b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
  const itemId = bytes32Ref(`fiction-hall:story:${story.id}`);
  const readerRef = bytes32Ref(`fiction-hall:user:${userId}`);
  const purchase = { orderId, itemId, readerRef, writer: story.arbitrum_wallet as `0x${string}`, token, usdAmountE6, deadline, nonce };
  const account = privateKeyToAccount(c.env.CRYPTO_QUOTE_PRIVATE_KEY!);
  const signature = await account.signTypedData({
    domain: { name: 'Fiction Hall Crypto Checkout', version: '1', chainId: arbitrum.id, verifyingContract: c.env.CRYPTO_SPLIT_CONTRACT! },
    types: { Purchase: [
      { name: 'orderId', type: 'bytes32' }, { name: 'itemId', type: 'bytes32' }, { name: 'readerRef', type: 'bytes32' },
      { name: 'writer', type: 'address' }, { name: 'token', type: 'address' }, { name: 'usdAmountE6', type: 'uint256' },
      { name: 'splitId', type: 'uint8' }, { name: 'deadline', type: 'uint64' }, { name: 'nonce', type: 'uint256' },
    ] },
    primaryType: 'Purchase',
    message: { ...purchase, splitId },
  });
  const publicClient = cryptoClient(c.env);
  const tokenAmount = await publicClient.readContract({ address: c.env.CRYPTO_SPLIT_CONTRACT!, abi: CRYPTO_ABI, functionName: 'quoteTokenAmount', args: [token, usdAmountE6] });
  const tokenDecimals = await publicClient.readContract({ address: token, abi: CRYPTO_ABI, functionName: 'decimals' });
  const approveData = encodeFunctionData({ abi: CRYPTO_ABI, functionName: 'approve', args: [c.env.CRYPTO_SPLIT_CONTRACT!, tokenAmount] });
  const payData = encodeFunctionData({ abi: CRYPTO_ABI, functionName: splitId === 0 ? 'splitA' : 'splitB', args: [purchase, signature] });
  const quoteId = orderId.slice(2);
  await c.env.DB.prepare(
    'INSERT INTO crypto_purchase_quote (id, order_id, item_id, reader_ref, user_id, story_id, writer_id, writer_wallet, token_symbol, token_address, unlock_type, split_id, usd_amount_e6, token_amount, token_decimals, deadline, nonce, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(quoteId, orderId, itemId, readerRef, userId, story.id, story.user_id, story.arbitrum_wallet, symbol, token, type, splitId, usdAmountE6.toString(), tokenAmount.toString(), Number(tokenDecimals), deadline, nonce.toString(), signature).run();
  return c.json({
    quoteId, title: story.title, tokenSymbol: symbol, cryptoUsd: cryptoUsd.toFixed(2), tokenAmount: tokenAmount.toString(), tokenDecimals: Number(tokenDecimals), expiresAt: deadline,
    checkoutUrl: `${c.env.APP_URL}/fiction/crypto-pay/${quoteId}`,
    approveUri: `ethereum:${token}@${arbitrum.id}?data=${approveData}`,
    payUri: `ethereum:${c.env.CRYPTO_SPLIT_CONTRACT}@${arbitrum.id}?data=${payData}`,
  });
});

app.get('/api/crypto/quotes/:id', authMiddleware, async (c) => {
  if (!cryptoConfigured(c.env)) return c.json({ error: 'Crypto checkout is not configured.' }, 503);
  const quote = await c.env.DB.prepare('SELECT q.*, s.title FROM crypto_purchase_quote q JOIN story s ON s.id = q.story_id WHERE q.id = ? AND q.user_id = ?').bind(c.req.param('id'), c.get('userId')).first<any>();
  if (!quote) return c.json({ error: 'Crypto checkout not found.' }, 404);
  const purchase = { orderId: quote.order_id, itemId: quote.item_id, readerRef: quote.reader_ref, writer: quote.writer_wallet, token: quote.token_address, usdAmountE6: BigInt(quote.usd_amount_e6), deadline: Number(quote.deadline), nonce: BigInt(quote.nonce) };
  const approveData = encodeFunctionData({ abi: CRYPTO_ABI, functionName: 'approve', args: [c.env.CRYPTO_SPLIT_CONTRACT!, BigInt(quote.token_amount)] });
  const payData = encodeFunctionData({ abi: CRYPTO_ABI, functionName: Number(quote.split_id) === 0 ? 'splitA' : 'splitB', args: [purchase, quote.signature] });
  return c.json({ ...quote, approveUri: `ethereum:${quote.token_address}@${arbitrum.id}?data=${approveData}`, payUri: `ethereum:${c.env.CRYPTO_SPLIT_CONTRACT}@${arbitrum.id}?data=${payData}` });
});

app.post('/api/crypto/quotes/:id/confirm', authMiddleware, async (c) => {
  if (!cryptoConfigured(c.env)) return c.json({ error: 'Crypto checkout is not configured.' }, 503);
  const { txHash } = await c.req.json<{ txHash?: string }>();
  if (!txHash || !TX_HASH.test(txHash)) return c.json({ error: 'Enter a valid Arbitrum transaction hash.' }, 400);
  const quote = await c.env.DB.prepare('SELECT * FROM crypto_purchase_quote WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('userId')).first<any>();
  if (!quote) return c.json({ error: 'Crypto checkout not found.' }, 404);
  if (quote.status === 'confirmed') return c.json({ confirmed: true, storyId: quote.story_id });
  const receipt = await cryptoClient(c.env).getTransactionReceipt({ hash: txHash as `0x${string}` });
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== c.env.CRYPTO_SPLIT_CONTRACT!.toLowerCase()) return c.json({ error: 'The transaction is not a successful Fiction Hall payment.' }, 409);
  const matched = receipt.logs.some(log => {
    try {
      const decoded = decodeEventLog({ abi: CRYPTO_ABI, eventName: 'CryptoPurchase', data: log.data, topics: log.topics });
      return log.address.toLowerCase() === c.env.CRYPTO_SPLIT_CONTRACT!.toLowerCase()
        && String(decoded.args.orderId).toLowerCase() === String(quote.order_id).toLowerCase()
        && String(decoded.args.itemId).toLowerCase() === String(quote.item_id).toLowerCase()
        && String(decoded.args.readerRef).toLowerCase() === String(quote.reader_ref).toLowerCase()
        && String(decoded.args.writer).toLowerCase() === String(quote.writer_wallet).toLowerCase()
        && String(decoded.args.token).toLowerCase() === String(quote.token_address).toLowerCase()
        && Number(decoded.args.splitId) === Number(quote.split_id);
    } catch { return false; }
  });
  if (!matched) return c.json({ error: 'This transaction does not match the checkout quote.' }, 409);
  const expiresAt = quote.unlock_type === 'TIME_LIMITED' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE crypto_purchase_quote SET status = "confirmed", tx_hash = ?, confirmed_at = datetime("now") WHERE id = ?').bind(txHash, quote.id),
    c.env.DB.prepare('INSERT INTO story_unlock (user_id, story_id, active, expires_at, unlock_type) VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id, story_id) DO UPDATE SET active = 1, expires_at = excluded.expires_at, unlock_type = excluded.unlock_type').bind(c.get('userId'), quote.story_id, expiresAt, quote.unlock_type),
    c.env.DB.prepare('INSERT INTO purchase (user_id, status, story_id, amount, fmv, method, platform_cut, purchase_type, seller_cut, stripe_id) VALUES (?, "completed", ?, ?, ?, "crypto", ?, ?, ?, ?)').bind(c.get('userId'), quote.story_id, Number(quote.usd_amount_e6) / 1_000_000, Number(quote.usd_amount_e6) / 1_000_000, Number(quote.usd_amount_e6) / 1_000_000 * (Number(quote.split_id) === 0 ? 0.15 : 0.30), quote.unlock_type, Number(quote.usd_amount_e6) / 1_000_000 * (Number(quote.split_id) === 0 ? 0.85 : 0.70), txHash),
  ]);
  return c.json({ confirmed: true, storyId: quote.story_id });
});

app.post('/api/purchase/unlock', authMiddleware, async (c) => {
  const { storyId, unlockType } = await c.req.json();
  const userId = c.get('userId');

  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(storyId).first<any>();
  if (!story) return c.json({ error: 'Story not found' }, 404);
  if (story.user_id === userId) return c.json({ error: 'You cannot buy your own collection' }, 400);
  if ((story.sellable_count || 0) < 1) return c.json({ error: 'This collection is not for sale' }, 409);

  // Use collection's pricing
  const rentalPrice = story.rental_price || 14;
  const permPrice = story.perm_price || 21;
  const price = unlockType === 'PERM_UNLOCK' ? permPrice : rentalPrice;
  const platformCut = unlockType === 'PERM_UNLOCK' ? price * 0.10 : price * 0.05;
  const sellerCut = price - platformCut;

  // Build Stripe Checkout Session params
  const params: Record<string, string> = {
    'payment_method_types[]': 'card', mode: 'payment',
    success_url: `${c.env.APP_URL}/fiction/collections/${storyId}/notes?unlocked=true`,
    cancel_url: `${c.env.APP_URL}/fiction/collections/${storyId}/notes`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `${unlockType === 'PERM_UNLOCK' ? 'Permanent' : '1-Year'} Access: ${story.title}`,
    'line_items[0][price_data][unit_amount]': Math.round(price * 100).toString(),
    'line_items[0][quantity]': '1',
    'metadata[story_id]': storyId.toString(),
    'metadata[user_id]': userId.toString(),
    'metadata[unlock_type]': unlockType,
  };

  // If the story's author has a Stripe Connect account, auto-split payment via destination charge
  const author = await c.env.DB.prepare('SELECT stripe_account_id, stripe_onboarded, stripe_enabled FROM user WHERE id = ?').bind(story.user_id).first<{ stripe_account_id: string | null; stripe_onboarded: number | null; stripe_enabled: number | null }>();
  if (!author?.stripe_account_id || !author?.stripe_onboarded || author.stripe_enabled === 0) return c.json({ error: 'This writer does not accept Stripe payments.' }, 409);
  params['payment_intent_data[transfer_data][destination]'] = author.stripe_account_id;
  params['payment_intent_data[application_fee_amount]'] = Math.round(platformCut * 100).toString();
  params['payment_intent_data[on_behalf_of]'] = author.stripe_account_id;

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  }).then((r: any) => r.json());

  if (session.error) {
    return c.json({ error: session.error.message || 'Stripe checkout failed' }, 500);
  }

  return c.json({ url: session.url });
});

// Stripe webhook for unlock
app.post('/api/stripe/unlock-webhook', async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'No signature' }, 400);

  // Verify signature with STRIPE_UNLOCK_WEBHOOK_SECRET
  if (c.env.STRIPE_UNLOCK_WEBHOOK_SECRET) {
    try {
      const parts = sig.split(',');
      let timestamp = '', sigValue = '';
      for (const p of parts) {
        const [k, ...v] = p.split('=');
        if (k === 't') timestamp = v.join('=');
        if (k === 'v1') sigValue = v.join('=');
      }
      const signedPayload = `${timestamp}.${body}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(c.env.STRIPE_UNLOCK_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (expectedHex !== sigValue) {
        console.error('Nocative unlock webhook: invalid signature');
        return c.json({ error: 'Invalid signature' }, 401);
      }
    } catch (e: any) {
      console.error('Nocative unlock webhook signature error:', e?.message || e);
      return c.json({ error: 'Signature verification failed' }, 401);
    }
  }

  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const storyId = parseInt(session.metadata.story_id);
    const userId = parseInt(session.metadata.user_id);
    const unlockType = session.metadata.unlock_type;
    const amount = session.amount_total / 100;

    // Idempotency guard: skip if already processed
    const existing = await c.env.DB.prepare('SELECT id FROM purchase WHERE stripe_id = ?').bind(session.id).first();
    if (!existing) {
      // Deactivate old unlocks
      await c.env.DB.prepare('UPDATE story_unlock SET active = 0 WHERE user_id = ? AND story_id = ?').bind(userId, storyId).run();

      // Calculate dates
      const startDate = new Date().toISOString();
      let endDate: string | null = null;
      if (unlockType === 'TIME_LIMITED') {
        const d = new Date(Date.now() + 60 * 60 * 24 * 365 * 1000);
        endDate = d.toISOString();
      }

      const platformCut = unlockType === 'PERM_UNLOCK' ? amount * 0.10 : amount * 0.05;
      const sellerCut = amount - platformCut;

      await c.env.DB.prepare('INSERT INTO story_unlock (user_id, story_id, unlock_type, start_date, end_date, active) VALUES (?, ?, ?, ?, ?, 1)').bind(userId, storyId, unlockType, startDate, endDate).run();

      await c.env.DB.prepare('INSERT INTO purchase (user_id, amount, platform_cut, seller_cut, purchase_type, method, stripe_id, status) VALUES (?, ?, ?, ?, ?, "visa", ?, "completed")').bind(userId, amount, platformCut, sellerCut, unlockType, session.id).run();
    }
  }
  return c.json({ received: true });
});

// ═══════════════════════════════════════════
// POLLING (replaces WebSocket)
// ═══════════════════════════════════════════

app.get('/api/poll/:writingId', authMiddleware, async (c) => {
  const writingId = c.req.param('writingId');
  const autosave = await c.env.DB.prepare('SELECT text, title, updated_at FROM writing_autosave WHERE writing_id = ?').bind(writingId).first<{ text: string; title: string; updated_at: string }>();
  const watching = await c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) as cnt FROM writing_autosave WHERE writing_id = ? AND updated_at > datetime("now", "-30 seconds")').bind(writingId).first<{ cnt: number }>();
  const views = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_view WHERE writing_id = ?').bind(writingId).first<{ cnt: number }>();

  return c.json({
    autosave: autosave ? { text: autosave.text, title: autosave.title, updatedAt: autosave.updated_at } : null,
    watchingCount: watching?.cnt || 0,
    viewCount: views?.cnt || 0,
    serverTime: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════
// SECURITY QUESTIONS (forgot password)
// ═══════════════════════════════════════════

app.post('/api/auth/questions/by-username', async (c) => {
  const { username } = await c.req.json();
  if (!username) return c.json({ error: 'Username required' }, 400);
  const user = await c.env.DB.prepare('SELECT id, totp_enabled FROM user WHERE username = ?').bind(username).first<{ id: number; totp_enabled: number }>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT s.question_id, q.question FROM security s JOIN question q ON s.question_id = q.id WHERE s.user_id = ?').bind(user.id).all();
  // Return both formats: array for backward compat, plus totpEnabled flag
  return c.json({ questions: results, totpEnabled: !!user.totp_enabled, length: results.length });
});

// Verify TOTP by username (for unauthenticated forgot password flow)
app.post('/api/auth/totp/verify-by-username', async (c) => {
  const { username, code } = await c.req.json();
  if (!username || !code) return c.json({ error: 'Username and code required' }, 400);
  const user = await c.env.DB.prepare('SELECT id, totp_secret, totp_enabled FROM user WHERE username = ?').bind(username).first<{ id: number; totp_secret: string; totp_enabled: number }>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (!user.totp_enabled || !user.totp_secret) return c.json({ error: 'TOTP not enabled for this user' }, 400);
  const valid = await verifyTOTP(user.totp_secret, code.trim());
  if (!valid) return c.json({ error: 'Invalid TOTP code' }, 401);
  return c.json({ verified: true, userId: user.id });
});

// Verify TOTP for collection deletion (authenticated)
app.post('/api/auth/totp/verify-for-action', authMiddleware, async (c) => {
  const { code } = await c.req.json();
  if (!code) return c.json({ error: 'Code required' }, 400);
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT totp_secret, totp_enabled FROM user WHERE id = ?').bind(userId).first<{ totp_secret: string; totp_enabled: number }>();
  if (!user?.totp_enabled || !user?.totp_secret) return c.json({ error: 'TOTP not enabled' }, 400);
  const valid = await verifyTOTP(user.totp_secret, code.trim());
  if (!valid) return c.json({ error: 'Invalid TOTP code' }, 401);
  return c.json({ verified: true });
});

// ═══════════════════════════════════════════
// SHORT-LIVED TOKEN & LAST VIEW
// ═══════════════════════════════════════════

app.get('/api/fiction/short', authMiddleware, async (c) => {
  const token = await sign({ userId: c.get('userId'), username: c.get('username'), publicName: c.get('publicName'), short: true }, c.env.JWT_SECRET);
  return c.json({ shortLivedToken: token });
});

app.post('/api/fiction/last-view', authMiddleware, async (c) => {
  const { noteId } = await c.req.json();
  const userId = c.get('userId');
  const parsedNoteId = Number(noteId);
  if (isNaN(parsedNoteId)) return c.json({ error: 'Invalid note ID' }, 400);

  const user = await c.env.DB.prepare('SELECT last_view_fiction FROM user WHERE id = ?').bind(userId).first<{ last_view_fiction: string }>();
  let ids: number[] = [];
  if (user?.last_view_fiction) {
    ids = user.last_view_fiction.split(',').map(Number).filter(id => !isNaN(id) && id !== parsedNoteId);
  }
  ids.push(parsedNoteId);
  if (ids.length > 100) ids.shift();

  await c.env.DB.prepare('UPDATE user SET last_view_fiction = ? WHERE id = ?').bind(ids.join(','), userId).run();
  return c.json({ lastViewFiction: ids.join(',') });
});

app.get('/api/fiction/author-col-count', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare('SELECT COUNT(*) as c FROM story WHERE user_id = ?').bind(userId).first<{ c: number }>();
  return c.json({ c: result?.c || 0 });
});

// ═══════════════════════════════════════════
// TOGGLE NOTE FREE/PAID STATUS
// ═══════════════════════════════════════════

app.post('/api/fiction/collections/:collectionId/toggleState/:noteId', authMiddleware, async (c) => {
  const collectionId = c.req.param('collectionId');
  const noteId = c.req.param('noteId');
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(noteId).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // Published chapters cannot be toggled
  if (note.live === 1) {
    return c.json({ error: 'Cannot change free/premium status of a published chapter.' }, 400);
  }

  // Count total chapters in this collection
  const totalCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing WHERE story_id = ?').bind(collectionId).first<{ cnt: number }>();
  const totalChaps = totalCount?.cnt || 0;

  // If setting to premium
  if (note.free) {
    if (totalChaps < 4) {
      return c.json({ error: `Collection has only ${totalChaps} chapters. Need at least 4 chapters before any can be premium.` }, 400);
    }
    // Premium cap = total - 3
    const premiumCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing WHERE story_id = ? AND free = 0').bind(collectionId).first<{ cnt: number }>();
    const maxPremium = totalChaps - 3;
    if ((premiumCount?.cnt || 0) >= maxPremium) {
      return c.json({ error: `Maximum ${maxPremium} premium chapters allowed (${totalChaps} total - 3 free). Set another chapter to free first.` }, 400);
    }
  }

  const newFree = note.free ? 0 : 1;
  await c.env.DB.prepare('UPDATE writing SET free = ? WHERE id = ?').bind(newFree, noteId).run();
  return c.json({ free: !!newFree });
});

// ═══════════════════════════════════════════
// SERVER-SIDE RENDERED PAGES (works without JS)
// ═══════════════════════════════════════════

function layoutPage(title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Fiction Hall</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;1,400&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #e7e1d5; color: #17130d; line-height: 1.7; padding: clamp(20px, 5vw, 56px) 16px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 900px; margin: 0 auto; }
    .card { background: #fffdf8; border: 1px solid #cfc6b5; border-radius: 20px; padding: clamp(24px, 5vw, 56px); box-shadow: 0 8px 32px rgba(33, 25, 14, .1); }
    h1, h2 { font-family: 'Source Serif 4', Georgia, serif; color: #17130d; letter-spacing: -.035em; }
    h1 { font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1; margin-bottom: 10px; }
    h2 { font-size: 1.55rem; margin: 36px 0 14px; padding-top: 18px; border-top: 1px solid #cfc6b5; }
    h3 { font-size: .92rem; color: #9a4b08; margin: 18px 0 6px; }
    p { margin-bottom: 14px; color: #4d4437; font-size: .95rem; }
    ul { margin: 8px 0 18px 24px; color: #4d4437; }
    li { margin-bottom: 7px; font-size: .95rem; }
    a { color: #9a4b08; text-decoration: none; }
    a:hover { color: #713506; text-decoration: underline; }
    .nav-links { margin-top: 28px; padding-top: 18px; border-top: 1px solid #cfc6b5; font-size: 14px; }
    .nav-links a { color: #9a4b08; text-decoration: none; margin-right: 14px; }
    @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #f9fafb; } .card { background: #111827; border-color: #475569; } h1, h2 { color: #f9fafb; } h2, .nav-links { border-color: #475569; } p, ul, li { color: #e5e7eb; } h3, a, .nav-links a { color: #fbbf24; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      ${bodyHtml}
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/fiction">Fiction</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

app.get('/terms', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('CDN-Cache-Control', 'no-cache');
  c.header('Surrogate-Control', 'no-cache');
  return c.html(layoutPage('Terms of Service', `
    <h1>Terms of Service</h1>
    <p><strong>Effective: Mar 28, 2026</strong></p>
    <p>Welcome to Nocative, a content-hosting platform where creators build, showcase, and exchange unique digital content in a protected, secure environment. By using Nocative's Services, you agree to these Terms of Use ("Terms") and accept associated rights and responsibilities. These Terms apply to all users: creators, buyers, registered users, and non-authenticated users.</p>

    <h2>1. Account Registration and Access</h2>
    <p><strong>1.1 General Browsing Access:</strong> The public may browse Nocative-hosted content after authentication. Registration is required to create, purchase, or interact with content.</p>
    <p><strong>1.2 Age Requirement:</strong> Users must be 16 or older, per the Children's Online Privacy Protection Act (COPPA). Users under 16 are prohibited from registering or using Nocative's Services. We recommend users under 18 seek parental guidance for safe usage and income management.</p>
    <p><strong>1.3 Registration Requirements:</strong> No Know-Your-Customer (KYC) verification is required for registration. Users need not provide real names or addresses. Optional KYC is available to gain Verified Seller status, enhancing credibility.</p>
    <p><strong>1.4 Account Security and Deactivation:</strong> Users are responsible for protecting account credentials. Creators may delete unsold content and deactivate accounts without full deletion.</p>
    <p><strong>1.5 Reactivate Deactivated Account:</strong> Users are required to have Time-based OTP code enabled. Only if security questions are verified can a deactivated account be restored.</p>
    <p><strong>1.6 Acceptance of Terms:</strong> By registering an account, you confirm that you have read, understood, and agree to be bound by these Terms. These Terms constitute a legally binding agreement between you and Nocative.</p>

    <h2>2. Content Ownership, Authorship, and Intellectual Property</h2>
    <p><strong>2.1 User-Created Content:</strong> Creators retain authorship and intellectual property rights for their content, securing recognition and protection even after sale.</p>
    <p><strong>2.2 Content Deletion by Creator:</strong> Creators may delete unsold content. Nocative ceases protecting intellectual property of deleted content.</p>
    <p><strong>2.3 Prohibition on Copying and Reproduction:</strong> All content on Nocative — whether draft or published, free or premium — is the intellectual property of its respective creator. You may not copy, reproduce, download (except where explicitly permitted), redistribute, republish, or create derivative works from any content without the express written consent of the content owner. This prohibition applies to all forms of copying including but not limited to: manual transcription, automated scraping, screenshotting for redistribution, and use of OCR or other extraction tools. Violations may result in immediate account termination and legal action.</p>
    <p><strong>2.4 Personal Use Only:</strong> Purchased or rented access grants you a personal, non-transferable, non-exclusive license to view the content for your own private use. You may not share, lend, resell, or otherwise make the content available to any third party.</p>

    <h2>3. Termination and Account Suspension</h2>
    <p><strong>3.1 User-Initiated Termination:</strong> Users may deactivate accounts, retaining historical access as needed.</p>
    <p><strong>3.2 Nocative's Right to Suspend or Terminate Accounts:</strong> Nocative may suspend/remove content or accounts violating Terms, infringing rights, or contravening laws/guidelines. Users who violate the copying and reproduction policy (Section 2.3) are subject to immediate account termination without refund.</p>

    <h2>4. Dispute Resolution and Governing Law</h2>
    <p><strong>4.1 Informal Resolution:</strong> Users agree to contact Nocative for informal dispute resolution before escalating.</p>
    <p><strong>4.2 Governing Law:</strong> Terms are governed by applicable laws in your region (e.g., New Mexico/Wyoming for U.S. users).</p>
    <p><strong>4.3 Audit Rights:</strong> Pendia LLC may request documentation (e.g., analytics, sales records) to verify compliance with license terms within 7 days of request. KYC-verified users must provide requested data. Failure to comply may result in termination of license's validity.</p>

    <h2>5. DMCA and Copyright Infringement</h2>
    <p><strong>5.1 DMCA Policy:</strong> Nocative respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 ("DMCA"), we will respond expeditiously to claims of copyright infringement committed using the Nocative service.</p>
    <p><strong>5.2 Filing a DMCA Notice:</strong> If you believe that your copyrighted work has been copied and is accessible on Nocative in a way that constitutes copyright infringement, you may submit a written notification to our designated copyright agent containing:</p>
    <ul>
      <li>A physical or electronic signature of the copyright owner or a person authorized to act on their behalf</li>
      <li>Identification of the copyrighted work claimed to have been infringed</li>
      <li>Identification of the material that is claimed to be infringing and information reasonably sufficient to permit Nocative to locate the material (e.g., the URL of the page)</li>
      <li>Your contact information (address, telephone number, and email address)</li>
      <li>A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law</li>
      <li>A statement, made under penalty of perjury, that the above information is accurate and that you are the copyright owner or authorized to act on behalf of the owner</li>
    </ul>
    <p><strong>5.3 DMCA Counter-Notice:</strong> If you believe that your content was removed or disabled by mistake or misidentification, you may submit a written counter-notice containing:</p>
    <ul>
      <li>Your physical or electronic signature</li>
      <li>Identification of the material that has been removed or to which access has been disabled, and the location at which the material appeared before it was removed or access was disabled</li>
      <li>A statement under penalty of perjury that you have a good faith belief that the material was removed or disabled as a result of mistake or misidentification</li>
      <li>Your name, address, telephone number, and a statement that you consent to the jurisdiction of the federal court for the judicial district in which your address is located</li>
    </ul>
    <p><strong>5.4 Repeat Infringers:</strong> Nocative will, in appropriate circumstances, terminate the accounts of users who are repeat copyright infringers. A user who has had content removed due to a valid DMCA notice on three (3) or more separate occasions will have their account permanently terminated.</p>
    <p><strong>5.5 Designated Copyright Agent:</strong> DMCA notices and counter-notices should be sent to: Pendia LLC, Copyright Agent, via the contact link on the Nocative website.</p>

    <h2>6. Updates to These Terms</h2>
    <p><strong>6.1 Changes to Terms:</strong> Nocative may update Terms to reflect service improvements, regulatory changes, or security enhancements, with 30 days' notice for material changes.</p>
    <p><strong>6.2 Acceptance of Updated Terms:</strong> Continued use post-update signifies acceptance. Material changes will be notified via email or prominent notice on the platform.</p>

    <p>Thank you for joining the Nocative community. We're committed to a safe, secure, and creative environment honoring your rights and work.</p>
  `));
});

app.get('/privacy', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('CDN-Cache-Control', 'no-cache');
  c.header('Surrogate-Control', 'no-cache');
  return c.html(layoutPage('Privacy Policy', `
    <h1>Privacy policy</h1>
    <p><strong>Effective: May 21, 2025</strong></p>
    <p>We at Nocative, LLC (together with our affiliates, "Nocative", "we", "our" or "us") respect your privacy and are committed to keeping secure any information we obtain from or about you. This Privacy Policy describes our practices with respect to Personal Data that collected when you use our website, applications, and services (collectively, "Services").</p>

    <h2>1. Personal Data we collect</h2>
    <p><strong>Personal Data You Provide:</strong></p>
    <p><strong>Account Information:</strong> When you created an account with us, we do not collect information like email, phone number, home address about you. Users must be 16 or older, per the Children's Online Privacy Protection Act (COPPA). We do not knowingly collect data from users under 16. If we learn a user is under 16, we will delete their data.</p>
    <p><strong>Communication Information:</strong> If you contact us (e.g., via email or social media), we collect your name, contact information, and message contents ("Communication Information").</p>
    <p><strong>Personal Data from Services:</strong></p>
    <p><strong>Usage Data:</strong> We collect information about your interactions, including content viewed, features used, time zone, country, access times, user agent, device type, and connection details.</p>
    <p><strong>Cookies and Similar Technologies:</strong> We use cookies to operate Services, maintain preferences (even without an account), and improve experience. You can manage cookie preferences via browser settings.</p>

    <h2>2. How we use Personal Data</h2>
    <p>We use Personal Data to:</p>
    <ul>
      <li>Provide, analyze, and maintain Services (e.g., respond to inquiries).</li>
      <li>Prevent fraud, illegal activity, or misuse, and protect system security.</li>
      <li>Comply with legal obligations and protect the rights, privacy, safety, or property of users, Nocative, or third parties.</li>
      <li>Aggregate or de-identify Personal Data for analytics, feature improvement, or research, ensuring it cannot re-identify you unless required by law.</li>
    </ul>

    <h2>3. Retention</h2>
    <p>We retain Personal Data only as needed to provide Services, resolve disputes, ensure safety/security, or comply with legal obligations. Retention depends on purpose, data sensitivity, risk of harm, and legal requirements.</p>

    <h2>4. Security</h2>
    <p>We implement reasonable technical, administrative, and organizational measures to protect Personal Data from loss, misuse, or unauthorized access, disclosure, alteration, or destruction. However, no Internet or email transmission is fully secure. Use caution when sharing information. We are not responsible for circumvention of privacy settings or third-party website security.</p>

    <h2>5. How to contact us</h2>
    <p>Email us via the link on our website or message us on social media. For COPPA-related inquiries, contact us to review or delete data of users under 16. We value your feedback.</p>
  `));
});

// ═══════════════════════════════════════════
// PROFILE MY COLLECTIONS (user ID based)
// ═══════════════════════════════════════════

app.get('/api/profile/my-collections', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT s.*, u.display as author_display,
      (SELECT COUNT(*) FROM writing w WHERE w.story_id = s.id) as total_note_count,
      (SELECT COALESCE(SUM(w.word_count), 0) FROM writing w WHERE w.story_id = s.id) as total_word_count
     FROM story s JOIN user u ON s.user_id = u.id
     WHERE s.user_id = ?
     ORDER BY s.updated_at DESC LIMIT 100`
  ).bind(userId).all();
  return c.json({ collections: results });
});

// ═══════════════════════════════════════════
// CATCH-ALL
// ═══════════════════════════════════════════

app.all('*', (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith('/api/')) return c.text('Not Found', 404);
  return c.html(SPA_HTML);
});

export { LiveRoom } from './live-room';
export default app;
