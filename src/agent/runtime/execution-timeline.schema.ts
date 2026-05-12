// src/agent/runtime/execution-timeline.schema.ts
/**
 * Runtime ABI：timeline 契约版本；字段变更须 bump 并写 migration note。
 *
 * v1 → v2（2026-05）：事件增加 span 语义字段 `spanId` / `parentSpanId` / `operation`；
 * `nodeId` 保留作过渡期预览兼容，新写入应与 `spanId` 同值或逐步弃用。
 *
 * v2 → v3（2026-05）：语义 span 的 `outputPayload` 收紧——成功仅 `{ status, selectedRouteCount }`，
 * 失败仅 `{ status, errorType, retryable }`（不再把任意 detail 写入参与 hash 的 payload）；扩展字段走 `metadataSummary`。
 *
 * v3 → v4（2026-05）：`finishError` 在未传 `retryable` 时 `outputPayload` 不含 `retryable` 键（根 chain 等窄契约）。
 */
export const EXECUTION_TIMELINE_SCHEMA_ABI = 4 as const;
