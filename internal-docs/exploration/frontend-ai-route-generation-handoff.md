# Exploration AI 路线生成 — 前端联调交接

**Audience:** 前端 `features/exploration` · `features/agent`（route_and_run 异步规划）  
**后端 SSOT:** [EXPLORATION_API.md](../../src/trips/exploration/EXPLORATION_API.md) · [travel-compiler-integration-v1.md](../product/travel-compiler-integration-v1.md)  
**Env 示例:** [.env.exploration-ai.example](../../.env.exploration-ai.example)  
**CPRE 前端集成:** [frontend-cpre-integration-guide.md](./frontend-cpre-integration-guide.md)

---

## 一、从后端复制到前端的文件

| 后端路径 | 建议前端路径 |
|----------|--------------|
| `src/trips/exploration/dto/frontend-exploration-api-client.ts` | `src/features/exploration/api/client.ts` |
| `src/trips/exploration/dto/frontend-exploration-api.types.ts` | `src/features/exploration/api/types.ts` |
| `src/trips/exploration/dto/frontend-exploration-api.helpers.ts` | `src/features/exploration/api/helpers.ts` |

建议用 symlink 或 CI sync，避免类型漂移。

---

## 二、后端本次交付摘要（前端需感知）

### 2.1 AI 路线生成

| 能力 | 说明 |
|------|------|
| 三模式 | `STATIC` / `PERSONALIZED` / `ENGINE`（Mapbox 贴路） |
| LLM overlay | `generationSource=LLM`（模板或 DeepSeek live） |
| 持久化 | 每条候选存 `generationSource` + 个性化 `routeDetail` |

### 2.2 候选生命周期

| `candidatesStatus.status` | 含义 | 前端动作 |
|---------------------------|------|----------|
| `EMPTY` | 未生成 | 调 `generateCandidates` |
| `READY` | 有有效候选 | 展示对比页 / `fetchCompareCandidates` |
| `STALE` | 原则/条件变更后已失效 | 展示 banner + `regenerateCandidates` |
| `SELECTED` | 已选路 | 进 check/decision 流，禁止 regenerate |

### 2.3 条件 PATCH 扩展

- **原：** 仅 `DRAFT` 可 PATCH  
- **现：** `MATERIALIZED` 且**未选路**也可 PATCH（同步 Trip + invalidate 候选）

### 2.4 新增/变更 API

| 方法 | 路径 | 变更 |
|------|------|------|
| GET | `/exploration/scenarios/:id` | + `candidatesStatus` |
| PUT | `/exploration/scenarios/:id/principles` | + `candidatesInvalidated`, `candidatesStatus` |
| PATCH | `/exploration/scenarios/:id/conditions` | 物化后可 PATCH；+ `tripSynced`, `candidatesInvalidated`, `candidatesStatus` |
| POST | `/exploration/scenarios/:id/candidates` | 响应 + `generationMode`、`dimensions` |
| GET | `/exploration/scenarios/:id/candidates/compare` | 同上 |

---

## 三、前端必须改动的类型

```typescript
// types.ts — 新增/扩展

interface ExplorationScenarioDetail {
  candidatesStatus?: ExplorationCandidatesStatus;
}

interface ExplorationCandidatesStatus {
  status: 'EMPTY' | 'READY' | 'STALE' | 'SELECTED';
  activeCount: number;
  generationVersion: number | null;
  generationMode?: 'STATIC' | 'PERSONALIZED' | 'ENGINE';
  selectedRouteId?: string | null;
}

interface RouteMapLayerView {
  id: 'main' | 'fRoad';
  label: string;
  coordinates: RouteLineCoordinates;
  lineStyle: 'solid' | 'dashed';
  requires4wd?: boolean;
}

interface RouteMapGeometry {
  mainLine: RouteLineCoordinates;
  fRoadLine?: RouteLineCoordinates;
  layers?: RouteMapLayerView[];
}

interface RouteCandidate {
  generationSource?: 'STATIC_CATALOG' | 'PERSONALIZED' | 'ENGINE_MAPBOX' | 'LLM';
  preview?: RouteMapPreview; // map.layers 含 main + fRoad
  /** CPRE — POI 解析（Compare 卡片展示验证态） */
  /** CPRE — compare / generate 响应始终包含（可为 []） */
  resolvedPois: ResolvedPoiRef[];
}

interface ResolvedPoiRef {
  name: string;
  resolved: boolean;
  poiId?: string;
  confidence?: number;
  method?: string;
  status?: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'NEEDS_CONFIRMATION';
  canonicalName?: string;
}

interface CompareDimensionDef {
  key: string;
  label: string;
  higherIsBetter: boolean;
}

// generateCandidates / fetchCompareCandidates / regenerateCandidates 响应
interface CandidatesBundle {
  dimensions?: CompareDimensionDef[];  // 6 维，替代 mock COMPARE_DIMENSIONS
}
```

---

## 四、前端必须接入的 Client API

```typescript
// 新增
regenerateCandidates(token, scenarioId)
fetchCompareCandidates(token, scenarioId)
ensureFreshCandidates(token, scenarioId, detail?)  // 对比页入口推荐

// 变更签名
generateCandidates(token, scenarioId, { force?: boolean; idempotencyKey?: string })
savePrinciples(...)  // 返回 candidatesInvalidated, candidatesStatus
patchScenarioConditions(...)  // 返回 tripSynced, candidatesInvalidated, candidatesStatus

// helpers.ts
getGenerationSourceBadge(source)
getPoiResolutionBadge(poi)       // CPRE: 已验证 98% / 等待确认
countUnresolvedPois(resolvedPois)
getComparePageHeadline(generationMode)
getStaleCandidatesBannerText()
getConditionsChangedBannerText(tripSynced)
getRouteMapLayers(map)  // main + fRoad 图层
shouldRegenerateCandidates(status)
shouldShowComparePage(status)
```

---

## 五、按页面改动清单

### 5.1 `ExplorePrinciplesPage`（原则页）

**保存原则后：**

```typescript
const res = await savePrinciples(token, scenarioId, principles);
if (res.candidatesInvalidated > 0 || res.candidatesStatus?.status === 'STALE') {
  // 提示：路线对比需重新生成
}
navigate(`/explore/${scenarioId}/compare`);
```

### 5.2 `ExploreComparePage`（三路线对比 — **核心**）

```typescript
const detail = await fetchScenarioDetail(token, scenarioId);

// STALE banner
if (shouldRegenerateCandidates(detail.candidatesStatus?.status)) {
  showBanner(getStaleCandidatesBannerText());
}

// 标题 — 勿写「AI 定制唯一路线」
const headline = getComparePageHeadline(detail.candidatesStatus?.generationMode);
// PERSONALIZED → 「三种典型走法对比 · 已按你的条件个性化」
// ENGINE → 「三种走法对比 · 引擎已计算驾驶路线」

// 加载候选
const { candidates, dimensions, action } = await ensureFreshCandidates(token, scenarioId, detail);
// dimensions 替代本地 mock COMPARE_DIMENSIONS（6 维 keys 见 metrics）

// 每张 RouteStrategyCard
candidates.map(c => ({
  badge: getGenerationSourceBadge(c.generationSource),
  mapLayers: getRouteMapLayers(c.preview?.map),
  narrative: c.narrative,
  poiChips: (c.resolvedPois ?? []).map(p => ({
    label: p.canonicalName ?? p.name,
    badge: getPoiResolutionBadge(p),
    poiId: p.poiId,
  })),
}));
```

**地图折线（含 F 路路线网）：**

`preview.map` 现含 `mainLine`、`fRoadLine`（仅高地候选 `route_remote-highlands-south`）及 **`layers`** 数组。前端优先用 `getRouteMapLayers(map)` 绘制：

| layer.id | 样式 | 说明 |
|----------|------|------|
| `main` | 实线（品牌色） | 环线路 / 南岸主道；ENGINE 模式下点密、贴路 |
| `fRoad` | **虚线 + 橙色** | F208 高地段；`requires4wd: true` 可加图例 |

```typescript
import { getRouteMapLayers } from './helpers';

for (const layer of getRouteMapLayers(candidate.preview?.map)) {
  map.addLayer({
    id: `route-${layer.id}`,
    type: 'line',
    paint: {
      'line-color': layer.id === 'fRoad' ? '#E87722' : '#2563EB',
      'line-width': layer.id === 'fRoad' ? 3 : 4,
      ...(layer.lineStyle === 'dashed' ? { 'line-dasharray': [2, 2] } : {}),
    },
    // source: GeoJSON LineString from layer.coordinates ([lng,lat][])
  });
}
```

**Regenerate 按钮（`STALE` 时显示）：**

```typescript
await regenerateCandidates(token, scenarioId);
```

### 5.3 条件页 / `patchScenarioConditions`

物化后（未选路）改车辆/日期：

```typescript
const res = await patchScenarioConditions(token, scenarioId, { mobilityContext: { vehicleType: '2WD_COMPACT_SUV' } });
if (res.candidatesStatus?.status === 'STALE') {
  showBanner(getConditionsChangedBannerText(res.tripSynced));
}
```

### 5.4 `ExploreRouteDetailPage`

- 仍用 `fetchRouteDetail` — 后端优先返回 DB 中个性化后的 `routeDetail`
- 地图组件：GeoJSON 坐标顺序 **`[lng, lat]`**
- 详情页同样用 `getRouteMapLayers(detail.map)` 绘制主道 + F 路（`detail.map.fRoadLine` 已加密锚点）

### 5.5 选路后

- `candidatesStatus.status === 'SELECTED'` → 隐藏 regenerate
- PATCH conditions / regenerate → 409 `ROUTE_ALREADY_SELECTED`

---

## 六、UI 文案规范（PM 要求）

| 场景 | 推荐文案 | 避免 |
|------|----------|------|
| Phase 1 PERSONALIZED | 「三种典型走法对比 · 已按你的条件个性化」 | 「AI 已为你定制唯一路线」 |
| Phase 2 ENGINE | 「三种走法对比 · 引擎已计算驾驶路线」 | 「完全 AI 生成」 |
| STALE | `getStaleCandidatesBannerText()` | 静默展示旧候选 |
| Badge PERSONALIZED | 「已个性化」 | — |
| Badge ENGINE_MAPBOX | 「引擎计算」 | — |
| Badge LLM | 「AI 生成」 | — |

---

## 七、前端 Env（Vite，可选）

后端能力不依赖前端 env；仅 UI 分流：

```bash
VITE_EXPLORATION_USER_CONDITIONS=1   # Consumer 条件表单
VITE_EXPLORATION_RESEARCH_MODE=0     # 研究模式
VITE_MAPBOX_ACCESS_TOKEN=...         # 地图展示（与后端 ENGINE 可共用 token）
```

---

## 八、联调验收 Checklist

- [ ] 复制 client + types + helpers 三文件
- [ ] Compare 页 `dimensions` 改读 API（`fetchCompareCandidates` / `generateCandidates`）
- [ ] 每条候选显示 `generationSource` badge
- [ ] 原则保存后 STALE → regenerate → v2 候选
- [ ] 物化后 PATCH 车辆 → STALE banner → regenerate
- [ ] ENGINE 模式下地图折线点数明显多于锚点（贴路）
- [ ] 高地候选 `route_remote-highlands-south` 地图显示 **F 路虚线**（`preview.map.layers` 或 `getRouteMapLayers`）
- [ ] 选路后 regenerate / PATCH conditions 返回 409
- [ ] `ensureFreshCandidates` 在 EMPTY/STALE/READY 三种状态行为正确
- [ ] 候选 `resolvedPois` 含 CPRE 解析（如「蓝湖」→ `is.blue_lagoon`）；运维跑 `npm run qa:exploration-cpre-poi` 全绿
- [ ] Agent / Skill 侧 `poi.search` 返回 `poi_id` 为 canonical id（非 DB 数字 id）；详见 [frontend-cpre-integration-guide.md §十三](./frontend-cpre-integration-guide.md)

---

## 九、后端 Env（运维已写入 `.env`）

见项目根目录 `.env` 末尾 **Exploration Consumer Pipeline + AI 路线生成** 区块，或 `.env.exploration-ai.example`。

本地验证：

```bash
# 后端需重启并加载 .env（含 EXPLORATION_* / VITE_MAPBOX_ACCESS_TOKEN）
npm run build && PORT=3000 node dist/src/main.js

# 前端联调 QA（8 项 checklist）
BASE_URL=http://localhost:3000/api npx tsx scripts/exploration-frontend-qa.ts

# CPRE alias 全量 upsert（catalog 扩充后必跑）
npm run cpre:refresh-iceland-aliases

# CPRE resolvedPois 覆盖率 QA（每条候选 ≥6 POI、匹配率 ≥50%）
BASE_URL=http://localhost:3000/api npm run qa:exploration-cpre-poi
# 已有场景仅 compare：SCENARIO_ID=... AUTH_TOKEN=... npm run qa:exploration-cpre-poi

# 全链路 E2E
BASE_URL=http://localhost:3000/api EXPLORATION_AI_ROUTE_GENERATION=1 npx tsx scripts/exploration-e2e.ts

# Mapbox + LLM 实网（不依赖 HTTP）
npx tsx scripts/exploration-ai-live-verify.ts
```

---

## 十、Prisma Migration

部署前执行：

```bash
npx prisma migrate deploy
# 20260705120000_exploration_route_generation
#   → exploration_route_variants.generation_source
#   → exploration_route_variants.route_detail
```

---

## 十一、CTRE 旅行编译进度面板（route_and_run / Agent 规划）

**适用页面：** 异步 `POST /agent/route_and_run/async` 进度 UI、**Planning Workbench**（`planning-workbench` 异步 execute）规划工作台「AI 正在编译行程」条带。  
**产品名：** CTRE（Canonical Travel Resolution Engine）= 后端 `Travel Compiler`。  
**启用条件：**

| 入口 | 开关字段 |
|------|----------|
| `POST /agent/route_and_run`（async） | `.env` `TRAVEL_COMPILER_ENABLED=true` **或** `options.enable_travel_compiler: true` |
| `POST /planning-workbench/execute`（async） | 同上 **或** `enable_travel_compiler: true` |

### 11.1 数据来源（按入口）

#### A. route_and_run（CLAUDE_SM 全链）

| 优先级 | 来源 | 字段 |
|--------|------|------|
| 1 | **SSE** | `payload.ctre_compilation`（`route_and_run.task.{taskId}`） |
| 2 | **RESULT** | `result.state.metadata.ctre_compile_progress` |
| 3 | **HTTP** | `GET /trips/:tripId/ctre/compile-progress`（Trip 落库后） |

#### B. Planning Workbench（独立 Architect 管线 + 内嵌 CTRE）

| 优先级 | 来源 | 字段 |
|--------|------|------|
| 1 | **任务进度** | `GET /planning-workbench/tasks/:taskId/status` → `currentStage` 含 `CTRE 编译：…` |
| 2 | **execute 响应** | `uiOutput.ctre.progress`（`CtreCompileProgressView`） |
| 3 | **PlanState metadata** | `planState.metadata.ctre_compile_progress` |
| 4 | **HTTP** | `GET /trips/:tripId/ctre/*`（有 `tripId` 且 compile 落库后） |

> Workbench **不走** `route_and_run` SSE；勿订阅 `route_and_run.task.*`  expecting CTRE。

### 11.2 建议复制到前端的类型

| 后端路径 | 建议前端路径 |
|----------|--------------|
| `src/travel-compiler/contracts/ctre-compile-progress.types.ts` | `src/features/agent/ctre/types.ts` |
| `src/travel-compiler/contracts/travel-compiler.types.ts`（`CompilePhase`） | 同上或 `ctre/phases.ts` |
| `src/agent/events/route-and-run-task.events.ts`（`RouteAndRunTaskProgressPayload`） | `src/features/agent/api/task-events.ts` |

核心类型（与后端 SSOT 一致）：

```typescript
/** tripnara.ctre_compile_progress@v0 */
interface CtreCompileProgressView {
  schemaId: 'tripnara.ctre_compile_progress@v0';
  engine: 'CTRE';
  compileId: string;
  status: 'success' | 'partial' | 'failed';
  score: number; // 0–100 结构完整度，非「好不好玩」
  trigger: 'plan_gen' | 'repair';
  incremental?: {
    affectedDayIndices: number[];
    previousCompileId?: string;
    merged: boolean;
  };
  phases: CtrePhaseProgressView[];
  counters: {
    POI?: { done: number; total: number };
    Route?: { done: number; total: number };
    Booking?: { done: number; total: number };
    Constraint?: { done: number; total: number };
    Dependency?: { done: number; total: number };
  };
  updatedAt: string;
}

interface CtrePhaseProgressView {
  phase: CompilePhase;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
  summary?: string;
  counters?: Record<string, { done: number; total: number }>;
  durationMs?: number;
}

type CompilePhase =
  | 'LEXICAL'
  | 'CANONICALIZATION'
  | 'GRAPH_CONSTRUCTION'
  | 'ROUTE_RESOLUTION'
  | 'SEMANTIC'
  | 'LINKING'
  | 'VALIDATION'
  | 'OPTIMIZATION';
```

### 11.3 SSE 订阅示例

```typescript
eventSource.addEventListener('message', (ev) => {
  const payload = JSON.parse(ev.data) as RouteAndRunTaskProgressPayload;
  if (payload.type !== 'PHASE') return;

  // 编排总进度（0–100）
  setOrchestrationPercent(payload.progress_percentage);
  setOrchestrationMessage(payload.message);

  // CTRE 细粒度面板（仅 TRAVEL_COMPILE 阶段有值）
  if (payload.ctre_compilation) {
    setCtreProgress(payload.ctre_compilation);
  }
});
```

**编排阶段进度（含 TRAVEL_COMPILE）：**

| `current_phase` | `progress_percentage` | 中文 message（后端默认） |
|-----------------|-------------------------|---------------------------|
| `PLAN_GEN` | 42 | 正在使用 System 2 状态机生成最佳路线草案… |
| `TRAVEL_COMPILE` | 46 | 正在解析 POI、路线与依赖关系（CTRE 旅行编译）… |
| `VERIFY` | 55 | 正在验证开放时间、转乘缓冲与车型路况… |
| `REPAIR` | 72 | 正在修复发现的可执行性问题… |

TRAVEL_COMPILE 完成后 SSE `message` 示例：

`CTRE 编译：partial score=88（POI 2/2 · Route 1/1）`

REPAIR 后二次编译：

`CTRE 编译(修复后)：partial score=90（POI 3/3 · Route 1/1）`

### 11.4 HTTP API

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/trips/:tripId/ctre/compile-progress` | 返回 `{ engine: 'CTRE', progress: CtreCompileProgressView }` |
| GET | `/trips/:tripId/ctre/graph?include=progress` | Graph + 同结构 `ctre_compile_progress` |
| GET | `/trips/:tripId/travel-graph?include=compilation` | 完整 `CompilationResult`（含 `phaseReports` 原始数据） |

### 11.5 UI 布局建议（PRD §11 对齐）

```
┌─ CTRE 旅行编译 ─────────────────────────────┐
│  [████████░░] 46%  ·  partial · score 88     │
│  trigger: 方案生成  compileId: cde17fa1…     │
├──────────────────────────────────────────────┤
│  POI        18/18  ✓                         │
│  Route       1/1   ✓                         │
│  Booking     6/8   ⚠                         │
│  Constraint  2/2   ✓                         │
│  Dependency 10/10  ✓                         │
├─ 阶段明细（可折叠）──────────────────────────┤
│  ✓ 词法分析                                   │
│  ✓ POI 标准化 (CPRE)                          │
│  ✓ 图构建                                     │
│  ✓ 路线解析                                   │
│  …                                           │
└──────────────────────────────────────────────┘
```

**Counter 行规则：**

```typescript
function counterIcon(done: number, total: number): 'ok' | 'warn' | 'pending' {
  if (total <= 0) return 'pending';
  if (done >= total) return 'ok';
  if (done > 0) return 'warn';
  return 'warn';
}
```

**`status` 总态 badge：**

| `status` | 文案 | 颜色 |
|----------|------|------|
| `success` | 编译完成 | 绿 |
| `partial` | 部分完成（有 warnings） |  amber |
| `failed` | 编译失败 | 红 |

**`trigger === 'repair'`：** 在标题旁加小标签「修复后重编译」；若 `incremental.merged` 为 true，副标题展示 `受影响天数：Day ${indices.map(i=>i+1).join(', ')}`。

### 11.6 阶段中文标签（`getCtrePhaseLabel`）

```typescript
const CTRE_PHASE_LABEL_ZH: Record<CompilePhase, string> = {
  LEXICAL: '词法分析',
  CANONICALIZATION: 'POI 标准化',
  GRAPH_CONSTRUCTION: '行程图构建',
  ROUTE_RESOLUTION: '路线解析',
  SEMANTIC: '语义标注',
  LINKING: '依赖关联',
  VALIDATION: '编译校验',
  OPTIMIZATION: '编译优化',
};
```

阶段条状态：`done` → ✓，`running` → 旋转图标，`failed` → ✗，`skipped` → —。

### 11.7 示例 SSE payload（节选）

```json
{
  "task_id": "task_iceland_173…",
  "request_id": "req_abc",
  "type": "PHASE",
  "current_phase": "TRAVEL_COMPILE",
  "progress_percentage": 46,
  "message": "CTRE 编译：partial score=88（POI 2/2 · Route 1/1）",
  "status": "PROCESSING",
  "ts": "2026-08-01T12:00:00.000Z",
  "ctre_compilation": {
    "schemaId": "tripnara.ctre_compile_progress@v0",
    "engine": "CTRE",
    "compileId": "cde17fa1-0199-4963-b637-21f5172a7a98",
    "status": "partial",
    "score": 88,
    "trigger": "plan_gen",
    "phases": [
      { "phase": "CANONICALIZATION", "status": "done", "counters": { "POI": { "done": 2, "total": 2 } } },
      { "phase": "ROUTE_RESOLUTION", "status": "done", "counters": { "Route": { "done": 1, "total": 1 } } }
    ],
    "counters": {
      "POI": { "done": 2, "total": 2 },
      "Route": { "done": 1, "total": 1 },
      "Booking": { "done": 1, "total": 1 },
      "Constraint": { "done": 1, "total": 1 },
      "Dependency": { "done": 1, "total": 1 }
    },
    "updatedAt": "2026-08-01T12:00:01.000Z"
  }
}
```

### 11.8 与 Exploration Compare 的关系

- **Exploration Compare 页** 使用 `resolvedPois`（CPRE 卡片 badge）— 见本文 §5.2 与 [frontend-cpre-integration-guide.md](./frontend-cpre-integration-guide.md)。
- **CTRE 面板** 用于 **Agent route_and_run 全链编译**，不替代 Compare 页的 `RouteStrategyCard`。
- 若 Exploration 后续走 `compileFromPoiMentions`，Compare 页可在选路后展示 `GET …/ctre/compile-progress` 作为「行程结构化进度」二级面板（可选）。

### 11.9 前端 Helpers 建议

```typescript
export function getCtrePhaseLabel(phase: CompilePhase): string { /* §11.6 */ }

export function getCtreCounterRows(c: CtreCompileProgressView['counters']) {
  return (
    [
      ['POI', '兴趣点'],
      ['Route', '路线'],
      ['Booking', '预订'],
      ['Constraint', '约束'],
      ['Dependency', '依赖'],
    ] as const
  )
    .map(([key, label]) => ({ key, label, ...c[key] }))
    .filter((row) => row.total != null && row.total > 0);
}

export function formatCtreHeadline(p: CtreCompileProgressView): string {
  const parts = getCtreCounterRows(p.counters).map(
    (r) => `${r.label} ${r.done}/${r.total}`,
  );
  const suffix = parts.length ? `（${parts.join(' · ')}）` : '';
  const repair = p.trigger === 'repair' ? '(修复后)' : '';
  return `CTRE 编译${repair}：${p.status} score=${p.score}${suffix}`;
}
```

### 11.10 联调 Checklist（CTRE 面板）

- [ ] Compiler 关闭时无 CTRE 字段，面板隐藏（勿报错）
- [ ] **route_and_run：** SSE 在 `TRAVEL_COMPILE` 收到 `ctre_compilation`
- [ ] **planning-workbench：** async 完成后 `result.uiOutput.ctre.progress` 有值；进度条 stage 含 `CTRE 编译`
- [ ] Workbench：`uiOutput.ctre.kernelVerify.issueCount === 0` 时 Plan Gate 安全维度无 `[VERIFY]` 阻塞
- [ ] Workbench：`uiOutput.ctre.verifySsotApplied === true` 时 Plan Gate 可读 `planState.metadata.graph_projected_itinerary`
- [ ] Workbench segment badge：`segments[].metadata.attractions[].canonical_poi_id` 或 `ctreResolvedPois[]`
- [ ] adjust 后：`uiOutput.ctre.incrementalRepair.merged === true`（有上次 Graph 且增量开关开启）
- [ ] Planning Workbench 异步：编译完成前 `GET …/ctre/compile-progress` 可能 404/空（§11.12）

### 11.11 后端 Env（CTRE）

```bash
TRAVEL_COMPILER_ENABLED=true              # 或请求 options.enable_travel_compiler
TRAVEL_COMPILER_VERIFY_SSOT=true        # 默认
TRAVEL_COMPILER_INCREMENTAL_REPAIR=true # REPAIR 后增量 re-compile
PLANNING_WORKBENCH_VERIFY_REPAIR=true  # Workbench VERIFY→REPAIR 闭环（默认）
PLANNING_WORKBENCH_VERIFY_REPAIR_MAX_ITERATIONS=2  # 与 DECISION_MAX_REPAIR_COUNT 对齐
# RFC001_ITINERARY_MATERIALIZE=true     # VERIFY 通过后写入 Trip 时间线（可选）
```

### 11.12 Planning Workbench 异步联调提示

**场景：** `POST /planning-workbench/execute/async` → 后台跑 `PlanningWorkbenchAgentService.execute`（Architect Skills 管线，**非** `route_and_run`）。

**CTRE 触发：** `generate` / `commit` / `adjust` 完成且 `planState.itinerary.segments` 非空时，调用 `runPlanningWorkbenchTravelCompile`（需 flag 开启）。`compare` 跳过。

**数据时序：**

| 时刻 | Workbench task 进度 | 响应 / metadata | `GET …/ctre/*` |
|------|---------------------|-----------------|----------------|
| execute 进行中 (~92%) | `currentStage`: `CTRE 编译：partial score=…` | — | 通常尚无 |
| execute COMPLETED | — | `result.uiOutput.ctre.progress` | 有 `tripId` 时落库后可轮询 |
| 无 `tripId` | 同上 | `planState.metadata.ctre_compile_progress` | 勿轮询 Trip API |

**前端预期：**

1. **面板读 `uiOutput.ctre`**，勿等 `route_and_run` SSE。
2. **轮询 Trip Graph 仅在 task COMPLETED 且有 `tripId` 后**；之前 404/空属正常。
3. **开启方式：** `TRAVEL_COMPILER_ENABLED=true` 或请求体 `enable_travel_compiler: true`。
4. **`uiOutput.ctre.skipped === true`** 时隐藏面板（`reason`: `travel_compiler_disabled` / `no_segments` 等）。

**请求示例：**

```json
POST /api/planning-workbench/execute/async
{
  "tripId": "trip_abc",
  "enable_travel_compiler": true,
  "context": { "destination": { "country": "Iceland" }, "days": 5 },
  "userAction": "commit"
}
```

**响应节选：**

```json
{
  "uiOutput": {
    "ctre": {
      "skipped": false,
      "progress": {
        "schemaId": "tripnara.ctre_compile_progress@v0",
        "engine": "CTRE",
        "status": "partial",
        "score": 88,
        "counters": { "POI": { "done": 3, "total": 3 } }
      },
      "graphProjectedItemCount": 5,
      "segmentEnrichment": {
        "segmentsUpdated": 1,
        "poiTagsApplied": 3,
        "routeTemplatesTagged": 1
      },
      "verifySsotApplied": true,
      "incrementalRepair": { "affectedDayIndices": [0], "merged": false }
    }
  },
  "planState": {
    "itinerary": {
      "segments": [{
        "metadata": {
          "attractions": [{ "name": "Gullfoss", "canonical_poi_id": "is.gullfoss" }],
          "ctreResolvedPois": [{ "name": "Gullfoss", "canonical_poi_id": "is.gullfoss", "graph_node_id": "poi_…" }],
          "routeTemplateId": "is.golden_circle"
        }
      }]
    }
  }
}
```

**async 任务状态（COMPLETED）：**

```json
GET /api/planning-workbench/tasks/:taskId/status
{
  "status": "COMPLETED",
  "progress": 100,
  "currentStage": "CTRE 编译：partial score=88（POI 3/3）",
  "ctre": { "skipped": false, "progress": { "...": "..." } },
  "result": { "uiOutput": { "ctre": { "...": "..." } } }
}
```

### 11.13 CTRE Panel — VERIFY⇄REPAIR 轮次明细（Workbench）

**仅 Planning Workbench**（`enable_travel_compiler: true` + Decision Kernel 可用）。`route_and_run` 仍用 SSE `ctre_compilation`，无 `kernelVerifyRepairLoop`。

#### 11.13.1 读数优先级

| 用途 | 字段 | 时机 |
|------|------|------|
| 面板主数据 | `result.uiOutput.ctre` | async task `COMPLETED` |
| 任务轮询 | `GET …/tasks/:taskId/status` → `ctre`（从 `result.uiOutput.ctre` 投影） | 同上 |
| 进行中文案 | `currentStage` | 92–94%：`CTRE 编译…` / `Decision Kernel VERIFY…` / `RE-VERIFY（第 N 轮）` |
| Plan Gate 阻塞项 | `planState.metadata.conflictArbitration.conflicts[]` | 含 `[VERIFY]` 前缀 |
| 最终 issue 明细 | `planState.metadata.kernelVerify.issues[]` | 最后一轮 VERIFY 快照 |
| 循环汇总 | `planState.metadata.kernelVerifyRepairLoop` | `{ terminatedReason, repairCount, maxRepairs, rounds }` |

#### 11.13.2 类型（复制到 `src/features/agent/ctre/types.ts`）

```typescript
type KernelVerifyRepairTerminatedReason =
  | 'clean'
  | 'fatal'
  | 'max_iterations'
  | 'repair_not_applied'
  | 'repair_disabled'
  | 'verify_skipped';

interface KernelVerifyIssueSummary {
  code: string;
  class: 'FATAL' | 'CONFLICT' | 'ADVISORY';
  message: string;
}

interface CtreKernelVerifyRepairRoundDetail {
  /** 0 = 首轮 VERIFY（含 CTRE 后）；≥1 = RE-VERIFY 轮次 */
  round: number;
  verify: {
    issueCount: number;
    fatalCount: number;
    conflictCount: number;
    advisoryCount: number;
    issues?: KernelVerifyIssueSummary[];
  };
  repair?: {
    applied?: boolean;
    skipped?: boolean;
    reason?: string;
    segmentsUpdated?: number;
    itemsApplied?: number;
  };
  recompile?: {
    skipped?: boolean;
    status?: 'success' | 'partial' | 'failed';
    score?: number;
    incrementalMerged?: boolean;
    affectedDayIndices?: number[];
  };
}

interface CtreKernelVerifyRepairLoop {
  terminatedReason?: KernelVerifyRepairTerminatedReason;
  repairCount?: number;
  maxRepairs?: number;
  /** 轮次数（= roundDetails.length） */
  rounds?: number;
  finalVerify?: { issueCount?: number; fatalCount?: number; conflictCount?: number };
  /** 轮次时间线 SSOT — 面板逐轮展示读此数组 */
  roundDetails?: CtreKernelVerifyRepairRoundDetail[];
}

interface WorkbenchCtreUiOutput {
  skipped?: boolean;
  reason?: string;
  progress?: CtreCompileProgressView;
  verifySsotApplied?: boolean;
  segmentEnrichment?: { segmentsUpdated: number; poiTagsApplied: number; routeTemplatesTagged: number };
  kernelVerifyRepairLoop?: CtreKernelVerifyRepairLoop;
  /** 兼容字段：round 0 verify / round 0 repair / 最后一轮 re-verify 摘要 */
  kernelVerify?: { issueCount?: number; fatalCount?: number; conflictCount?: number };
  kernelRepair?: CtreKernelVerifyRepairRoundDetail['repair'];
  kernelReVerify?: { issueCount?: number; fatalCount?: number; conflictCount?: number };
}
```

#### 11.13.3 面板结构建议

```
┌─ CTRE 编译 ─────────────────────────────┐
│ score / POI·Route counters（progress）   │
├─ VERIFY⇄REPAIR 闭环 ────────────────────┤
│ 状态：{terminatedReason 中文}            │
│ 修复：{repairCount}/{maxRepairs} 轮      │
├─ 轮次时间线（roundDetails.map） ────────┤
│ ● Round 0  VERIFY  issue 2 (1 conflict) │
│   └ REPAIR   ✓ segments +1              │
│   └ CTRE     partial score=88 merged    │
│ ● Round 1  RE-VERIFY  issue 0  ✓ clean  │
└─────────────────────────────────────────┘
```

**`terminatedReason` 文案映射：**

| 值 | 建议 UI |
|----|---------|
| `clean` | 验证通过 |
| `fatal` | 存在致命问题，不可自动修复 |
| `max_iterations` | 已达修复上限，仍有冲突 |
| `repair_not_applied` | 检测到问题但修复未生效 |
| `repair_disabled` | VERIFY 已跑，REPAIR 未开启 |
| `verify_skipped` | Kernel VERIFY 跳过 |

**单轮行渲染逻辑：**

```typescript
function renderRound(round: CtreKernelVerifyRepairRoundDetail) {
  const v = round.verify;
  const headline =
    round.round === 0
      ? `VERIFY · ${v.issueCount} 项`
      : `RE-VERIFY · ${v.issueCount} 项`;

  const issueRows = (v.issues ?? []).map((i) => ({
    badge: i.class, // FATAL 红 / CONFLICT 黄 / ADVISORY 灰
    text: `${i.code}: ${i.message}`,
  }));

  const repairLine = round.repair?.applied
    ? `REPAIR ✓ 更新 ${round.repair.segmentsUpdated} 段 / ${round.repair.itemsApplied} POI`
    : round.repair?.skipped
      ? `REPAIR 跳过 (${round.repair.reason})`
      : null;

  const ctreLine = round.recompile
    ? `CTRE ${round.recompile.status} score=${round.recompile.score}` +
      (round.recompile.incrementalMerged ? ' · 增量合并' : '')
    : null;

  return { headline, issueRows, repairLine, ctreLine };
}
```

#### 11.13.4 轮询与展示时机

```typescript
async function loadWorkbenchCtrePanel(taskId: string) {
  const res = await fetch(`/api/planning-workbench/tasks/${taskId}/status`);
  const body = await res.json();

  // 进行中：currentStage 即可展示条带
  setStage(body.data.currentStage);

  if (body.data.status !== 'COMPLETED') return;

  const ctre = body.data.ctre ?? body.data.result?.uiOutput?.ctre;
  if (!ctre || ctre.skipped) {
    setPanelVisible(false);
    return;
  }

  setCtreProgress(ctre.progress);
  setVerifyRepairLoop(ctre.kernelVerifyRepairLoop);
  // 轮次明细
  setRoundDetails(ctre.kernelVerifyRepairLoop?.roundDetails ?? []);
}
```

**进度百分比参考（Workbench execute）：**

| progress | currentStage 关键词 |
|----------|-------------------|
| ~92 | `CTRE 编译` |
| ~93 | `Decision Kernel VERIFY` |
| ~94 | `RE-VERIFY` / `REPAIR` / `CTRE 修复后增量重编译` |
| 95+ | `正在完成规划工作台流程` |

#### 11.13.5 与 Plan Gate / Segment Badge 联动

| 能力 | 读数 |
|------|------|
| 安全维度 `[VERIFY]` 项 | `planGate.verification.dimensions` 或 `planState.metadata.conflictArbitration` |
| POI canonical badge | `segments[].metadata.attractions[].canonical_poi_id` / `ctreResolvedPois[]` |
| 闭环是否阻塞提交 | `kernelVerifyRepairLoop.finalVerify.fatalCount > 0` → 阻塞；`terminatedReason === 'max_iterations'` → 警告 |

#### 11.13.6 响应示例（含 roundDetails）

```json
{
  "uiOutput": {
    "ctre": {
      "progress": { "status": "partial", "score": 88, "counters": { "POI": { "done": 3, "total": 3 } } },
      "verifySsotApplied": true,
      "kernelVerifyRepairLoop": {
        "terminatedReason": "clean",
        "repairCount": 1,
        "maxRepairs": 2,
        "rounds": 2,
        "finalVerify": { "issueCount": 0, "fatalCount": 0, "conflictCount": 0 },
        "roundDetails": [
          {
            "round": 0,
            "verify": {
              "issueCount": 1,
              "fatalCount": 0,
              "conflictCount": 1,
              "advisoryCount": 0,
              "issues": [{ "code": "TIME_WINDOW_OVERLAP", "class": "CONFLICT", "message": "…" }]
            },
            "repair": { "applied": true, "segmentsUpdated": 1, "itemsApplied": 2 },
            "recompile": { "status": "partial", "score": 86, "incrementalMerged": true, "affectedDayIndices": [0] }
          },
          {
            "round": 1,
            "verify": { "issueCount": 0, "fatalCount": 0, "conflictCount": 0, "advisoryCount": 0, "issues": [] }
          }
        ]
      }
    }
  }
}
```

#### 11.13.7 Checklist

- [ ] `ctre.skipped === true` → 隐藏 VERIFY⇄REPAIR 区块
- [ ] `roundDetails` 为空但 `kernelVerify` 有值 → 降级展示单轮摘要（兼容旧响应）
- [ ] `round === 0` 的 `recompile` 表示首轮 repair 后的 CTRE；最后一轮可能只有 verify、无 repair
- [ ] 勿订阅 `route_and_run` SSE  expecting `kernelVerifyRepairLoop`

### 11.14 Trip 页「结构化进度」— 操作路径与空态说明

**适用：** Trip 详情 / Plan Studio 上展示 CTRE 九阶段、counters、VERIFY⇄REPAIR 时间线（非 Explore Compare 页）。

#### 11.14.1 用户可见文案（可直接用于空态 / Tooltip）

> 要在该 Trip 上看到结构化进度：请在**规划工作台**重新「**生成方案**」。  
> 需同时满足：**前端** `VITE_TRAVEL_COMPILER_ENABLED=true`、**后端** `TRAVEL_COMPILER_ENABLED=true`（或请求体 `enable_travel_compiler: true`），且本次 execute 必须带上 **`tripId`**（与当前 Trip 一致）。  
> 生成完成后，Trip 页轮询 `GET /api/trips/:tripId/ctre/compile-progress`；进行中的细粒度文案来自 Workbench 任务 `currentStage`（`GET …/planning-workbench/tasks/:taskId/status`）。

#### 11.14.2 前置条件（缺一不可）

| 层 | 开关 / 条件 | 不满足时表现 |
|----|-------------|--------------|
| 前端 | `VITE_TRAVEL_COMPILER_ENABLED=true` | 不渲染 CTRE Panel（勿对 404 报错） |
| 后端 | `TRAVEL_COMPILER_ENABLED=true` 或 `enable_travel_compiler: true` | `uiOutput.ctre.skipped === true`，reason=`travel_compiler_disabled` |
| 请求 | `tripId` 等于当前 Trip | Graph 不落库；`GET …/ctre/*` 长期 404/空 |
| 请求 | `userAction: 'generate'` \| `'commit'` \| `'adjust'`（**非** `compare`） | 不触发 CTRE |
| 数据 | `planState.itinerary.segments.length > 0` | reason=`no_segments` |

#### 11.14.3 推荐操作流程

```text
1. .env / 部署：VITE_TRAVEL_COMPILER_ENABLED=true
2. 后端：TRAVEL_COMPILER_ENABLED=true
3. 规划工作台 →「生成方案」
   POST /api/planning-workbench/execute/async
   {
     "tripId": "<当前 Trip ID>",
     "enable_travel_compiler": true,
     "userAction": "generate",
     "context": { "destination": { "country": "Iceland" }, "days": 5 }
   }
4. 轮询 GET /api/planning-workbench/tasks/:taskId/status
   - 进行中：展示 currentStage（CTRE 编译 / Kernel VERIFY / RE-VERIFY）
   - COMPLETED：读 result.uiOutput.ctre（含 kernelVerifyRepairLoop.roundDetails）
5. Trip 页离线刷新：
   GET /api/trips/:tripId/ctre/compile-progress
   GET /api/trips/:tripId/ctre/graph?include=progress   // 可选，含 Graph
```

#### 11.14.4 Trip 页 vs Workbench 任务：读数分工

| 场景 | 数据源 | 说明 |
|------|--------|------|
| Workbench 弹层 / 生成中 | `tasks/:taskId/status` → `ctre` + `currentStage` | 含 VERIFY⇄REPAIR 轮次明细 |
| Trip 详情持久化快照 | `GET …/trips/:id/ctre/compile-progress` | 仅 compile 落库后有值；**不含**实时 task 进度 |
| Plan Gate 阻塞 | `planState.metadata.conflictArbitration` | execute 响应内 |

**常见空态：**

- execute **完成前** 调 Trip CTRE API → 404/空，**正常**  
- 从未带 `tripId` 跑过 Workbench → Trip 页永远无结构化进度，提示 §11.14.1 文案  
- 仅跑过 `compare` → CTRE 跳过，提示改用「生成方案」

#### 11.14.5 前端 gate 示例

```typescript
const compilerOn =
  import.meta.env.VITE_TRAVEL_COMPILER_ENABLED === 'true';

export function shouldShowTripCtrePanel(tripId: string | undefined): boolean {
  return compilerOn && Boolean(tripId);
}

export function ctreEmptyStateCopy(): string {
  return '要在该 Trip 上看到结构化进度，请在规划工作台重新「生成方案」，并开启旅行编译（CTRE）。';
}
```
