# Security Audit Preparation

## Audit Scope

### Auth Service
- OAuth 2.0 / OIDC flows (Clerk, custom providers)
- JWT issuance, validation, and rotation
- Session management (refresh tokens, revocation)
- API key authentication (`x-api-key` header, SHA-256 hashing, constant-time comparison)

### MPC Service (apps/mpc)
- Threshold Signature Scheme (TSS) protocol — 2-of-3 DKG + signing
- Key share generation, encryption, and distribution
- Key share storage (KMS-encrypted at rest, TLS in transit)
- Peer authentication and secure WebSocket messaging
- BIP32 wallet derivation and address generation

### API Service (apps/api)
- Authentication and authorization (`ApiKeyGuard`)
- Rate limiting and abuse prevention
- Input validation (ValidationPipe, DTO constraints)
- Database access (Prisma parameterized queries — verify no raw SQL injection)
- Session key delegation verification

## Recommended Audit Firms

| Firm | Specialization | Link |
|------|---------------|------|
| Trail of Bits | MPC, cryptography, blockchain | trailofbits.com |
| Halborn | Web3, smart contracts, custody | halborn.com |
| Zellic | MPC, ZK, blockchain protocols | zellic.io |
| Ottersec | Solana/Stacks, custody | osec.io |

## Pre-Audit Checklist

- [ ] Document all cryptographic primitives and their implementations
- [ ] Define trust assumptions for each component
- [ ] Map data flow for key material (generation → encryption → storage → usage → destruction)
- [ ] List all external dependencies and their versions
- [ ] Document threat model (see pentest/threat-model.md)
- [ ] Prepare test environment with realistic data for auditors
- [ ] Define acceptance criteria for findings:
  - **Critical**: Must fix before production launch
  - **High**: Fix within 7 days
  - **Medium**: Fix within 30 days
  - **Low/Info**: Address in next sprint

## Audit Deliverables

1. Audit report with categorized findings
2. Remediation tickets for each finding
3. Re-test of fixes (1 round included)
4. Public attestation letter (for publishing)

## Timeline

```
Week 1-2: Procurement (contact firms, get quotes, sign SOW)
Week 3-4: Audit kickoff + testing (runs in parallel with dev)
Week 5:   Triage + remediation
Week 6:   Re-test + final report
Week 7:   Publish report at velumx.xyz/security
```
