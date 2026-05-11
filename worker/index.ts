import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { SPA_HTML } from './spa_html';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_URL: string;
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
// AUTH
// ═══════════════════════════════════════════

app.get('/api/auth/check/username', async (c) => {
  const username = c.req.query('username');
  if (!username) return c.json({ error: 'Username required' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first();
  return c.json({ available: !existing });
});

app.get('/api/auth/check/display', async (c) => {
  const display = c.req.query('display');
  const userId = c.req.query('userId');
  if (!display) return c.json({ error: 'Display required' }, 400);
  let sql = 'SELECT id FROM user WHERE display = ?';
  const params: any[] = [display];
  if (userId) { sql += ' AND id != ?'; params.push(userId); }
  const existing = await c.env.DB.prepare(sql).bind(...params).first();
  return c.json({ available: !existing });
});

app.post('/api/auth/register', async (c) => {
  const { username, display, password } = await c.req.json();
  if (!username || !display || !password) return c.json({ error: 'All fields required' }, 400);
  if (password.length < 7) return c.json({ error: 'Password must be at least 7 characters' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE username = ? OR display = ?').bind(username, display).first();
  if (existing) return c.json({ error: 'Username or display name already taken' }, 409);
  const hashed = await hashPassword(password);
  const result = await c.env.DB.prepare('INSERT INTO user (username, display, password) VALUES (?, ?, ?)').bind(username, display, hashed).run();
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
  const user = await c.env.DB.prepare('SELECT id, display, username, introduction, contact, contact_on, totp_enabled, admin, created_at FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json(user);
});

app.put('/api/profile', authMiddleware, async (c) => {
  const { display, introduction, contact, contact_on } = await c.req.json();
  const userId = c.get('userId');
  if (display) {
    const existing = await c.env.DB.prepare('SELECT id FROM user WHERE display = ? AND id != ?').bind(display, userId).first();
    if (existing) return c.json({ error: 'Display name already taken' }, 409);
  }
  await c.env.DB.prepare('UPDATE user SET display = COALESCE(?, display), introduction = COALESCE(?, introduction), contact = COALESCE(?, contact), contact_on = COALESCE(?, contact_on), updated_at = datetime("now") WHERE id = ?').bind(display, introduction, contact, contact_on, userId).run();
  return c.json({ message: 'Profile updated' });
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

app.post('/api/auth/totp/setup', authMiddleware, async (c) => {
  const { secret } = await c.req.json();
  // If secret is provided (from registration), use it; otherwise generate new
  const finalSecret = secret || Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
  await c.env.DB.prepare('UPDATE user SET totp_secret = ? WHERE id = ?').bind(finalSecret, c.get('userId')).run();
  return c.json({ secret: finalSecret, qrUrl: `otpauth://totp/Nocative:${c.get('username')}?secret=${finalSecret}&issuer=Nocative` });
});

app.post('/api/auth/totp/verify', authMiddleware, async (c) => {
  const { code } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT totp_secret FROM user WHERE id = ?').bind(c.get('userId')).first<{ totp_secret: string }>();
  if (!user?.totp_secret) return c.json({ error: 'TOTP not set up' }, 400);
  const expected = generateTOTP(user.totp_secret);
  if (code !== expected) return c.json({ error: 'Invalid code' }, 401);
  await c.env.DB.prepare('UPDATE user SET totp_enabled = 1 WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ message: 'TOTP enabled' });
});

app.post('/api/auth/totp/disable', authMiddleware, async (c) => {
  await c.env.DB.prepare('UPDATE user SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ message: 'TOTP disabled' });
});

function generateTOTP(secret: string): string {
  const epoch = Math.floor(Date.now() / 30000);
  const hash = simpleHash(secret + epoch);
  return (hash % 1000000).toString().padStart(6, '0');
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

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
  const expected = generateTOTP(user.totp_secret);
  if (totpCode !== expected) return c.json({ error: 'Invalid TOTP code' }, 401);

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
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'No signature' }, 400);
  const event = JSON.parse(body);
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
});

// ═══════════════════════════════════════════
// STRIPE CONNECT (Express)
// ═══════════════════════════════════════════

// Check writer's Connect onboarding status
app.get('/api/stripe/connect/status', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT stripe_account_id FROM user WHERE id = ?').bind(userId).first<{ stripe_account_id: string | null }>();
  return c.json({ stripeAccountId: user?.stripe_account_id || null, connected: !!user?.stripe_account_id });
});

// Start Stripe Connect Express onboarding
app.post('/api/stripe/connect/onboard', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const username = c.get('username');
  const user = await c.env.DB.prepare('SELECT stripe_account_id FROM user WHERE id = ?').bind(userId).first<{ stripe_account_id: string | null }>();

  let stripeAccountId = user?.stripe_account_id;

  if (!stripeAccountId) {
    const createRes = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        type: 'express',
        country: 'US',
        email: `${username}@nocative.local`,
        'capabilities[transfers][requested]': 'true',
        'business_type': 'individual',
        'business_profile[url]': c.env.APP_URL,
        'business_profile[product_description]': 'Content creator on Nocative',
      }).toString(),
    }).then((r: any) => r.json());

    if (createRes.error) return c.json({ error: createRes.error.message || 'Failed to create Stripe account' }, 500);
    stripeAccountId = createRes.id;
    await c.env.DB.prepare('UPDATE user SET stripe_account_id = ? WHERE id = ?').bind(stripeAccountId, userId).run();
  }

  const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      account: stripeAccountId,
      'refresh_url': `${c.env.APP_URL}/fiction/collections?connect=refresh`,
      'return_url': `${c.env.APP_URL}/fiction/collections?connect=success`,
      type: 'account_onboarding',
    }).toString(),
  }).then((r: any) => r.json());

  if (linkRes.error) return c.json({ error: linkRes.error.message || 'Failed to create onboarding link' }, 500);
  return c.json({ url: linkRes.url, stripeAccountId });
});

// Stripe Connect webhook for account.updated
app.post('/api/stripe/connect-webhook', async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'No signature' }, 400);
  // In production, verify signature with STRIPE_CONNECT_WEBHOOK_SECRET
  const event = JSON.parse(body);
  if (event.type === 'account.updated') {
    const account = event.data.object;
    const accountId = account.id;
    const user = await c.env.DB.prepare('SELECT id FROM user WHERE stripe_account_id = ?').bind(accountId).first<{ id: number }>();
    if (user) {
      console.log(`Connect account ${accountId} updated for user ${user.id}: charges=${account.charges_enabled}, transfers=${account.transfers_enabled}`);
    }
  }
  return c.json({ received: true });
});

// ═══════════════════════════════════════════
// COLLECTIONS (STORIES)
// ═══════════════════════════════════════════

app.get('/api/collections', async (c) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
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

app.get('/api/collections/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(id).first<any>();
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

  // Get pricing
  const pricing = await c.env.DB.prepare('SELECT rental_price, perm_price FROM story WHERE id = ?').bind(id).first<{ rental_price: number; perm_price: number }>();

  return c.json({ ...story, chapters, labels, likeCount: likeCount?.cnt || 0, rental_price: pricing?.rental_price || 14, perm_price: pricing?.perm_price || 21 });
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

  let sql = 'SELECT id, title, created_at, updated_at, word_count, live, free FROM writing WHERE story_id = ?';
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

// Set collection pricing (author only)
app.put('/api/collections/:id/pricing', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { rental_price, perm_price } = await c.req.json();
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  await c.env.DB.prepare('UPDATE story SET rental_price = ?, perm_price = ? WHERE id = ?').bind(rental_price || 14, perm_price || 21, id).run();
  return c.json({ message: 'Pricing updated' });
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
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  await c.env.DB.prepare('UPDATE story SET title = COALESCE(?, title), description = COALESCE(?, description), genre = COALESCE(?, genre), updated_at = datetime("now") WHERE id = ?').bind(title, description, genre, id).run();
  if (labels !== undefined) {
    await c.env.DB.prepare('DELETE FROM story_label WHERE story_id = ?').bind(id).run();
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels || []).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO story_label (story_id, label_id) VALUES (?, ?)').bind(id, label.id).run();
    }
  }
  return c.json({ message: 'Updated' });
});

app.delete('/api/collections/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // Check if any permanent unlocks exist for this collection
  const permUnlock = await c.env.DB.prepare('SELECT id FROM story_unlock WHERE story_id = ? AND unlock_type = ? AND active = 1 LIMIT 1').bind(id, 'PERM_UNLOCK').first();
  if (permUnlock) {
    return c.json({ error: 'Cannot delete a collection that has been permanently purchased.' }, 400);
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
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const title = url.searchParams.get('title') || '';
  const author = url.searchParams.get('author') || '';
  const genre = url.searchParams.get('genre') || '';
  const labels = url.searchParams.get('labels') || '';
  const twLim = parseInt(url.searchParams.get('twLim') || '0');
  const sortBy = url.searchParams.get('sortBy') || '';
  const sortOrder = url.searchParams.get('sortOrder') || 'desc';

  let sql = `SELECT w.*, s.title as story_title, s.genre, u.display as author_display,
    (SELECT COUNT(*) FROM story_emotion se WHERE se.story_id = w.story_id AND se.emotion = 'like') as like_count
    FROM writing w
    JOIN story s ON w.story_id = s.id
    JOIN user u ON s.user_id = u.id
    WHERE w.live = 1`;
  const params: any[] = [];

  if (title) { sql += ' AND w.title LIKE ?'; params.push(`%${title}%`); }
  if (author) { sql += ' AND u.display LIKE ?'; params.push(`%${author}%`); }
  if (genre) { sql += ' AND s.genre = ?'; params.push(genre); }
  if (twLim > 0) { sql += ' AND w.word_count >= ?'; params.push(twLim); }
  else if (sortBy === 'createdAt') sql += ` ORDER BY w.created_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else if (sortBy === 'updatedAt') sql += ` ORDER BY w.updated_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else sql += ' ORDER BY w.updated_at DESC';

  sql += ' LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  for (const note of results as any[]) {
    const { results: noteLabels } = await c.env.DB.prepare('SELECT l.name FROM writing_label wl JOIN label l ON wl.label_id = l.id WHERE wl.writing_id = ?').bind(note.id).all();
    note.labels = noteLabels;
    note.like_count = note.like_count || 0;
  }

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as total FROM writing w JOIN story s ON w.story_id = s.id JOIN user u ON s.user_id = u.id').first<{ total: number }>();
  return c.json({ notes: results, pagination: { page, pageSize, total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / pageSize) } });
});

app.get('/api/notes/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT w.*, s.title as story_title, s.user_id as story_user_id, u.display as author_display FROM writing w JOIN story s ON w.story_id = s.id JOIN user u ON s.user_id = u.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);

  const userId = c.get('userId');
  // Allow if: note is free, user is the author, or user has unlocked the story
  if (!note.free && note.story_user_id !== userId) {
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

  // Check if the parent story has any permanent unlocks
  const permUnlock = await c.env.DB.prepare('SELECT id FROM story_unlock WHERE story_id = ? AND unlock_type = ? AND active = 1 LIMIT 1').bind(note.story_id, 'PERM_UNLOCK').first();
  if (permUnlock) {
    return c.json({ error: 'Cannot delete chapters from a collection that has been permanently purchased.' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM writing WHERE id = ?').bind(id).run();
  return c.json({ message: 'Deleted' });
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

app.post('/api/purchase/unlock', authMiddleware, async (c) => {
  const { storyId, unlockType } = await c.req.json();
  const userId = c.get('userId');

  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(storyId).first<any>();
  if (!story) return c.json({ error: 'Story not found' }, 404);

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

  // If the story's author has a Stripe Connect account, auto-split payment
  const author = await c.env.DB.prepare('SELECT stripe_account_id FROM user WHERE id = ?').bind(story.user_id).first<{ stripe_account_id: string | null }>();
  if (author?.stripe_account_id) {
    params['transfer_data[destination]'] = author.stripe_account_id;
    params['transfer_data[amount]'] = Math.round(sellerCut * 100).toString();
  }

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  }).then((r: any) => r.json());

  return c.json({ url: session.url });
});

// Stripe webhook for unlock
app.post('/api/stripe/unlock-webhook', async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'No signature' }, 400);
  // In production, verify signature with STRIPE_UNLOCK_WEBHOOK_SECRET
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const storyId = parseInt(session.metadata.story_id);
    const userId = parseInt(session.metadata.user_id);
    const unlockType = session.metadata.unlock_type;
    const amount = session.amount_total / 100;

    // Deactivate old unlocks
    await c.env.DB.prepare('UPDATE story_unlock SET active = 0 WHERE user_id = ? AND story_id = ?').bind(userId, storyId).run();

    // Calculate dates
    const startDate = new Date().toISOString();
    let endDate = null;
    if (unlockType === 'TIME_LIMITED') {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1);
      endDate = d.toISOString();
    }

    const platformCut = unlockType === 'PERM_UNLOCK' ? amount * 0.10 : amount * 0.05;
    const sellerCut = amount - platformCut;

    await c.env.DB.prepare('INSERT INTO story_unlock (user_id, story_id, unlock_type, start_date, end_date, active) VALUES (?, ?, ?, ?, ?, 1)').bind(userId, storyId, unlockType, startDate, endDate).run();

    await c.env.DB.prepare('INSERT INTO purchase (user_id, amount, platform_cut, seller_cut, purchase_type, method, stripe_id, status) VALUES (?, ?, ?, ?, ?, "visa", ?, "completed")').bind(userId, amount, platformCut, sellerCut, unlockType, session.id).run();
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
  const user = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first<{ id: number }>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT s.question_id, q.question FROM security s JOIN question q ON s.question_id = q.id WHERE s.user_id = ?').bind(user.id).all();
  return c.json(results);
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
  const { collectionId, noteId } = c.req.params;
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(noteId).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

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
  <title>${title} — Nocative</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a2e; line-height: 1.7; padding: 40px 16px; }
    .container { max-width: 800px; margin: 0 auto; }
    .card { background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 22px; margin: 24px 0 12px; }
    h3 { font-size: 18px; margin: 16px 0 8px; }
    p { margin-bottom: 12px; color: #444; }
    ul { margin: 8px 0 16px 24px; color: #444; }
    li { margin-bottom: 6px; }
    .nav-links { margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 14px; }
    .nav-links a { color: #5469d4; text-decoration: none; margin-right: 12px; }
    .nav-links a:hover { text-decoration: underline; }
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

    <h2>2. Content Ownership, Authorship, and Intellectual Property</h2>
    <p><strong>2.1 User-Created Content:</strong> Creators retain authorship and intellectual property rights for their content, securing recognition and protection even after sale.</p>
    <p><strong>2.2 Content Deletion by Creator:</strong> Creators may delete unsold content. Nocative ceases protecting intellectual property of deleted content.</p>

    <h2>3. Termination and Account Suspension</h2>
    <p><strong>3.1 User-Initiated Termination:</strong> Users may deactivate accounts, retaining historical access as needed.</p>
    <p><strong>3.2 Nocative's Right to Suspend or Terminate Accounts:</strong> Nocative may suspend/remove content or accounts violating Terms, infringing rights, or contravening laws/guidelines.</p>

    <h2>4. Dispute Resolution and Governing Law</h2>
    <p><strong>4.1 Informal Resolution:</strong> Users agree to contact Nocative for informal dispute resolution before escalating.</p>
    <p><strong>4.2 Governing Law:</strong> Terms are governed by applicable laws in your region (e.g., New Mexico/Wyoming for U.S. users).</p>
    <p><strong>4.3 Audit Rights:</strong> Pendia LLC may request documentation (e.g., analytics, sales records) to verify compliance with license terms within 7 days of request. KYC-verified users must provide requested data. Failure to comply may result in termination of license's validity.</p>

    <h2>5. Updates to These Terms</h2>
    <p><strong>5.1 Changes to Terms:</strong> Nocative may update Terms to reflect service improvements, regulatory changes, or security enhancements, with 30 days' notice for material changes.</p>
    <p><strong>5.2 Acceptance of Updated Terms:</strong> Continued use post-update signifies acceptance.</p>

    <p>Thank you for joining the Nocative community. We're committed to a safe, secure, and creative environment honoring your rights and work.</p>
  `));
});

app.get('/privacy', (c) => {
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

export default app;
