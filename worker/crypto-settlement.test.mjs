import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from 'viem';
import { detectPayment, PAYMENT_EVENT, settleCrypto } from './crypto-settlement.ts';

test('verified crypto settlement saves exact payer, identities, token split and block UTC time atomically', async () => {
  const contract = `0x${'a'.repeat(40)}`;
  const payer = `0x${'b'.repeat(40)}`;
  const writer = `0x${'c'.repeat(40)}`;
  const token = `0x${'d'.repeat(40)}`;
  const quote = {
    id: 'quote-3', order_id: `0x${'1'.repeat(64)}`, item_id: `0x${'2'.repeat(64)}`,
    reader_ref: `0x${'3'.repeat(64)}`, user_id: 7, writer_id: 8, story_id: 31,
    writer_wallet: writer, token_symbol: 'USDT', token_address: token, token_decimals: 6,
    token_amount: '10000000', usd_amount_e6: '10000000', split_id: 0, unlock_type: 'TIME_LIMITED',
  };
  const log = {
    address: contract,
    topics: encodeEventTopics({ abi: PAYMENT_EVENT, eventName: 'CryptoCustomPurchase', args: {
      orderId: quote.order_id, itemId: quote.item_id, readerRef: quote.reader_ref,
    } }),
    data: encodeAbiParameters(parseAbiParameters('address payer, address writer, address token, uint8 splitId, uint256 tokenAmount, uint256 platformAmount'),
      [payer, writer, token, 0, 10000000n, 1500000n]),
  };
  let statements;
  const db = {
    prepare: sql => ({ bind: (...values) => ({ sql, values, all: async () => ({ results: [
      { id: 7, username: 'reader' }, { id: 8, username: 'author' },
    ] }) }) }),
    batch: async batch => { statements = batch; },
  };

  await settleCrypto(db, quote, `0x${'4'.repeat(64)}`, 1_800_000_000, 123n, log);

  const record = statements.find(statement => statement.sql.includes('INSERT INTO crypto_payment_receipt'));
  assert.ok(record);
  assert.deepEqual(record.values.slice(0, 13), [
    'quote-3', `0x${'4'.repeat(64)}`, '123', new Date(1_800_000_000_000).toISOString(),
    7, 'reader', payer, 8, 'author', writer, 'USDT0', token, 6,
  ]);
  assert.deepEqual(record.values.slice(13), ['10000000', '8500000', '1500000', '10000000']);
  assert.equal(statements.length, 4);
});

test('crypto status scans within the Alchemy Free tier 10-block limit', async () => {
  const ranges = [];
  const writes = [];
  const client = {
    getBlock: async () => ({ number: 1035n, timestamp: 1_800_000_000n }),
    getLogs: async ({ fromBlock, toBlock }) => {
      ranges.push([fromBlock, toBlock]);
      if (toBlock - fromBlock + 1n > 10n) throw new Error('eth_getLogs range exceeds Free tier limit');
      return [];
    },
  };
  const db = {
    prepare: () => ({ bind: (...args) => ({ run: async () => { writes.push(args); } }) }),
  };
  const quote = { id: 'quote-1', order_id: `0x${'1'.repeat(64)}`, story_id: 31, status: 'pending', scan_block: '1000', deadline: 1_900_000_000 };

  const result = await detectPayment(db, client, `0x${'2'.repeat(40)}`, quote);

  assert.equal(result.status, 'pending');
  assert.equal(result.acceptingPayment, true);
  assert.deepEqual(ranges, [[1000n, 1009n], [1010n, 1019n], [1020n, 1029n], [1030n, 1035n]]);
  assert.equal(writes[0][0], '1027');
});

test('an expired quote stays under reconciliation but stops accepting payment', async () => {
  const client = {
    getBlock: async () => ({ number: 1100n, timestamp: 2000n }),
    getLogs: async () => [],
  };
  const db = {
    prepare: () => ({ bind: () => ({ run: async () => {} }) }),
  };
  const quote = { id: 'quote-2', order_id: `0x${'3'.repeat(64)}`, story_id: 31, status: 'pending', scan_block: '1000', deadline: 1000 };

  const result = await detectPayment(db, client, `0x${'2'.repeat(40)}`, quote);

  assert.equal(result.status, 'pending');
  assert.equal(result.acceptingPayment, false);
});
