# Incident Response Plan

## Severity Levels

| Level | Name | Description | Response Time | Notification |
|-------|------|-------------|---------------|-------------|
| **P0** | Critical | Key share compromise, signing node breach, TSS protocol failure | 15 min | Page on-call, war room |
| **P1** | High | Auth bypass, API key leak, data exfiltration | 30 min | Page on-call |
| **P2** | Medium | Service degradation, partial outage, elevated error rate | 2 hours | Slack channel |
| **P3** | Low | Non-critical bug, minor UI issue | 24 hours | Ticket |
| **P4** | Info | Cosmetic, documentation, feature request | Next sprint | Backlog |

## Response Playbooks

### P0: Key Share Compromise

1. **Detect:** Alert from KMS access logs, unauthorized signing attempt, or audit notification
2. **Contain (15 min):**
   - Rotate the compromised KMS key immediately
   - Invalidate all session keys using the compromised share
   - Disable the affected wallet's signing capability
   - Block the affected API key temporarily
3. **Investigate (1 hour):**
   - Audit KMS access logs for the compromised key
   - Review all transactions signed with the affected wallet
   - Determine scope: single wallet or systemic?
   - Check for lateral movement
4. **Remediate (2 hours):**
   - If single wallet: initiate key re-share ceremony for affected wallet
   - If systemic: rotate all KMS keys, re-share all wallets
   - Notify affected users
5. **Recover (24 hours):**
   - Full security review of access patterns
   - Update threat model if new attack vector discovered
   - Enhance monitoring rules

### P1: Service Outage / DDoS

1. **Detect:** Grafana alert, PagerDuty page, user reports
2. **Mitigate (5 min):**
   - Enable Cloudflare "Under Attack" mode
   - Scale up K8s replicas via HPA
   - Rate-limit aggressively at CDN layer
3. **Investigate (30 min):**
   - Check Cloudflare WAF logs for attack pattern
   - Review K8s node/pod metrics
   - Identify attack vector
4. **Recover (1 hour):**
   - Block offending IPs/IP ranges at WAF
   - Tune rate limiting rules
   - Deploy additional nodes if needed

### P1: Auth Bypass

1. **Detect:** Suspicious login patterns, Grafana anomaly alert
2. **Contain (15 min):**
   - Invalidate all active sessions
   - Rotate JWT signing keys
   - Block affected auth provider temporarily if needed
3. **Investigate (1 hour):**
   - Audit auth logs for unusual patterns
   - Check Clerk webhook logs
   - Review recent API key usage
4. **Recover (2 hours):**
   - Deploy auth fix
   - Force re-authentication for all users
   - Post public incident notice

### P2: Elevated Error Rate

1. **Detect:** Sentry spike, Grafana error rate > 5%
2. **Investigate (30 min):**
   - Check Sentry for top errors
   - Review recent deploys for regressions
   - Check downstream dependencies (Hiro API, Turnkey API)
3. **Remediate (1 hour):**
   - Rollback if deploy-related
   - Circuit-break downstream dependencies if needed
   - Deploy hotfix

## Communication Templates

### Customer Notification (P0/P1)

```
Subject: [VelumX] Security Incident Notification — [Date]

Dear [Name],

We are writing to inform you of a security incident affecting VelumX MPC.

What happened: [Brief description]
What we're doing: [Containment steps]
Impact to you: [Specific impact to their org]
What you need to do: [Action items, if any]

We will update you within [timeframe] as more information becomes available.

If you have questions, contact security@velumx.xyz.

— VelumX Security Team
```

### Public Disclosure (P0)

```
Title: Security Post-Mortem — [Date]

Summary:
- Timeline of events
- Root cause analysis
- Impact assessment
- Remediation steps taken
- Prevention measures implemented
- Third-party audit confirmation

Published at: velumx.xyz/security/incidents/[date]
```

## Post-Mortem Template

```markdown
# Incident Post-Mortem: [Title]

## Timeline (UTC)
- HH:MM — Detection (how detected)
- HH:MM — Response started
- HH:MM — Containment achieved
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Service restored

## Impact
- Duration: X hours, Y minutes
- Affected users: N
- Transactions affected: N
- Data compromised: None / [details]

## Root Cause
[Detailed technical explanation]

## What Went Well
- [Detection method worked]
- [Team responded within SLA]

## What Could Be Better
- [Gap identified]
- [Alerting improvement]

## Action Items
- [ ] [Owner] [Action] [Due date]
```

## Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Security Lead | — | — | security@velumx.xyz |
| Engineering Lead | — | — | eng@velumx.xyz |
| On-Call (Primary) | Rotation | PagerDuty | — |
| On-Call (Secondary) | Rotation | PagerDuty | — |
