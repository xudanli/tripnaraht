# 副作用规则集 & 策略实验室 — 响应字段 → 前端映射

> 对应前端服务（仓库外）  
> - `src/services/decision-side-effect-params.ts` — SideEffect 规则 CRUD  
> - `src/services/policy-lab-admin.ts` — Hold / Saga / 预演  
>
> BFF 前缀见各表；后端代理路径为 `/api` 全局前缀下的 Nest 路由。

---

## 0. 通用约定

### 0.1 认证

| 模块 | 后端 Guard | 前端要求 |
|------|------------|----------|
| `.../side-effect-params/rules/*` | `@Public()`（可不带头） | BFF 若统一加 Bearer 亦可 |
| `/api/admin/holds/*`、`/api/admin/saga/*`、`/api/admin/simulate/*` | `AdminStrictAuthGuard` | **必须** `Authorization: Bearer <accessToken>`（ADMIN/OPERATOR） |

### 0.2 两套成功标记（勿混用）

| API 族 | 成功判断 | 数据位置 |
|--------|----------|----------|
| SideEffect **规则** `/rules/*` | `ok === true` | `rules` / `rule` / `schema` 等顶层字段 |
| **参数治理** `/side-effect-params`（非本页） | `ok === true` | `overrides`, `revision` |
| **策略实验室** `/admin/*` | 多数 `ok === true`；预演用 `status === 'OK'` | 见下文各表 |
| Context admin（无关本页） | `success === true` | `data.*` |

### 0.3 建议：统一解包函数（`decision-side-effect-params.ts`）

```typescript
/** BFF 可能包 data；直连后端则为顶层 rules */
export function unwrapRulesList(body: unknown): SideEffectRuleRow[] {
  if (!body || typeof body !== 'object') return [];
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.rules)) return o.rules as SideEffectRuleRow[];
  const d = o.data;
  if (Array.isArray(d)) return d as SideEffectRuleRow[];
  if (d && typeof d === 'object') {
    const inner = d as Record<string, unknown>;
    if (Array.isArray(inner.rules)) return inner.rules as SideEffectRuleRow[];
    if (Array.isArray(inner.items)) return inner.items as SideEffectRuleRow[];
    if (Array.isArray(inner.data)) return inner.data as SideEffectRuleRow[];
  }
  return [];
}
```

---

## 1. `decision-side-effect-params.ts` — SideEffect 规则

### 1.1 类型定义（建议与后端对齐）

```typescript
export type SideEffectRuleRow = {
  rule_kind?: 'side_effect' | 'hard_truth'; // 列表默认 side_effect；scope=all 时才有
  id: string;
  action_name: string;
  handler_id: string;
  params: Record<string, unknown>;
  updated_at: string; // ISO
};

export type SideEffectRuleDetail = SideEffectRuleRow & {
  is_active: boolean;
};

export type RuleMetaOption = { value: string; label: string };

export type RuleSchemaResponse = {
  ok: boolean;
  schema_version: string;
  updated_at: string;
  action_name: string;
  handler_id: string;
  schema?: Record<string, unknown>;
  error?: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: Array<{ field: string; reason: string }>;
  };
};
```

### 1.2 规则列表 / 刷新

| 项 | 值 |
|----|-----|
| 服务函数 | `listSideEffectRules()` 或等价 |
| HTTP | `GET /api/agent/actions/decision-rules/side-effect-params/rules` |
| Query | `scope?: 'side_effect' \| 'hard_truth' \| 'all'`（默认 `side_effect`） |

**响应 → UI**

| 后端字段 | 类型 | 建议组件 / state |
|----------|------|------------------|
| `ok` | boolean | `loadError = !ok`；toast |
| `rules` | `SideEffectRuleRow[]` | `RulesTable.dataSource` |
| `rules[].id` | string | 行 key、`onRowClick` → 详情 |
| `rules[].action_name` | string | 列「动作」、筛选 |
| `rules[].handler_id` | string | 列「Handler」 |
| `rules[].params` | object | 列「参数」JSON 摘要 / 展开 |
| `rules[].updated_at` | string | 列「更新时间」 |
| `rules[].rule_kind` | string? | 仅 `scope=all` 时展示标签 |
| `message` | string? | `ok===false` 时 Empty 说明 |

**表格行 → 详情路由**

```
/rules/:id  → GET .../rules/:id  → RuleDetailDrawer.rule
```

### 1.3 新建/编辑 — 下拉 Meta

| 项 | 值 |
|----|-----|
| HTTP | `GET .../rules/meta` |

| 后端字段 | UI |
|----------|-----|
| `action_names[]` | `Select.options`（`value` / `label`） |
| `handler_ids[]` | `Select.options` |
| `schema_version` | 表单版本角标（可选） |

### 1.4 按动作 + Handler 拉 Schema

| 项 | 值 |
|----|-----|
| HTTP | `GET .../rules/schema?action_name=&handler_id=` |

| 后端字段 | UI |
|----------|-----|
| `ok` | 为 false 时禁用「发布」并展示 `error.details` |
| `schema` | JSON Schema Form / 动态表单字段（如 `ttl_seconds`, `hold_ratio`） |
| `schema.properties.*` | 表单项类型、min/max、required |

**金融 Hold**（`side_effect.financial_hold.book_flight_v1`）：仅允许 `ttl_seconds`、`hold_ratio`，无额外 key。

### 1.5 查看单条

| 项 | 值 |
|----|-----|
| HTTP | `GET .../rules/:id` |

| 后端字段 | UI |
|----------|-----|
| `rule` | `null` → 404 Empty |
| `rule.is_active` | 状态 Tag「生效 / 已停用」 |
| `rule.params` | 只读 JSON 编辑器 |

### 1.6 发布 / 覆盖（Upsert）

| 项 | 值 |
|----|-----|
| HTTP | `POST .../rules` |
| Body | `{ action_name, handler_id, params }` |

| 后端字段 | UI |
|----------|-----|
| `ok` | 成功关闭弹窗、刷新列表 |
| `rule.id` | 编辑态回写 id |
| `error.code === 'VALIDATION_ERROR'` | 表单字段级错误 `error.details[]` |

### 1.7 停用 / 删除

| 项 | 值 |
|----|-----|
| HTTP | `DELETE .../rules/:id` |

| 后端字段 | UI |
|----------|-----|
| `deleted` | `true` → 从列表移除或标灰 |
| `ok` | toast「已停用」 |

> 软删除：`is_active=false`，列表接口默认仍可能返回 inactive 行，取决于 `scope`；详情 `GET` 仍可见 `is_active: false`。

---

## 2. `policy-lab-admin.ts` — 策略实验室

### 2.1 顶部摘要 — 活跃 Hold

| 项 | 值 |
|----|-----|
| HTTP | `GET /api/admin/holds/active` |
| 并行 | 与规则列表加载时一起 `Promise.all` |

| 后端字段 | 建议 UI prop |
|----------|----------------|
| `ok` | — |
| `holds` | `PolicyLabHeader.activeHolds` |
| `holds.length` | **活跃 Hold 数** KPI |
| `holds[].hold_id` | 表格行 id |
| `holds[].trip_id` | 链到行程 / 审计筛选 |
| `holds[].action_name` | 列文案 |
| `holds[].expires_at` | 倒计时 / 列 |
| `holds[].remaining_ttl_ms` | 若存在：剩余 TTL 展示 |
| `holds[].amount` / `currency` | 金额列（DB 可能为空） |

### 2.2 顶部摘要 — 24h 阻断统计（客户端聚合）

| 项 | 值 |
|----|-----|
| HTTP | `GET /api/admin/saga/logs?take=150` |
| 说明 | 后端返回原始日志；**统计在前端**解析 |

| 后端字段 | 聚合 → UI |
|----------|-----------|
| `rows` | `SagaStatsPanel.logs` |
| `total` | 分页总数（非 KPI 分母时可忽略） |
| `enabled` | DB 未启用时 Banner |
| `db_connected` | 连接状态指示 |
| `rows[].status` | 计数：`FAILED`、`COMMITTED` 等 |
| `rows[].payload.realized_state.side_effects_ledger[]` | 解析 `APPLY_FAILED` / `COMPENSATION_FAILED` / `MANUAL_INTERVENTION_REQUIRED` |
| `rows[].evidence_requirement_context` | 证据门控相关阻断（控制器已提升到行顶） |
| `rows[].failedAt` / `updatedAt` | 24h 窗口过滤（客户端按 ISO 时间） |

**建议 KPI 计算（示例）**

```typescript
function computeBlockStats(rows: SagaLogRow[]) {
  const blocked = rows.filter((r) =>
    r.status === 'FAILED' ||
    ledgerHas(r, 'APPLY_FAILED') ||
    ledgerHas(r, 'MANUAL_INTERVENTION_REQUIRED'),
  );
  return { blocked24h: blocked.length, sampleSize: rows.length };
}
```

### 2.3 审计侧栏 — 按 Request / Trip

| 项 | 值 |
|----|-----|
| HTTP | `GET /api/admin/saga/logs?tripId={id}&take=120` |
| 可选 | `status`, `hasApplyFailed`, `hasCompensationFailed` 等（见 `AdminSagaLogsQueryDto`） |

| 后端字段 | UI |
|----------|-----|
| `rows[].id` | 审计时间线 id |
| `rows[].requestId` | 展示 Request ID |
| `rows[].tripId` | 与搜索框一致 |
| `rows[].actionName` | 动作名 |
| `rows[].status` | 状态 Chip |
| `rows[].lastError` | 错误摘要 |
| `rows[].payload` | 展开 JSON / 链路到 compare API（高级） |

### 2.4 规则预演弹窗

| 项 | 值 |
|----|-----|
| HTTP | `POST /api/admin/simulate/preview` |
| Body | `ActionPreviewRequestDto` |

**请求 Body → 表单**

| 字段 | 必填 | UI 来源 |
|------|------|---------|
| `request_id` | ✓ | 生成 `preview_${Date.now()}` |
| `trip_id` | ✓ | 当前行程 / 审计 tripId |
| `execution_mode` |  | `ADVICE_ONLY`（默认） |
| `actions[]` | ✓* | 弹窗 JSON 或从当前规则构造 |
| `actions[].action_name` |  | 与规则页一致 |
| `actions[].action_type` | ✓ | BOOK / CANCEL / … |
| `actions[].target_type` | ✓ | **必须** `FLIGHT\|HOTEL\|ACTIVITY\|TRANSPORT\|ITINERARY`（勿用 `TRIP`） |
| `actions[].target_ref` |  | 可选 |
| `action_plan` |  | 与 `actions` 二选一 |

**响应 → 预演结果面板**

| 后端字段 | UI |
|----------|-----|
| `status` | `'OK' \| 'FAILED' \| 'PARTIAL'` — 主状态色 |
| `message` | 顶部 Alert |
| `requires_confirmation_count` | KPI |
| `high_risk_count` | KPI |
| `action_previews[]` | 结果列表 |
| `action_previews[].action_id` | 行 id |
| `action_previews[].status` | `feasible` / `blocked` / `requires_confirmation` |
| `action_previews[].preconditions[]` | 前置条件表格（`code`, `severity`, `message`） |
| `action_previews[].shadow_delta` | 资源影子变更 JSON |
| `action_previews[].side_effects[]` | SideEffect 预览（与规则 params 对照） |
| `action_previews[].context_signature` | 高级：只读指纹 |
| `blocked_actions` | 被拦动作列表 |

---

## 3. 页面加载时序（推荐）

```text
SideEffectRulesPage mounted
  ├─ GET .../rules              → RulesTable
  ├─ GET .../rules/meta         → 缓存 dropdown（可与列表并行）
  ├─ GET /admin/holds/active    → Header KPI（需 Bearer）
  └─ GET /admin/saga/logs?take=150 → Header 统计（需 Bearer）

用户打开「新建/编辑」
  ├─ meta 已有 → Select
  └─ onChange(action, handler) → GET .../schema → 动态表单

用户「发布」
  └─ POST .../rules → 刷新 GET .../rules

用户「停用」
  └─ DELETE .../rules/:id → 刷新列表

用户打开「预演」
  └─ POST /admin/simulate/preview → PreviewDialog
```

---

## 4. 与「副作用参数治理」页对照（勿混接口）

| 能力 | 规则集页（本文） | 参数治理页 `side-effect-params` |
|------|------------------|-----------------------------------|
| 列表 | `GET .../rules` → `rules[]` | `GET .../side-effect-params` → `overrides` 树 |
| 增量 | `POST .../rules`（整行 upsert） | `POST .../patch` |
| 全量 | — | `POST .../replace` |
| 同步 DB | — | `POST .../sync-from-db` |
| DB 行 CRUD | `POST/DELETE .../rules` | `persist_to_db` 在 patch/replace 上 |

规则页 **DB 写入**走 `POST .../rules`（Prisma `DecisionRuleConfig`）；参数页走内存快照 + patch/replace。发布后若需运行时立即生效，可提示运维执行参数页的 **sync-from-db**（或依赖 resolver 热更新逻辑）。

---

## 5. 常见前端问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 规则列表永远空 | 只读 `data.rules`，直连后端实际是 `rules` | 用 `unwrapRulesList()` |
| Saga / Hold 全 401 | 未带 ADMIN Token | BFF 转发 `Authorization` |
| 预演 400 target_type | 传了 `TRIP` | 改为 `ITINERARY` 等枚举 |
| 预演无 `ok: true` | 正常；看 `status === 'OK'` | 勿用 Context 的 `success` 判断 |
| Meta 有 `__admin__.*` | 补偿/证据/重试策略行 | 列表 `scope=side_effect` 可隐藏或分 Tab |

---

## 6. 策略实验室侧边栏三项（`/admin/*`，`policy-lab-admin.ts` / `quality-marks-admin.ts`）

> **与决策中心「副作用规则集」不同**：本区走 `/api/admin/rules*`，不是 `/api/agent/actions/decision-rules/side-effect-params/rules`。

### 6.1 规则配置 → `/admin/policy-lab/rules`

| 功能 | HTTP | 成功标记 | 列表字段 |
|------|------|----------|----------|
| DB 规则列表 | `GET /api/admin/rules?take=&skip=&actionName=&handlerId=&active=` | **无顶层 `ok`** | `rows`, `total`（Prisma 行：`actionName`, `handlerId`, `params`, `isActive`, `updatedAt`） |
| 生效规则视图 | `GET /api/admin/rules/effective` | **无顶层 `ok`** | `revision`, `total`, `rows[]`（含 `baseParams`, `overrideParams`, `effectiveParams`, `status`） |
| 单条增量 | `POST /api/admin/rules/patch` | `ok: true` | body: `{ action_name, handler_id, params?, is_active? }` → `merged`, `deactivated` |
| 批量替换 | `POST /api/admin/rules/batch-replace` | `ok: true` | body: `{ pack, deactivate_unlisted? }` → `upserted`, `deactivated` |

```typescript
export function unwrapAdminListPayload(body: unknown): { rows: any[]; total: number } {
  if (!body || typeof body !== 'object') return { rows: [], total: 0 };
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.rows)) return { rows: o.rows, total: Number(o.total ?? o.rows.length) };
  const d = o.data;
  if (d && typeof d === 'object') {
    const inner = d as Record<string, unknown>;
    if (Array.isArray(inner.rows)) return { rows: inner.rows, total: Number(inner.total ?? inner.rows.length) };
    if (Array.isArray(inner.items)) return { rows: inner.items, total: Number(inner.total ?? inner.items.length) };
  }
  return { rows: [], total: 0 };
}
```

### 6.2 质检台 → `quality-marks-admin.ts`

| 功能 | HTTP | 响应 |
|------|------|------|
| 列表 | `GET /api/admin/quality/marks?take=&skip=&target_type=&label=` | `{ ok, total, rows[] }` — 行字段 snake_case：`created_at`, `target_type`, `target_id`, `label`, `comment`, `meta` |
| 扫描 | `POST /api/admin/quality/marks/scan` | `{ ok, source, since, rows, marks_created }` |
| 详情 | `GET /api/admin/quality/marks/:id` | `{ ok, row }` |
| 新建 | `POST /api/admin/quality/marks` | `{ ok, id }` — body: `target_type` ∈ `DECISION_LOG` \| `SAGA_LOG` |
| 更新 | `PATCH /api/admin/quality/marks/:id` | `{ ok, id }` |

### 6.3 本体与仿真 → `policy-lab-admin.ts`

| 功能 | HTTP | 响应 → UI |
|------|------|-----------|
| 动作目录 | `GET /api/admin/ontology/actions` | `{ ok, actions[], side_effect_handlers[] }` |
| 本体断言 | `GET /api/admin/ontology/assertions` | `{ ok, snapshot, rows[] }` |
| 预演 | `POST /api/admin/simulate/preview` | **`status === 'OK'`**；`action_previews`, `requires_confirmation_count`, `high_risk_count` |

### 6.4 运维区（Holds / Saga）

| 页面 | HTTP | 要点 |
|------|------|------|
| Holds | `GET /api/admin/holds/active` | `{ ok, holds[] }` |
| Holds 释放 | `DELETE /api/admin/holds/:holdId` | `{ ok, hold_id }` |
| Saga 列表 | `GET /api/admin/saga/logs?take=&tripId=` | `{ rows, total, enabled, db_connected }`（无 `ok`） |
| Saga 指标 | `GET /api/admin/saga/logs/metrics?take=` | `{ ok, overview, daily_trend, ... }` |
| Saga 详情 | `GET /api/admin/saga/logs/:id` | `{ ok, log, evidence_requirement_context }` |

---

## 7. 后端源码索引

| 能力 | 文件 |
|------|------|
| 决策中心规则 CRUD | `src/agent/actions.controller.ts`（`decision-rules/side-effect-params/rules*`） |
| 策略实验室 admin | `src/admin/controllers/agent-ops-admin.controller.ts` |
| 预演 DTO | `src/agent/dto/action-execution.dto.ts` |
| 决策中心规则 Upsert | `src/agent/dto/side-effect-rule-row.dto.ts` |
| Policy Lab 规则 patch/replace | `src/admin/dto/agent-ops-admin.dto.ts` |
| 质检标注 | `src/admin/dto/admin-quality.dto.ts` |
