import { decodeEventLog, parseAbi } from 'viem';

export const PAYMENT_EVENT = parseAbi(['event CryptoCustomPurchase(bytes32 indexed orderId, bytes32 indexed itemId, bytes32 indexed readerRef, address payer, address writer, address token, uint8 splitId, uint256 tokenAmount, uint256 platformAmount)']);

export function matchesPayment(quote: any, log: any, contract: string): boolean {
  try {
    if (log.removed || log.address.toLowerCase() !== contract.toLowerCase()) return false;
    const { args: a } = decodeEventLog({ abi: PAYMENT_EVENT, data: log.data, topics: log.topics });
    const pairs = [[a.orderId, quote.order_id], [a.itemId, quote.item_id], [a.readerRef, quote.reader_ref], [a.writer, quote.writer_wallet], [a.token, quote.token_address]];
    const amount = BigInt(quote.token_amount);
    return pairs.every(([x, y]) => String(x).toLowerCase() === String(y).toLowerCase())
      && Number(a.splitId) === Number(quote.split_id)
      && a.tokenAmount === amount
      && a.platformAmount === amount * (Number(quote.split_id) === 0 ? 1500n : 2000n) / 10000n;
  } catch { return false; }
}

// Shared by card and crypto payments. A later rental cannot overwrite permanent access.
export const GRANT_ACCESS_SQL = `INSERT INTO story_unlock (user_id, story_id, active, expires_at, unlock_type)
  VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id, story_id) DO UPDATE SET
  active = 1,
  expires_at = CASE WHEN story_unlock.unlock_type = 'PERM_UNLOCK' OR excluded.unlock_type = 'PERM_UNLOCK' THEN NULL
    ELSE MAX(COALESCE(story_unlock.expires_at, ''), excluded.expires_at) END,
  unlock_type = CASE WHEN story_unlock.unlock_type = 'PERM_UNLOCK' THEN 'PERM_UNLOCK' ELSE excluded.unlock_type END`;

export async function settleCrypto(db: any, quote: any, txHash: string, paidAt: number) {
  const expires = quote.unlock_type === 'TIME_LIMITED' ? new Date((paidAt + 365 * 86400) * 1000).toISOString() : null;
  const amount = Number(quote.usd_amount_e6) / 1e6;
  const cut = Number(quote.split_id) === 0 ? 0.15 : 0.20;
  // Atomic and retry-safe: receipt duplicates do not create duplicate purchases.
  await db.batch([
    db.prepare(GRANT_ACCESS_SQL).bind(quote.user_id, quote.story_id, expires, quote.unlock_type),
    db.prepare(`INSERT INTO purchase (user_id, status, story_id, amount, fmv, method, platform_cut, purchase_type, seller_cut, stripe_id)
      SELECT ?, 'completed', ?, ?, ?, 'crypto', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM purchase WHERE stripe_id = ?)`)
      .bind(quote.user_id, quote.story_id, amount, amount, amount * cut, quote.unlock_type, amount * (1 - cut), txHash, txHash),
    db.prepare(`UPDATE crypto_purchase_quote SET status = 'confirmed', tx_hash = ?, confirmed_at = datetime('now') WHERE id = ?`).bind(txHash, quote.id),
  ]);
}

export async function detectPayment(db: any, client: any, contract: `0x${string}`, quote: any) {
  if (quote.status === 'confirmed') return { status: 'confirmed', storyId: quote.story_id, txHash: quote.tx_hash };
  const head = await client.getBlock();
  const latest = BigInt(head.number);
  let cursor = quote.scan_block == null ? latest : BigInt(quote.scan_block);
  if (cursor > latest) cursor = latest;
  // Bound each request; save progress so catching up does not repeatedly scan old blocks.
  for (let batch = 0; batch < 4 && cursor <= latest; batch++) {
    // Alchemy's Free tier caps eth_getLogs at 10 blocks, inclusive.
    const end = cursor + 9n < latest ? cursor + 9n : latest;
    const logs = await client.getLogs({ address: contract, event: PAYMENT_EVENT[0], args: { orderId: quote.order_id }, fromBlock: cursor, toBlock: end });
    for (const log of logs) {
      if (!matchesPayment(quote, log, contract)) continue;
      const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
      if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== contract.toLowerCase()
        || !receipt.logs.some((l: any) => matchesPayment(quote, l, contract))) continue;
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      await settleCrypto(db, quote, log.transactionHash, Number(block.timestamp));
      return { status: 'confirmed', storyId: quote.story_id, txHash: log.transactionHash };
    }
    cursor = end + 1n;
  }
  // Keep a short overlap for delayed RPC indexing. Expiry uses chain time, not browser time.
  const caughtUp = cursor > latest;
  const expired = caughtUp && Number(head.timestamp) > Number(quote.deadline) + 60;
  await db.prepare(`UPDATE crypto_purchase_quote SET scan_block = ?, status = ? WHERE id = ? AND status != 'confirmed'`)
    .bind(String(caughtUp ? (latest > 8n ? latest - 8n : 0n) : cursor), expired ? 'expired' : 'pending', quote.id).run();
  return { status: expired ? 'expired' : 'pending', storyId: quote.story_id };
}
