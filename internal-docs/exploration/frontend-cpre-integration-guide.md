# CPRE 前端集成指南 — Canonical POI Resolution

**Audience:** 前端 `features/exploration` + 行程 POI 展示  
**Base URL:** `/api/poi`（独立 CPRE）+ `/api/exploration`（候选内嵌 `resolvedPois`）  
**后端 SSOT:** [prd-cpre-v1.md](../product/prd-cpre-v1.md)  
**Exploration 联调:** [frontend-ai-route-generation-handoff.md](./frontend-ai-route-generation-handoff.md)

---

## 一、从后端复制到前端的文件

| 后端路径 | 建议前端路径 |
|----------|--------------|
| `src/canonical-poi-resolution/dto/frontend-cpre-api.types.ts` | `src/features/poi-resolution/api/types.ts` |
| `src/canonical-poi-resolution/dto/frontend-cpre-api.client.ts` | `src/features/poi-resolution/api/client.ts` |
| `src/canonical-poi-resolution/dto/frontend-cpre-api.helpers.ts` | `src/features/poi-resolution/api/helpers.ts` |

Exploration 已有部分 helper 副本（`frontend-exploration-api.helpers.ts` 内 `getPoiResolutionBadge`）。**以 CPRE 三文件为 SSOT**，Exploration 侧 re-export 即可，避免漂移：

```typescript
// features/exploration/api/helpers.ts
export {
  getPoiResolutionBadge,
  countUnresolvedPois,
  needsPoiConfirmation,
  formatEvidenceChain,
} from '@/features/poi-resolution/api/helpers';
```

---

## 二、核心概念（前端必知）

| 概念 | 说明 |
|------|------|
| **Travel Primary Key** | 字符串 `poiId`，冰岛示例 `is.blue_lagoon` |
| **自然语言** | AI / 攻略里的「蓝湖」「Black Sand Beach」 |
| **resolvedPois** | Exploration 候选上已批量解析的结果（Compare 页直接用） |
| **evidence** | 解析证据链，Evidence 抽屉展示 |
| **confirm** | 用户点选候选 → 飞轮回写别名（需 JWT） |

**原则：** 进入 Constraint / Decision / 地图 / 订票的运行时逻辑只认 `poiId`，不认纯字符串。

---

## 三、API 清单

### 3.1 CPRE 独立接口 `/api/poi`

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| POST | `/api/poi/resolve` | 无 | 单点解析 + evidence |
| POST | `/api/poi/resolve/batch` | 无 | 批量解析 |
| GET | `/api/poi/canonical/:poiId` | 无 | 查官方 POI 详情 |
| POST | `/api/poi/confirm` | **JWT** | 用户确认 → Learning Flywheel |

### 3.2 Exploration 内嵌（已实现）

| 方法 | 路径 | 新增字段 |
|------|------|----------|
| POST | `/api/exploration/scenarios/:id/candidates` | `candidates[].resolvedPois` |
| GET | `/api/exploration/scenarios/:id/candidates/compare` | 同上 |
| POST | `/api/exploration/scenarios/:id/candidates/regenerate` | 同上 |

---

## 四、类型（TypeScript）

```typescript
interface ResolvedPoiRef {
  name: string;              // 原文 mention
  resolved: boolean;
  poiId?: string;            // is.blue_lagoon
  confidence?: number;       // 0–1
  method?: string;           // EXACT | ALIAS | HUMAN
  status?: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'NEEDS_CONFIRMATION';
  canonicalName?: string;    // Blue Lagoon
}

interface RouteCandidate {
  // ...既有字段
  /** CPRE — compare 响应始终包含（可为 []） */
  resolvedPois: ResolvedPoiRef[];
}

interface ResolutionResult {
  status: ResolutionStatus;
  method?: ResolutionMethod;
  poiId?: string;
  confidence: number;
  matchedPoi?: CanonicalPOIView;
  candidates?: Array<{ poiId: string; canonicalName: string; confidence: number }>;
  evidence?: Array<{ stage: string; label: string; detail?: string }>;
  reason?: string;
}
```

完整定义见 `frontend-cpre-api.types.ts`。

---

## 五、页面改动清单

### 5.1 Compare 页 — `ExploreComparePage`（P0 UI）

**数据来源：** `fetchCompareCandidates` / `ensureFreshCandidates` 返回的 `candidates[].resolvedPois`（后端已解析，无需再调 batch resolve）。

```typescript
import { getPoiResolutionBadge, countUnresolvedPois, getUnresolvedPoisBannerText } from '@/features/poi-resolution/api/helpers';

const unresolvedCount = candidates.reduce(
  (n, c) => n + countUnresolvedPois(c.resolvedPois),
  0,
);

if (unresolvedCount > 0) {
  showBanner(getUnresolvedPoisBannerText(unresolvedCount));
}

// 每张 RouteStrategyCard 底部 POI chips
candidates.map((c) => ({
  ...cardProps,
  poiChips: (c.resolvedPois ?? []).map((p) => ({
    key: p.name,
    label: p.canonicalName ?? p.name,
    poiId: p.poiId,
    badge: getPoiResolutionBadge(p),
    needsAction: needsPoiConfirmation(p),
  })),
}));
```

**UI 规范（PM）：**

| 状态 | 展示 | 色调 |
|------|------|------|
| `resolved && confidence ≥ 0.75` | `✓ 已验证 98%` + 官方名 | success |
| `NEEDS_CONFIRMATION` / `AMBIGUOUS` | `⚠ 等待确认` + 可点击 | warning |
| `NOT_FOUND` | `未解析` + 「手动选择」 | muted |

### 5.2 POI 确认弹层 — `PoiConfirmationSheet`（新建）

当 `needsPoiConfirmation(poi)` 为 true 时打开。

**流程：**

```text
用户点击「等待确认」chip
  → 若 resolve 时已有 candidates：直接展示列表
  → 否则 POST /api/poi/resolve { name, countryCode: 'IS' }
  → 用户选中一项
  → POST /api/poi/confirm { queryName, selectedPoiId, countryCode, locale }
  → 本地更新 resolvedPois + toast「已验证，下次将直接命中」
```

```typescript
import { confirmPoiResolution, resolvePoi } from '@/features/poi-resolution/api/client';

async function onUserPickPoi(token: string, queryName: string, selectedPoiId: string) {
  const result = await confirmPoiResolution(token, {
    queryName,
    selectedPoiId,
    countryCode: 'IS',
    locale: 'zh',
  });
  return result; // status: MATCHED, method: HUMAN, evidence: [...]
}

async function loadCandidatesForPicker(name: string) {
  const result = await resolvePoi({ name, countryCode: 'IS' });
  return result.candidates ?? [];
}
```

**候选列表 UI 示例：**

```text
「Secret Canyon」请选择正确地点：

○ Stuðlagil Canyon        is.studlagil      68%
○ Fjaðrárgljúfur          is.fjadrargljufur 65%
○ Secret Lagoon           is.secret_lagoon  62%

[确认]
```

冰岛 MVP 若 registry 无候选，`candidates` 为空 → 展示「暂未收录，反馈给我们」占位（不阻塞 Compare 主流程）。

### 5.3 Evidence 抽屉 — `PoiEvidenceDrawer`（AI Native 差异化）

点击已验证 chip 的「ⓘ」打开。

```typescript
import { formatEvidenceChain } from '@/features/poi-resolution/api/helpers';

const steps = formatEvidenceChain(evidenceFromResolveOrConfirm);
// [{ title: 'AI 识别', subtitle: '蓝湖' }, { title: '别名命中', subtitle: '蓝湖' }, ...]
```

**布局建议：**

```text
Blue Lagoon
────────────────
AI 识别      蓝湖
别名命中     蓝湖
官方 POI     is.blue_lagoon — Blue Lagoon
可信度       98%
```

Evidence 来源优先级：

1. `confirm` / `resolve` 响应里的 `evidence[]`
2. Exploration `resolvedPois` 项本身无 evidence 时 → 按需 `resolvePoi({ name })` 懒加载

### 5.4 路线详情页 — `ExploreRouteDetailPage`（P1）

若详情 API 返回 `detail.resolvedPois`（已写入 `routeDetail` JSON，无则 `[]`），复用 Compare 相同 chip 组件。

当前 MVP：Compare 页完成确认即可；详情页只读展示 `poiId` badge。

### 5.5 行程卡片 / Itinerary（P2，物化后）

ItineraryItem 展示 Place 时读 `metadata.canonical_poi_id` 或 `poi_access_slug`（后端 Sprint 2 已写）。前端物化后若只有字符串，调 `resolvePoi` 一次并写回本地 state（不落库由后端 itinerary PATCH 负责）。

---

## 六、Client API 用法

```typescript
// 独立解析（编辑器 / 手动添加 POI）
const r = await resolvePoi({ name: '黑沙滩', countryCode: 'IS' });

// 批量（自定义 Planner UI，Exploration 通常不需要）
const batch = await resolvePoiBatch(
  [{ name: 'Blue Lagoon' }, { name: '黄金瀑布' }],
);

// 官方 POI 详情
const canonical = await getCanonicalPoi('is.blue_lagoon');

// 用户确认（必须 token）
const confirmed = await confirmPoiResolution(token, {
  queryName: '天空温泉',
  selectedPoiId: 'is.sky_lagoon',
  countryCode: 'IS',
});
```

---

## 七、响应示例

### resolve — 已命中

```json
{
  "success": true,
  "data": {
    "status": "MATCHED",
    "method": "ALIAS",
    "poiId": "is.blue_lagoon",
    "confidence": 0.97,
    "matchedPoi": {
      "poiId": "is.blue_lagoon",
      "canonicalName": "Blue Lagoon",
      "aliases": ["蓝湖", "Bláa Lónið"],
      "country": "IS",
      "status": "ACTIVE"
    },
    "evidence": [
      { "stage": "INPUT", "label": "蓝湖" },
      { "stage": "ALIAS", "label": "蓝湖", "detail": "alias exact match" },
      { "stage": "CANONICAL", "label": "is.blue_lagoon", "detail": "Blue Lagoon" }
    ]
  }
}
```

### resolve — 待确认

```json
{
  "success": true,
  "data": {
    "status": "AMBIGUOUS",
    "confidence": 0.72,
    "candidates": [
      { "poiId": "is.studlagil", "canonicalName": "Stuðlagil Canyon", "confidence": 0.68 }
    ],
    "evidence": [{ "stage": "INPUT", "label": "Secret Canyon" }]
  }
}
```

### confirm — 飞轮

```json
{
  "success": true,
  "data": {
    "status": "MATCHED",
    "method": "HUMAN",
    "poiId": "is.studlagil",
    "confidence": 1.0,
    "evidence": [
      { "stage": "INPUT", "label": "Secret Canyon" },
      { "stage": "HUMAN", "label": "用户确认", "detail": "is.studlagil" },
      { "stage": "CANONICAL", "label": "is.studlagil", "detail": "Stuðlagil Canyon" }
    ]
  }
}
```

---

## 八、组件建议（文件骨架）

```text
features/poi-resolution/
  api/
    types.ts          ← 复制 backend dto
    client.ts
    helpers.ts
  components/
    PoiResolutionChip.tsx       # badge + label + onClick
    PoiConfirmationSheet.tsx    # 候选列表 + confirm
    PoiEvidenceDrawer.tsx       # evidence 时间线
  hooks/
    usePoiConfirmation.ts       # confirm + optimistic update
```

**`PoiResolutionChip` props：**

```typescript
interface PoiResolutionChipProps {
  poi: ResolvedPoiRef;
  onConfirm?: (poi: ResolvedPoiRef) => void;
  onShowEvidence?: (poi: ResolvedPoiRef) => void;
}
```

**`usePoiConfirmation`：**

```typescript
function usePoiConfirmation(token: string) {
  const confirm = async (queryName: string, selectedPoiId: string) => {
    return confirmPoiResolution(token, { queryName, selectedPoiId, countryCode: 'IS' });
  };
  return { confirm, resolveForPicker: (name: string) => resolvePoi({ name, countryCode: 'IS' }) };
}
```

---

## 九、与 Exploration 状态合并

Compare 页本地 state 建议在确认后 **optimistic 更新** `resolvedPois`，无需 regenerate 候选：

```typescript
function patchResolvedPoi(
  candidates: RouteCandidate[],
  routeId: string,
  queryName: string,
  confirmed: ResolutionResult,
): RouteCandidate[] {
  return candidates.map((c) => {
    if (c.routeId !== routeId) return c;
    return {
      ...c,
      resolvedPois: (c.resolvedPois ?? []).map((p) =>
        p.name === queryName
          ? {
              name: queryName,
              resolved: true,
              poiId: confirmed.poiId,
              confidence: confirmed.confidence,
              method: 'HUMAN',
              status: 'MATCHED',
              canonicalName: confirmed.matchedPoi?.canonicalName,
            }
          : p,
      ),
    };
  });
}
```

---

## 十、文案规范

| 场景 | 推荐 | 避免 |
|------|------|------|
| 已验证 | 「已验证 98%」「官方 POI」 | 「AI 确定」 |
| 待确认 | 「请选择正确地点」 | 「解析失败」 |
| 确认成功 | 「已记录，下次将直接识别」 | 「已保存到数据库」 |
| Banner | `getUnresolvedPoisBannerText(n)` | 静默隐藏未解析 |

---

## 十一、联调 Checklist

- [ ] 复制 CPRE types + client + helpers 三文件
- [ ] Compare 页展示 `resolvedPois` chips + badge 色
- [ ] 点击「等待确认」→ Sheet → `confirmPoiResolution`
- [ ] 确认后 chip 变绿 + banner 计数减少
- [ ] Evidence 抽屉展示 `formatEvidenceChain`
- [ ] `POST /api/poi/confirm` 无 token 返回 401
- [ ] 同一 alias 二次 `resolve` 命中率提升（可选 QA：confirm 后再 resolve 同文本）

---

## 十二、本地验证

```bash
# 后端（含 CPRE + Exploration）
npm run build && npm run dev

# 解析
curl -s -X POST http://localhost:3001/api/poi/resolve \
  -H 'Content-Type: application/json' \
  -d '{"name":"蓝湖","countryCode":"IS"}' | jq

# 确认（需 JWT）
curl -s -X POST http://localhost:3001/api/poi/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"queryName":"天空之湖","selectedPoiId":"is.sky_lagoon","countryCode":"IS"}' | jq

# Exploration compare
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/exploration/scenarios/$SCENARIO_ID/candidates/compare \
  | jq '.data.candidates[0].resolvedPois'
```

---

## 十三、Agent / Skill 后端路由（冰岛 MVP，已实现）

前端不直接调 Agent 解析链，但 **Skill 输出里的 `poi_id` / evidence 已走 CPRE**，Compare / 地图侧应同样只认 canonical `poiId`。

```
用户自然语言
  → places.resolve_entities / poi.search / transport.search
       → EntityResolutionService
            → inferEntityResolutionCountryCode()   // 文本 / 坐标 / context.countryCode
                 → CpreEntityResolutionBridge (IS)
                      → POST /api/poi/resolve 等价逻辑
```

| 入口 | 冰岛行为 | 前端可见字段 |
|------|----------|--------------|
| `places.resolve_entities` | `countryCode` 或 `state.destinationCode` → CPRE | Agent 工具结果 `metadata.canonical_poi_id` |
| `poi.search` skill | 推断 IS → CPRE；`source: 'cpre'` | `poi_id` = `is.blue_lagoon` |
| `transport.search` skill | 字符串起终点推断 IS → CPRE 取坐标 | 仅坐标；POI 名仍建议经 Exploration `resolvedPois` 展示 |
| Exploration generate/compare | 批量 CPRE | `candidates[].resolvedPois` |

**推断冰岛（无需显式 countryCode）：** 查询含「冰岛 / Iceland / Reykjavík」或坐标落在 `(63–67.8, -24.9–-12.5)`。

**澄清态：** CPRE 返回 `AMBIGUOUS` / `NEEDS_CONFIRMATION` 时，Agent 链写入 `needsClarification`；前端复用 §六 `PoiConfirmationSheet` + `POST /api/poi/confirm`。

规划工作台 context 请始终传 `countryCode: 'IS'`，以便工具参数自动注入（见 `planning-assistant-v2.service`）。

**Check / Issues 桥接（P0）：** 未确认 POI（`NEEDS_CONFIRMATION` / `AMBIGUOUS` / `NOT_FOUND`）经 `ExplorationPoiIssueBridgeService` 并入 `GET /issues` 与 `POST /check` 的 `totalIssueCount`；`issueId` 前缀 `cpre-poi-`，`issues[].cprePoi` 供前端跳转 Compare 确认。`job.result.diagnosis = POI_CONFIRMATION_REQUIRED` 表示 verdict 为 ADJUST 且主因是 POI 待确认。

---

## 十四、后续（后端 P3，前端可预留）

| 能力 | 前端影响 |
|------|----------|
| Fuzzy / Embedding 候选更全 | 确认 Sheet 候选变多，UI 不变 |
| External Resolver 新建 POI | 新增「从地图选点」入口 |
| Place ↔ poiId 映射 | Itinerary 物化自动带 `poiId` |
| Agent 对话内联确认 | 复用同一 `PoiConfirmationSheet` |

PRD 全文：[prd-cpre-v1.md](../product/prd-cpre-v1.md)
