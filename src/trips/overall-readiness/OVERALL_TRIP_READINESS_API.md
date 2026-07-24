# 整体准备度 Overall Trip Readiness API

> **版本**: 0.3.0  
> **Base**: `/api/trips/:tripId`  
> **状态**: 已实现 · 可前端联调  
> **FE 改造清单**: [OVERALL_TRIP_READINESS_FE_HANDOFF.md](./OVERALL_TRIP_READINESS_FE_HANDOFF.md)  
> **产品**: [OVERALL_TRIP_READINESS.md](../../../internal-docs/product/OVERALL_TRIP_READINESS.md)

**最后更新**: 2026-07-15

---

## 1. 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/trips/:id/timeline-overview?preset=shell` | 含 `overallReadiness` 卡片 |
| GET | `/trips/:id/overall-readiness` | 完整报告（含 `homepage` / `evidence`） |
| GET | `/trips/:id/overall-readiness?view=card` | 仅卡片投影 |

列表：`listSummary.readinessScore` / `readinessState` / `readinessStateLabelZh`（来自缓存；DecisionCase apply 后缓存清除）。

---

## 2. 卡片字段（timeline-overview）

```typescript
overallReadiness: {
  score: number;
  state: string;
  stateLabelZh: string;      // 细：接近就绪
  displayLabelZh: string;    // 主：尚未就绪 / 已准备好 / 已阻塞
  headline: string;          // 整体准备度 78% · 尚未就绪
  evidenceConfidence: number;
  blockerCount: number;
  pendingConfirmationCount: number;
  whyNotReady?: string;
  potentialScoreLift?: number;
  dimensions: Array<{ code; labelZh; score }>;
  topPriority?: { title; actionCode?; estimatedScoreLift? };
  reportDeepLink: string;
}
```

---

## 3. 报告 homepage

```typescript
homepage: {
  headline: string;
  whyNotReady: string[];
  mustHandleNow: Array<{ title; actionCode?; estimatedScoreLift? }>;
  canHandleLater: Array<{ title; actionCode?; estimatedScoreLift? }>;
  potentialScoreLift: number;
  dimensionRows: Array<{ code; labelZh; score; state; primaryIssue? }>;
}
```

---

## 4. Client

```typescript
import { tripTimelineApi, tripOverallReadinessApi } from '@/api/trip-detail-tab-client';

await tripTimelineApi.getShellOverview(tripId);
await tripOverallReadinessApi.getReport(tripId);
await tripOverallReadinessApi.getCard(tripId);
```
