# Alertmanager -> GitHub Repository Dispatch

This guide shows how to trigger `roll-auto-rollback.yml` from monitoring alerts.

## 1) GitHub API Endpoint

```text
POST https://api.github.com/repos/<owner>/<repo>/dispatches
Authorization: Bearer <GITHUB_TOKEN>
Accept: application/vnd.github+json
```

Payload shape:

```json
{
  "event_type": "roll_auto_rollback",
  "client_payload": {
    "current_model_version": "v-canary-20260326",
    "previous_model_version": "v-stable-20260320",
    "fallback_rate": 0.041,
    "error_rate": 0.012,
    "simulation_rate": 0.0,
    "trigger_reason": "fallback spike detected by monitoring"
  }
}
```

Sample payload file:

- `scripts/rl-infra/roll/sample-roll-auto-rollback-payload.json`

## 2) Direct curl Trigger

```bash
curl -X POST "https://api.github.com/repos/<owner>/<repo>/dispatches" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d @scripts/rl-infra/roll/sample-roll-auto-rollback-payload.json
```

## 3) Alertmanager Integration Pattern

Alertmanager usually sends webhooks to an internal relay.  
The relay converts alert payload into the repository dispatch payload.

Recommended mapping:

- `current_model_version` <- canary version label in alert
- `previous_model_version` <- stable version from release metadata
- `fallback_rate` <- alert annotation value
- `error_rate` <- alert annotation value
- `simulation_rate` <- alert annotation value
- `trigger_reason` <- alert summary + fingerprint

## 4) Security Recommendations

- Use a GitHub token with minimum required repo scope.
- Store token in secrets manager; never hard-code.
- Restrict relay endpoint by IP allowlist and signature check.
- Add idempotency guard in relay to avoid duplicate rollback storms.

## 5) Operational Guardrails

- Add cool-down window (e.g. 10 minutes) after each rollback trigger.
- Require at least one critical condition for N consecutive evaluation windows.
- Keep manual `workflow_dispatch` as fallback for operator override.
