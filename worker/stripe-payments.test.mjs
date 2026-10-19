import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try { return next(specifier + '.ts', context); } catch {}
  }
  return next(specifier, context);
} });
const { default: app } = await import('./index.ts');
const realFetch = globalThis.fetch;
const secret = 'local-payment-test-only';
const jwt = (id) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId: id, username: `user-${id}`, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
};
function setup() {
  const sql = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  for (const [column, type] of [['stripe_account_id','TEXT'],['stripe_onboarded','INTEGER'],['stripe_country','TEXT']]) {
    if (!sql.prepare('PRAGMA table_info(user)').all().some(c => c.name === column)) sql.exec(`ALTER TABLE user ADD COLUMN ${column} ${type}`);
  }
  sql.exec('CREATE TABLE IF NOT EXISTS writing_emotion (id INTEGER PRIMARY KEY, writing_id INTEGER, user_id INTEGER, emotion TEXT)');
  const migration = new URL('../migrations/add_stripe_fulfillment.sql', import.meta.url);
  if (existsSync(migration)) sql.exec(readFileSync(migration, 'utf8'));
  sql.exec(`INSERT INTO user(id,display,username,password) VALUES(1,'Reader','reader','test'),(2,'Writer','writer','test');
    UPDATE user SET stripe_account_id='acct_writer',stripe_onboarded=1,stripe_enabled=1,stripe_country='US' WHERE id=2;
    INSERT INTO story(id,title,user_id,sellable_count,rental_price,perm_price) VALUES(31,'Comic',2,1,5,8);
    INSERT INTO writing(id,title,story_id,live,free,text) VALUES(778,'Paid comic',31,1,0,'Panel');
    INSERT INTO live_stream(id,user_id,title,room_name,livekit_token,active) VALUES(9,2,'Comic stream','test-room','test',1);`);
  const db = { prepare(query) {
    return { bind(...args) { const statement = { query, args,
      async first() { return sql.prepare(query).get(...args) ?? null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { const r=sql.prepare(query).run(...args); return { success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)} }; }
    }; return statement; } };
  }, async batch(statements) { sql.exec('BEGIN IMMEDIATE'); try { const out=[];for(const s of statements) { const r=sql.prepare(s.query).run(...s.args);out.push({success:true,meta:{changes:Number(r.changes)}}); } sql.exec('COMMIT'); return out; } catch(e){sql.exec('ROLLBACK');throw e;} } };
  const state={ account:{ id:'acct_writer',country:'US',details_submitted:true,charges_enabled:true,payouts_enabled:true,capabilities:{card_payments:'active',transfers:'active',crypto_payments:'active'} }, checkout:null, session:null };
  globalThis.fetch = async (input, init={}) => {
    const url=String(input);
    if(url.includes('/accounts/acct_writer/capabilities/crypto_payments')) return state.capabilityUnavailable ? Response.json({error:{message:'No such capability: crypto_payments',code:'resource_missing'}},{status:404}) : Response.json({status:state.account.capabilities.crypto_payments});
    if(url.endsWith('/accounts/acct_writer')) return Response.json(state.account);
    if(url.includes('/checkout/sessions/') && !init.method) return Response.json(state.session);
    if(url.endsWith('/checkout/sessions') && init.method==='POST') { state.checkout=new URLSearchParams(init.body);return Response.json({id:'cs_test_new',url:'https://checkout.stripe.com/test'}); }
    throw new Error('Unexpected external call '+url);
  };
  const env={DB:db,JWT_SECRET:secret,STRIPE_SECRET_KEY:'sk_test_mock',STRIPE_WEBHOOK_SECRET:secret,STRIPE_UNLOCK_WEBHOOK_SECRET:secret,STRIPE_GIFT_WEBHOOK_SECRET:secret,APP_URL:'https://jothable.online',LIVE_ROOM:{idFromName:v=>v,get:()=>({fetch:async()=>new Response('ok')})}};
  const request=(path,body,userId=1,extra={}) => app.fetch(new Request('https://jothable.online'+path,{method:'POST',headers:{Authorization:`Bearer ${jwt(userId)}`,'Content-Type':'application/json',...extra},body:JSON.stringify(body)}),env,{waitUntil(){},passThroughOnException(){}});
  return {sql,state,env,request,close(){globalThis.fetch=realFetch;sql.close();}};
}
function paidSession(method='crypto') {return {id:'cs_test_paid',mode:'payment',status:'complete',payment_status:'paid',currency:'usd',amount_total:800,
 metadata:{story_id:'31',user_id:'1',unlock_type:'PERM_UNLOCK',jothable_flow:'unlock',seller_account_id:'acct_writer',payment_method:method},
 payment_method_types:[method],payment_intent:{id:'pi_paid',status:'succeeded',amount_received:800,currency:'usd',payment_method_types:[method],transfer_data:{destination:'acct_writer'},application_fee_amount:80}};}

test('USDC unlock uses Stripe crypto and preserves the connected author split',async()=>{const f=setup();try{
 const r=await f.request('/api/purchase/unlock',{storyId:31,unlockType:'PERM_UNLOCK',paymentMethod:'crypto'});assert.equal(r.status,200,await r.text());
 assert.equal(f.state.checkout.get('payment_method_types[0]') ?? f.state.checkout.get('payment_method_types[]'),'crypto');
 assert.equal(f.state.checkout.get('payment_intent_data[transfer_data][destination]'),'acct_writer');assert.equal(f.state.checkout.get('payment_intent_data[application_fee_amount]'),'80');
 assert.match(f.state.checkout.get('success_url'),/session_id=\{CHECKOUT_SESSION_ID\}/);
}finally{f.close();}});
test('stale onboarding cannot accept a payment from a Stripe-restricted seller',async()=>{const f=setup();try{
 f.state.account.payouts_enabled=false;
 const r=await f.request('/api/purchase/unlock',{storyId:31,unlockType:'PERM_UNLOCK',paymentMethod:'card'});assert.equal(r.status,409);assert.equal(f.state.checkout,null);
}finally{f.close();}});
test('platform-only gift still requires an active connected seller',async()=>{const f=setup();try{
 f.sql.exec('UPDATE user SET stripe_enabled=0 WHERE id=2');const r=await f.request('/api/collections/31/gift',{author_amount:0,platform_amount:1,paymentMethod:'card'});assert.equal(r.status,409);assert.equal(f.state.checkout,null);
}finally{f.close();}});
test('paid return grants collection access immediately and concurrent repeats record only one purchase',async()=>{const f=setup();try{
 f.state.session=paidSession();
 const body={sessionId:'cs_test_paid',storyId:31};
 const results=await Promise.all([f.request('/api/purchase/confirm',body),f.request('/api/purchase/confirm',body)]);
 for(const r of results){assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).status,'confirmed');}
 const access=f.sql.prepare('SELECT * FROM story_unlock WHERE user_id=1 AND story_id=31').get();assert.equal(access.unlock_type,'PERM_UNLOCK');assert.equal(access.active,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM purchase').get().n,1);
 assert.equal(f.sql.prepare('SELECT story_id FROM purchase').get().story_id,31);
}finally{f.close();}});
test('unpaid or another reader’s checkout can never unlock chapters',async()=>{const f=setup();try{
 f.state.session={...paidSession(),payment_status:'unpaid'};let r=await f.request('/api/purchase/confirm',{sessionId:'cs_test_paid',storyId:31});assert.equal(r.status,200);assert.equal((await r.json()).status,'pending');
 f.state.session=paidSession();r=await f.request('/api/purchase/confirm',{sessionId:'cs_test_paid',storyId:31},2);assert.equal(r.status,403);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM story_unlock').get().n,0);
}finally{f.close();}});

for (const method of ['card','crypto']) {
  for (const route of ['/api/collections/31/gift','/api/live/9/gift']) {
    test(`${method} gift on ${route} routes the exact writer and platform amounts`,async()=>{const f=setup();try{
      const r=await f.request(route,{author_amount:3,platform_amount:1,paymentMethod:method});assert.equal(r.status,200,await r.text());
      assert.equal(f.state.checkout.get('payment_method_types[0]'),method);
      assert.equal(f.state.checkout.get('payment_intent_data[transfer_data][destination]'),'acct_writer');
      assert.equal(f.state.checkout.get('payment_intent_data[transfer_data][amount]'),'300');
      assert.equal(f.state.checkout.get('line_items[0][price_data][unit_amount]'),'400');
    }finally{f.close();}});
  }
}
test('crypto approval is required independently of card approval',async()=>{const f=setup();try{
 f.state.account.capabilities.crypto_payments='inactive';
 let r=await f.request('/api/purchase/unlock',{storyId:31,unlockType:'PERM_UNLOCK',paymentMethod:'crypto'});assert.equal(r.status,409);assert.equal(f.state.checkout,null);
 r=await f.request('/api/purchase/unlock',{storyId:31,unlockType:'PERM_UNLOCK',paymentMethod:'card'});assert.equal(r.status,200);
}finally{f.close();}});
test('remote Stripe failure never falls back to charging only the platform',async()=>{const f=setup();try{
 globalThis.fetch=async()=>{throw new Error('network failure');};
 const r=await f.request('/api/collections/31/gift',{author_amount:3,platform_amount:1});assert.equal(r.status,503);assert.equal(f.state.checkout,null);
}finally{f.close();}});
function signed(event,timestamp=Math.floor(Date.now()/1000)) { const body=JSON.stringify(event);return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`; }
test('signed asynchronous success unlocks chapters and a later return cannot duplicate the sale',async()=>{const f=setup();try{
 f.state.session=paidSession();
 const event={type:'checkout.session.async_payment_succeeded',data:{object:{id:'cs_test_paid',metadata:f.state.session.metadata}}};
 const r=await f.request('/api/stripe/unlock-webhook',event,1,{'stripe-signature':signed(event)});assert.equal(r.status,200,await r.text());
 assert.equal(f.sql.prepare('SELECT active FROM story_unlock WHERE user_id=1 AND story_id=31').get().active,1);
 await f.request('/api/purchase/confirm',{sessionId:'cs_test_paid',storyId:31});
 assert.equal(f.sql.prepare('SELECT count(*) n FROM purchase').get().n,1);
}finally{f.close();}});
test('a completed but unpaid checkout never grants access, even through a valid webhook',async()=>{const f=setup();try{
 f.state.session={...paidSession(),payment_status:'unpaid'};
 const event={type:'checkout.session.completed',data:{object:{id:'cs_test_paid',metadata:f.state.session.metadata}}};
 const r=await f.request('/api/stripe/unlock-webhook',event,1,{'stripe-signature':signed(event)});assert.equal(r.status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM story_unlock').get().n,0);
}finally{f.close();}});
test('webhooks reject forged, expired and missing-secret signatures',async()=>{const f=setup();try{
 const event={type:'checkout.session.completed',data:{object:{id:'cs_test_paid'}}};
 assert.equal((await f.request('/api/stripe/unlock-webhook',event,1,{'stripe-signature':'t=1,v1=bad'})).status,401);
 assert.equal((await f.request('/api/stripe/unlock-webhook',event,1,{'stripe-signature':signed(event,1)})).status,401);
 delete f.env.STRIPE_UNLOCK_WEBHOOK_SECRET;
 assert.equal((await f.request('/api/stripe/unlock-webhook',event,1,{'stripe-signature':signed(event)})).status,503);
}finally{f.close();}});
test('a signed gift success records USDC once across webhook retries',async()=>{const f=setup();try{
 f.state.session={...paidSession(),amount_total:400,metadata:{jothable_flow:'gift',payment_method:'crypto',seller_account_id:'acct_writer',from_user_id:'1',to_user_id:'2',author_amount:'300',platform_amount:'100',type:'collection',collection_id:'31'},payment_intent:{id:'pi_gift',currency:'usd',amount_received:400,status:'succeeded',transfer_data:{destination:'acct_writer',amount:300}}};
 const event={type:'checkout.session.async_payment_succeeded',data:{object:{id:'cs_test_paid',metadata:f.state.session.metadata}}};
 for(let n=0;n<2;n++) {const r=await f.request('/api/stripe/gift-webhook',event,1,{'stripe-signature':signed(event)});assert.equal(r.status,200,await r.text());}
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gift').get().n,1);
 assert.equal(f.sql.prepare('SELECT payment_method FROM stripe_checkout_fulfillment').get().payment_method,'stripe_crypto');
}finally{f.close();}});
test('a later rental cannot downgrade permanent collection access',async()=>{const f=setup();try{
 f.state.session=paidSession();await f.request('/api/purchase/confirm',{sessionId:'cs_test_paid',storyId:31});
 f.state.session={...paidSession('card'),id:'cs_test_rental',amount_total:500,metadata:{...paidSession('card').metadata,unlock_type:'TIME_LIMITED'},payment_intent:{...paidSession('card').payment_intent,id:'pi_rental',amount_received:500,application_fee_amount:25}};
 const r=await f.request('/api/purchase/confirm',{sessionId:'cs_test_rental',storyId:31});assert.equal(r.status,200,await r.text());
 const access=f.sql.prepare('SELECT * FROM story_unlock WHERE user_id=1 AND story_id=31').get();assert.equal(access.unlock_type,'PERM_UNLOCK');assert.equal(access.expires_at,null);
}finally{f.close();}});
test('$5 rental and $8 permanent pricing is accepted; smaller prices are rejected',async()=>{const f=setup();try{
 const put=(body)=>app.fetch(new Request('https://jothable.online/api/collections/31/pricing',{method:'PUT',headers:{Authorization:`Bearer ${jwt(2)}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),f.env);
 assert.equal((await put({rental_price:4.99,perm_price:8})).status,400);
 assert.equal((await put({rental_price:5,perm_price:7.99})).status,400);
 const r=await put({rental_price:5,perm_price:8});assert.equal(r.status,200,await r.text());
}finally{f.close();}});

test('confirmed payment immediately opens both the chapter API and its protected illustration',async()=>{const f=setup();try{
 f.sql.exec("INSERT INTO collection_image(id,story_id,writing_id,object_key,thumbnail_key,file_size) VALUES('test-image',31,778,'panel.png','thumb.png',8)");
 f.env.IMAGES={get:async()=>({body:new Response(new Uint8Array([137,80,78,71,13,10,26,10])).body,size:8})};
 const read=(path)=>app.fetch(new Request('https://jothable.online'+path,{headers:{Authorization:`Bearer ${jwt(1)}`}}),f.env);
 assert.equal((await read('/api/notes/778')).status,403);
 assert.equal((await read('/api/images/test-image')).status,403);
 f.state.session=paidSession();
 const r=await f.request('/api/purchase/confirm',{sessionId:'cs_test_paid',storyId:31});assert.equal(r.status,200);
 assert.equal((await read('/api/notes/778')).status,200);
 assert.equal((await read('/api/images/test-image')).status,200);
}finally{f.close();}});

test('comic unlock events delivered to the membership webhook never change memberships',async()=>{const f=setup();try{
 f.sql.exec("INSERT INTO subscription(user_id,plan_id,status) VALUES(1,1,'active')");
 const session=paidSession();const event={type:'checkout.session.completed',data:{object:session}};
 const r=await f.request('/api/stripe/webhook',event,1,{'stripe-signature':signed(event)});assert.equal(r.status,200,await r.text());
 assert.equal(f.sql.prepare('SELECT status FROM subscription WHERE user_id=1').get().status,'active');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM purchase').get().n,0);
}finally{f.close();}});

test('the existing delayed-success unlock subscription also safely fulfills gifts',async()=>{const f=setup();try{
 f.state.session={...paidSession(),amount_total:400,metadata:{jothable_flow:'gift',payment_method:'crypto',seller_account_id:'acct_writer',from_user_id:'1',to_user_id:'2',author_amount:'300',platform_amount:'100',type:'collection',collection_id:'31'},payment_intent:{id:'pi_delayed_gift',currency:'usd',amount_received:400,status:'succeeded',transfer_data:{destination:'acct_writer',amount:300}}};
 const event={type:'checkout.session.async_payment_succeeded',data:{object:{id:'cs_test_paid',metadata:f.state.session.metadata}}};
 const r=await f.request('/api/stripe/unlock-webhook',event,1,{'stripe-signature':signed(event)});assert.equal(r.status,200,await r.text());
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gift').get().n,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM story_unlock').get().n,0);
 const duplicate={...event,type:'checkout.session.completed'};
 const replay=await f.request('/api/stripe/gift-webhook',duplicate,1,{'stripe-signature':signed(duplicate)});assert.equal(replay.status,200);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM gift').get().n,1);
}finally{f.close();}});

 test('unavailable USDC never reports an active connected account as missing',async()=>{const f=setup();try{
 f.state.account.country='HK';delete f.state.account.capabilities.crypto_payments;f.state.capabilityUnavailable=true;
 const r=await f.request('/api/stripe/connect/usdc',{},2);assert.equal(r.status,409);const result=await r.json();
 assert.match(result.error,/USDC.*not available/);assert.doesNotMatch(result.error,/no longer exists/);
 assert.equal(f.sql.prepare('SELECT stripe_account_id FROM user WHERE id=2').get().stripe_account_id,'acct_writer');
 const status=await app.fetch(new Request('https://jothable.online/api/stripe/connect/status',{headers:{Authorization:`Bearer ${jwt(2)}`}}),f.env);
 const data=await status.json();assert.equal(data.state,'fully connected');assert.equal(data.usdcStatus,'unavailable');
}finally{f.close();}});

test('a USDC capability 404 on a US seller does not claim its account is missing',async()=>{const f=setup();try{
 delete f.state.account.capabilities.crypto_payments;f.state.capabilityUnavailable=true;
 const r=await f.request('/api/stripe/connect/usdc',{},2);assert.equal(r.status,409);
 const data=await r.json();assert.match(data.error,/USDC is not available/);assert.doesNotMatch(data.error,/no longer exists/);
}finally{f.close();}});
