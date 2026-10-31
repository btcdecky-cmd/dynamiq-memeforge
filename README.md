# DYNamiQ MemeForge

Solana advertising desk for token projects. Verify a mint, make a creative, submit a campaign, and serve it on DYNamiQ plus approved partner sites.

This version does **not** take payments, escrow funds, launch tokens, or swap. Ads are not placed on every Solana marketplace.

## What is on-chain vs off-chain

| Data | Where it comes from |
| --- | --- |
| Mint supply, decimals, authorities | Mainnet Solana RPC (`getAccountInfo`) |
| Price, liquidity, volume, name/symbol | DexScreener, only when a Solana pair exists. Missing means unknown, not zero |
| Trend list | DexScreener token boosts, Solana rows only. Not social listening |
| Impressions and clicks | Rows written when a slot loads or a click is recorded |
| Campaign registry proof | SPL Memo transaction on **mainnet or devnet**, verified by fetching the signature on that cluster |

The Anchor program in `programs/memeforge-registry` stores the advertiser, campaign id, mint, creative hash, and status. Media stays off-chain. The program id in `declare_id!` is a placeholder pubkey. It is **not** deployed, and the matching keypair is not in this repo. Replace it with `anchor keys sync` before any deploy. The live proof is the SPL Memo flow below, on the cluster the advertiser chose.

## Product flow

1. Sign in (Google or X).
2. Verify a mint. The first signed-in person can claim operator if none exists.
3. Save a poster or copy in the studio.
4. Create a draft campaign. The mint must already have been read.
5. Submit it. The operator marks it `live`, which approves the creative.
6. Open Network and record a property impression, or activate a partner key and embed `widget.js`.
7. Optionally connect a wallet, choose **mainnet** or **devnet**, prepare the memo, sign, and verify. That badge is separate from ad eligibility. A mainnet memo spends a small SOL network fee. DYNamiQ does not collect it.

## Partner API

```
GET /api/network/ads?slot=banner&record=1
x-dynamiq-key: dq_...

GET /api/network/click?surface=partner&campaign=dq_...&key=dq_...&slot=banner
```

Property traffic (this site only) uses `/api/network/property` and does not accept cross-origin reads.

```html
<script src="https://YOUR_HOST/widget.js" data-key="dq_..." data-slot="banner" async></script>
```

## Memo registration

Payload shape:

```
DYNAMIQ|v1|id=...|mint=...|creative=...|owner=...|state=...
```

Program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`. The wallet must be on the same cluster you prepared. Verification reads mainnet via `https://api.mainnet-beta.solana.com` (fallback `https://solana-rpc.publicnode.com`) or devnet via `https://api.devnet.solana.com`. A signature from the other cluster does not verify.

## Deploying the Anchor program later

```bash
# install Anchor 0.31 and the Solana CLI, then replace declare_id
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet
```

Do not ship the placeholder program id.

## Stack note

The running app is TanStack Start + TypeScript on the Grok app runtime (Postgres, Better Auth). That is the deployable app. Supabase and Next.js are not used here because this environment provisions Postgres and Google/X sign-in directly.
