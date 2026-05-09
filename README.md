# Most ClawdWanted

A CLAWD-only crowdfunded bounty platform on Base. "The community's most wanted list."

## Deployed Contracts

| Contract | Address | Chain |
|----------|---------|-------|
| MostClawdWanted | [0xDC03A2B68b56dF719aE1f51930bb790e33aDe595](https://basescan.org/address/0xDC03A2B68b56dF719aE1f51930bb790e33aDe595) | Base |

## CLAWD Token
[0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07](https://basescan.org/token/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07)

## Local Development

```bash
yarn install
yarn start
```

The frontend is in `packages/nextjs`. The contracts live in `packages/foundry`.

### Frontend

```bash
cd packages/nextjs
yarn build   # static export to ./out
yarn dev     # local dev server
```

### Contracts

The deployed contract ABI is checked in at `packages/nextjs/contracts/deployedContracts.ts`. The CLAWD ERC-20 ABI is in `packages/nextjs/contracts/externalContracts.ts`.

## Pages

- `/` — The Wanted List (sorted by reward)
- `/bounty/<id>` — Wanted Poster / pledge + claim
- `/create` — Put a Contract Out (create bounty)
- `/code` — The Code (rules of the platform)
- `/rap-sheet` — your on-chain activity
