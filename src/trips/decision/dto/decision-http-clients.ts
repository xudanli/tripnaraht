/**
 * 决策相关 HTTP 客户端统一入口（浏览器 `fetch`）。
 *
 * | 导出 | 基础路径 | 说明 |
 * |------|----------|------|
 * | 顶层（`export *`） | `/api/decision-engine/v1/*` | 与 `decision-engine-api-client.ts` 一致：`generatePlan`、`repairPlan`、`checkConstraints` 等 |
 * | `decisionRestApi` | `/api/decision/*` | `decision-api-client.ts`：`detectConflicts`、`computeDailyUtility`、`generateMultiplePlansDecision` 等 |
 *
 * @example
 * ```ts
 * import { generatePlan, repairPlan, decisionRestApi } from './decision-http-clients';
 * await generatePlan({ state: {}, tripId: '...' });
 * await decisionRestApi.detectConflicts({ constraints: {} });
 * ```
 */

export type { DecisionApiResponse } from './decision-api-client';

export * from './decision-engine-api-client';

export * as decisionRestApi from './decision-api-client';
