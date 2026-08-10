/**
 * Activity Direct — Browserbase 活动预订专用工具
 *
 * ## 能力
 * - MCP：`activity.search`（dispatcher / registry）
 * - Live sensor：`live_tool.mcp.activity`（提前预订咨询自动触发）
 * - HTTP：`/api/activity-direct/search|catalog|health`
 * - Chat：结果 → `activity_booking_cards`（可跳转 CTA）
 *
 * ## 流程
 * 1. 按 query 匹配冰岛硬预约目录（蓝湖 / 冰川徒步 / 冰河湖船游 / 超级吉普）
 * 2. Browserbase：`createSession` → `navigate` → `evaluate`（Stagehand extract）抽 title/price/bookingUrl
 * 3. 失败或 `ACTIVITY_BOOKING_BROWSERBASE=0` → 静态目录 URL 回落
 *
 * ## 环境变量
 * | Var | 含义 |
 * |---|---|
 * | `BROWSERBASE_*` / `SMITHERY_API_KEY` | 底层 Browserbase MCP |
 * | `ACTIVITY_BOOKING_BROWSERBASE=0` | 强制目录模式 |
 * | `ACTIVITY_BROWSERBASE_MS` | 探页总预算（默认 28000） |
 * | `LIVE_TOOL_ACTIVITY_MS` | live sensor 超时（默认 32000） |
 *
 * ## 安全
 * 只读抽取，不自动填表下单。
 */

export {};
