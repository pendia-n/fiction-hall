// Stripe Connect Express endpoints — inject into index.ts after webhook section

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

  // If no account exists yet, create one
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

  // Create account link for onboarding
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

// Stripe Connect webhook (handles account.updated)
app.post('/api/stripe/connect-webhook', async (c) => {
  const body = await c.req.text();
  const event = JSON.parse(body);
  const account = event.data.object;

  if (event.type === 'account.updated') {
    const accountId = account.id;
    // Update the user's stripe_account_id if it's not set
    // Also mark that onboarding is complete if charges_enabled or transfers_enabled
    const user = await c.env.DB.prepare('SELECT id FROM user WHERE stripe_account_id = ?').bind(accountId).first<{ id: number }>();
    if (user) {
      // Log the status for debugging
      console.log(`Connect account ${accountId} updated: charges=${account.charges_enabled}, transfers=${account.transfers_enabled}`);
    }
  }
  return c.json({ received: true });
});
