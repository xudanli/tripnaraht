# ROLL Bridge Contract (v1)

This document defines the minimum request/response contract between:

- `RollClientService` (Nest)
- `bridge_service.py` (Python)
- Ray workers (`ActorWorker`, `RewardWorker`, `PolicyWorker`)

## Common Response Envelope

All bridge endpoints should return:

```json
{
  "success": true,
  "error_code": null,
  "error": null,
  "request_id": "optional-request-id"
}
```

Failure example:

```json
{
  "success": false,
  "error_code": "WORKER_UNAVAILABLE",
  "error": "policy worker is not available",
  "request_id": "req_123"
}
```

## Endpoints

### POST /api/actor/generate-trajectory

Request:

```json
{
  "request_id": "req_123",
  "user_request": "plan a trip",
  "state": {},
  "action": "PLAN_GEN",
  "params": {},
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Success response:

```json
{
  "success": true,
  "trajectory_id": "traj_123",
  "trajectory_ref": "ray-object-ref",
  "trajectory": {}
}
```

### POST /api/reward/compute

Request:

```json
{
  "trajectory": {},
  "reward_config": {}
}
```

Success response:

```json
{
  "success": true,
  "reward": 0.8,
  "raw_reward": 0.8,
  "reward_breakdown": []
}
```

### POST /api/policy/predict

Request:

```json
{
  "userRequest": "Plan family trip",
  "origin": "SHA",
  "destination": "BKK",
  "constraints": {},
  "preferences": {}
}
```

Success response:

```json
{
  "success": true,
  "action": "ALLOW",
  "confidence": 0.9,
  "reasoning": "..."
}
```

## Error Codes

- `TIMEOUT`: bridge request timed out
- `HTTP_4XX`: client-side request issue
- `HTTP_5XX`: bridge internal failure
- `WORKER_UNAVAILABLE`: worker not registered / unavailable
- `CONTRACT_VIOLATION`: response payload missing required fields
- `UNKNOWN`: uncategorized error

## Operational Rule

- `staging/prod` must run with `ROLL_STRICT_MODE=true`.
- `staging/prod` must not emit simulation responses.
