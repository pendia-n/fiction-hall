import fs from 'fs';

const dump = fs.readFileSync('/tmp/anecdote_dump.sql', 'utf8');
const lines = dump.split('\n');
let currentTable = '';
let outLines: string[] = [];

for (const line of lines) {
  // Track current table from CREATE
  const createMatch = line.match(/CREATE TABLE `?(\w+)`?/);
  if (createMatch) currentTable = createMatch[1];

  // Convert MySQL INSERT to D1 INSERT
  if (line.startsWith('INSERT INTO')) {
    // Map MySQL table names to D1 table names
    const tableMap: Record<string, string> = {
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

    let insert = line;
    // Replace MySQL table name
    for (const [mysql, d1] of Object.entries(tableMap)) {
      insert = insert.replace(new RegExp(`\\b${mysql}\\b`, 'g'), d1);
    }

    // MySQL column names to D1 column names (camelCase to snake_case)
    const colMap: Record<string, string> = {
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
      '`startDateThisRound`': 'start_date',
      '`endDateThisRound`': 'end_date',
      '`purchaseType`': 'purchase_type',
      '`platformCut`': 'platform_cut',
      '`sellerCut`': 'seller_cut',
      '`txAddress`': 'tx_address',
      '`stripe`': 'stripe_id',
      '`unlockType`': 'unlock_type',
      '`expiresAt`': 'expires_at',
    };

    // Fix BOOLEAN values (MySQL uses 0/1 for tinyint, D1 expects the same)
    // Replace column names
    for (const [mysql, d1] of Object.entries(colMap)) {
      insert = insert.split(mysql).join(d1);
    }

    // Fix datetime format - MySQL has datetime(3) with milliseconds
    // D1 uses text format, so we can keep them as-is

    // Fix NULL handling
    insert = insert.replace(/`([^`]+)`/g, (match, col) => {
      // Check if this column name exists in our map
      return colMap[`\`${col}\``] ? `\`${colMap[`\`${col}\``]}\`` : match;
    });

    outLines.push(insert);
  }
}

fs.writeFileSync('/tmp/d1_migration.sql', outLines.join('\n'));
console.log(`Generated ${outLines.length} INSERT statements`);
