# Nexus Anchor Program

## Program ID

`5twpBNVkDu9YkuQ2aDRWTB1wvA4wjBu42Q42kn7Fy2G5`

## PDA Seeds

| Account | Seeds |
| --- | --- |
| `AgentProfile` | `"profile"`, `owner` |
| `PolicyVault` | `"policy"`, `owner` |
| `ExecutionReceipt` | `"receipt"`, `owner`, `receipt_id` as 8-byte little-endian `u64` |

## Devnet Deploy

```bash
anchor deploy --provider.cluster devnet
```

## Testing Notes

- Integration tests in `tests/onchain.ts` fund test keypairs with `requestAirdrop` and explicit `confirmTransaction` calls in the `before` hook.
- Run tests against a local validator whenever possible (`anchor test` / `solana-test-validator`) to avoid faucet limits and cluster-rate variability.
- TS integration test currently validates non-reset path deterministically.
- reset branch is validated by Rust unit tests in `policy_math`.
