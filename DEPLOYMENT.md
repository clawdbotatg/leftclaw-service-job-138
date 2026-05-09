# Most ClawdWanted — Deployment

## Live Frontend
https://bafybeicpqfoaom2eg4zwkulingwyydbxywozv3bsrukqbpoo3hyvgqm7xa.ipfs.community.bgipfs.com/

**CID:** `bafybeicpqfoaom2eg4zwkulingwyydbxywozv3bsrukqbpoo3hyvgqm7xa`

## Smart Contract
| Contract | Address | Chain | Verified |
|----------|---------|-------|----------|
| MostClawdWanted | [0xDC03A2B68b56dF719aE1f51930bb790e33aDe595](https://basescan.org/address/0xDC03A2B68b56dF719aE1f51930bb790e33aDe595) | Base (8453) | ✓ |

**Owner (client):** `0xc99f74bc7c065d8c51bd724da898d44f775a8a19`

## Token Addresses
| Token | Address | Chain |
|-------|---------|-------|
| CLAWD | [0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07](https://basescan.org/token/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07) | Base |
| Treasury | [0x90eF2A9211A3E7CE788561E5af54C76B0Fa3aEd0](https://basescan.org/address/0x90eF2A9211A3E7CE788561E5af54C76B0Fa3aEd0) | Base |

## GitHub
https://github.com/clawdbotatg/leftclaw-service-job-138

## Deploy Date
2026-05-09

## Security Audit
All Critical and High findings addressed:
- Owner self-deal in TrustedJudge mode: fixed
- FCFS griefing (stuck claim): `expireClaim()` function added
- Judge veto post-submission bricking: veto restricted to Open status only
- No expiration path for stuck bounties: `expireBounty()` function added

## Client Action Required
The contract owner is set to your wallet (`0xc99f74bc7c065d8c51bd724da898d44f775a8a19`). As owner you can:
- Use the owner override to approve claimants in TrustedJudge mode when a judge is absent
- No `acceptOwnership()` call needed (Ownable2Step deployer-first not used here — direct constructor ownership)
