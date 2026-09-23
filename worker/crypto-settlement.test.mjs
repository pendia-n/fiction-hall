import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPayment } from './crypto-settlement.ts';

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
