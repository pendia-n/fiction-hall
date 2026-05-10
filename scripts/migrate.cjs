const fs = require('fs');

const dump = fs.readFileSync('/tmp/anecdote_dump.sql', 'utf8');
const lines = dump.split('\n');
let currentTable = '';
let outLines = [];

const tableMap = {
  '_collection_labels': 'story_label',
  '_note_labels': 'writing_label',
  'label': 'label',
  'plan': 'plan',
  'purchase': 'purchase',
  'question': 'question',
  'security': 'security',
  'story': 'story',
  'story_emotion': 'story_emotion',
  'story_unlock': 'story_unlock',
  'subscription': 'subscription',
  'user': 'user',
  'writing': 'writing',
  'writing_view': 'writing_view',
};

const colMap = {
  '`userId`': 'user_id',
  '`questionId`': 'question_id',
  '`storyId`': 'story_id',
  '`writingId`': 'writing_id',
  '`planId`': 'plan_id',
  '`twLim`': 'tw_lim',
  '`numFree`': 'num_free',
  '`requireFree`': 'require_free',
  '`wordCount`': 'word_count',
  '`createdAt`': 'created_at',
  '`updatedAt`': 'updated_at',
  '`totpSecret`': 'totp_secret',
  '`totpEnabled`': 'totp_enabled',
  '`subscriptionId`': 'subscription_id',
  '`contactOn`': 'contact_on',
  '`lastViewFiction`': 'last_view_fiction',
  '`cryptoAddress`': 'crypto_address',
  '`preColLim`': 'pre_col_lim',
  '`preColUp`': 'pre_col_up',
  '`ownColLim`': 'own_col_lim',
  '`ownColUp`': 'own_col_up',
  '`ownWdLim`': 'own_wd_lim',
  '`ownWdUp`': 'own_wd_up',
  '`paymentMethod`': 'payment_method',
  '`startDateThisRound`': 'start_date',
  '`endDateThisRound`': 'end_date',
  '`paymentstatus`': 'payment_status',
  '`purchaseType`': 'purchase_type',
  '`platformCut`': 'platform_cut',
  '`sellerCut`': 'seller_cut',
  '`txAddress`': 'tx_address',
  '`stripe`': 'stripe_id',
  '`unlockType`': 'unlock_type',
  '`expiresAt`': 'expires_at',
};

for (const line of lines) {
  if (line.startsWith('INSERT INTO')) {
    let insert = line;
    // Replace table names
    for (const [mysql, d1] of Object.entries(tableMap)) {
      insert = insert.replace(new RegExp(mysql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), d1);
    }
    // Replace column names
    for (const [mysql, d1] of Object.entries(colMap)) {
      insert = insert.split(mysql).join(d1);
    }
    // Remove backticks from column names (D1 doesn't need them for valid names)
    insert = insert.replace(/`([a-z_]+)`/g, '$1');
    // Escape single quotes for SQLite
    insert = insert.replace(/'/g, "''");
    // But don't double-escape already doubled ones
    insert = insert.replace(/''''/g, "''");
    outLines.push(insert);
  }
}

fs.writeFileSync('/tmp/d1_migration.sql', outLines.join('\n'));
console.log(`Generated ${outLines.length} INSERT statements`);
