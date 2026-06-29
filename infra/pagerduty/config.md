# PagerDuty On-Call Configuration

## Rotations

### Primary On-Call
- **Schedule:** Weekly rotation (Monday 9 AM UTC → Monday 9 AM UTC)
- **Team:** 2 engineers per shift
- **Handoff:** Slack `#oncall` channel + PagerDuty handoff note

### Secondary On-Call
- Backs up primary if unacknowledged within 5 minutes
- Same rotation, staggered by 1 day

## Alert Severity Mapping

| Severity | Alert Source | PagerDuty Level | Response SLA |
|----------|-------------|-----------------|-------------|
| P0 | Grafana: `velumx_mpc_error_rate > 10%` OR `health_check_failed` | Critical — Immediate Page | 15 min |
| P1 | Grafana: `velumx_api_error_rate > 5%` | High — Page | 30 min |
| P2 | Grafana: `velumx_api_latency_p95 > 5s` | Medium — Notify | 2 hours |
| P3 | Sentry: new unhandled exception spike | Low — Ticket | 24 hours |

## Escalation Policy

```
Level 1: Primary On-Call (2 engineers)
  → No ack within 5 minutes
Level 2: Secondary On-Call (2 engineers)
  → No ack within 10 minutes
Level 3: Engineering Manager
  → No ack within 15 minutes
Level 4: VP Engineering / CTO
```

## Services

| Service | Integration | Escalation Policy |
|---------|------------|-------------------|
| VelumX API | Grafana → PagerDuty webhook | Level 1-4 |
| VelumX MPC | Grafana → PagerDuty webhook | Level 1-4 |
| VelumX Dashboard | Sentry → PagerDuty integration | Level 2-4 |
| Infrastructure | Grafana → PagerDuty webhook | Level 1-4 |

## Alert Sources

1. **Grafana Alerts** → PagerDuty Webhook V3
2. **Sentry Critical Events** → PagerDuty Integration
3. **Uptime Monitor** (Synthetic checks) → PagerDuty via email
