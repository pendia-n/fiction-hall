# Fiction Hall Arbitrum contract V1

Non-upgradeable Arbitrum One checkout for USDC, USDT, and DAI. `splitA` is the rental rule (15% platform), `splitB` is permanent access (30% platform). All eight percentages, all token/feed addresses, the platform treasury, and the quote signer are supplied when deploying; none can be changed afterward.

The contract calculates the stablecoin amount from a signed USD quote and an on-chain USD feed, checks the payer's balance and allowance, then atomically sends the writer and platform shares. It does not intentionally custody the full payment.

```sh
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 foundry-rs/forge-std --no-git
cp .env.example .env
forge test
source .env
forge script script/DeployFictionHallCryptoSplitV1.s.sol:DeployFictionHallCryptoSplitV1 --rpc-url arbitrum --broadcast --verify
```

Set `CRYPTO_SPLIT_CONTRACT`, `CRYPTO_QUOTE_PRIVATE_KEY`, `CRYPTO_USDC_ADDRESS`, `CRYPTO_USDT_ADDRESS`, `CRYPTO_DAI_ADDRESS`, and optionally `ARBITRUM_RPC_URL` on the Worker after deployment. The address represented by `CRYPTO_QUOTE_PRIVATE_KEY` must equal `QUOTE_SIGNER`.

This payment contract is unaudited. Do not use production funds before an independent smart-contract and tax/legal review.
