# Action Execution Runbook

## Scope

This runbook describes the execution flow for `POST /agent/actions/*` APIs:

- `POST /agent/actions/preview`
- `POST /agent/actions/commit`
- `POST /agent/actions/rollback`

These APIs are the Action-layer bridge for TripNARA decision-to-execution workflows.

## Auth Boundary

- `agent/actions` endpoints are bearer-auth endpoints (`@ApiBearerAuth()`).
- Do not mark these endpoints as `@Public` in production.

## API Behavior

### Preview

- Accepts `actions` or `action_plan` (`actions` takes precedence).
- Applies confirmation policy by `execution_mode`:
  - `ADVICE_ONLY`: all actions require confirmation
  - `SEMI_AUTO`: `LOW` risk does not require confirmation
  - `AUTO`: only `HIGH` risk requires confirmation
- Returns:
  - `accepted_actions`
  - `requires_confirmation_count`
  - `high_risk_count`

### Commit

- Supports idempotent dedup by:
  - `idempotency_key` (preferred)
  - fallback to `request_id`
- If `HIGH` risk actions require confirmation and no `confirmation_token` is provided:
  - returns `PARTIAL`
  - includes `blocked_actions`
  - includes `rejected_reason_codes`
- Current implementation is a safe stub (no external side effects).

### Rollback

- Accepts action ids and returns acknowledged rollback response.
- Current implementation is a safe stub (no external side effects).

## Rejection Reason Codes

- `HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN`
- `UNSUPPORTED_ACTION_MAPPING`
- `ACTION_NOT_REGISTERED`
- `ACTION_EXECUTION_FAILED`
- `ACTION_PRECONDITION_FAILED`
- `BOOK_ADD_MISSING_REQUIRED_FIELDS`

Defined in:

- `src/agent/constants/action-execution.constants.ts`

## Troubleshooting by Reason Code

- `HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN`
  - Verify client passed `confirmation_token` in commit request.
  - Confirm `requires_confirmation=true` was expected from preview policy.
- `UNSUPPORTED_ACTION_MAPPING`
  - Check `action_type + target_type` mapping in `ActionExecutionService.mapActionName()`.
  - Prefer explicit `action_name` when mapping is ambiguous.
- `ACTION_NOT_REGISTERED`
  - Ensure `AgentModule` registered corresponding action in `ActionRegistryService`.
- `ACTION_PRECONDITION_FAILED`
  - Check precondition fields in Action metadata and commit state payload (e.g. `trip.trip_id`).
- `ACTION_EXECUTION_FAILED`
  - Inspect action runtime logs and underlying service errors.
- `BOOK_ADD_MISSING_REQUIRED_FIELDS`
  - For `BOOK + ACTIVITY/ITINERARY`, provide `placeId`, `tripDayId`, `startTime`, `endTime`.

## Observability Suggestions

- Track `status` distribution: `OK` / `PARTIAL` / `FAILED`
- Track `rejected_reason_codes` frequency
- Track dedup hit ratio by `idempotency_key`
- Track API-level action telemetry events (`action_api=preview|commit|rollback`)

## Safety Notes

- Keep high-risk actions behind explicit confirmation token checks.
- Do not execute external write side effects in this layer without audit trail and rollback hooks.
