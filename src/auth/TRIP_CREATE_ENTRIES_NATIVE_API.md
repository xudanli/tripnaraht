# Web 创建行程入口 — App Native 对接文档

> **适用：** 与 Web `/plan/start`「你准备怎么开始？」对齐的 Native 新建行程  
> **Global prefix：** `/api`  
> **鉴权：** 均需 `Authorization: Bearer <accessToken>`（除特别标注）  
> **Base URL（真机联调）：** `http://192.168.8.153:8080/api`  
> **最后更新：** 2026-07-08

---

## 0. 总览：两条创建路径

Native 新建行程对接 **Exploration** 与 **Guide-to-Plan** 两条 API 管线，**不要混用**。

| Hub | 产品文案（Web） | 前端路由 | API 根路径 | **Trip 何时创建** | 初始 `Trip.status` |
|-----|----------------|----------|------------|-------------------|-------------------|
| **①** | 告诉 AI 我想去哪 | `/explore` | `/api/exploration` | `POST .../materialize` 或 `PUT .../principles`（lazy） | `PLANNING`（物化后） |
| **②** | 从攻略开始规划 | `/guide-to-plan` | `/api/guide-to-plan` | `POST .../accept` 接受草案 | `PLANNING` |

**Native 选型建议：**

| 目标 | 推荐入口 |
|------|----------|
| 对齐 Web「从攻略开始规划」 | **②** Guide-to-Plan |
| 对齐 Web「告诉 AI 我想去哪」 | **①** Exploration |

---

## 1. 入口 ① — 告诉 AI 我想去哪（Exploration）

**完整文档：** [`src/trips/exploration/EXPLORATION_API.md`](../trips/exploration/EXPLORATION_API.md)  
**前端集成：** [`internal-docs/exploration/frontend-integration-guide.md`](../../internal-docs/exploration/frontend-integration-guide.md)

### 1.1 流程

```
POST /exploration/scenarios          → 创建 Scenario（此时通常尚无 tripId）
    ↓
PUT  /exploration/scenarios/:id/principles   → 保存原则（可 lazy materialize → 产生 tripId）
    或
POST /exploration/scenarios/:id/materialize  → 显式物化 Trip 壳
    ↓
POST /exploration/scenarios/:id/candidates   → 生成路线候选
POST /exploration/scenarios/:id/selections   → 选路线
POST /exploration/scenarios/:id/check        → 可行性检查
... 修复 / apply / revalidate ...
```

### 1.2 关键接口

#### 创建 Scenario（Hub ① 首屏）

```
POST /api/exploration/scenarios
Authorization: Bearer <token>
Content-Type: application/json
```

**Consumer 模式（用户填条件）：**

```json
{
  "destinationCodes": ["IS"],
  "dateRange": { "startDate": "2026-09-10", "endDate": "2026-09-18" },
  "travelers": [{ "type": "ADULT" }, { "type": "ADULT" }],
  "budget": { "currency": "USD", "min": 3000, "max": 4000 },
  "mobilityContext": { "vehicleType": "4WD_SUV" }
}
```

**Research 模式（固定 protocol，覆盖用户输入）：**

```json
{
  "researchProtocolId": "iceland-discovery-v1"
}
```

**响应 `data`（节选）：**

```json
{
  "scenarioId": "uuid",
  "sessionId": "uuid",
  "tripId": null,
  "materializationStatus": "DRAFT",
  "assignedVariant": "THREE_ROUTE_COMPARISON",
  "lockedFields": ["destinationCodes", "dateRange"],
  "scenario": { "...旅行条件视图..." }
}
```

#### 物化 Trip（显式）

```
POST /api/exploration/scenarios/{scenarioId}/materialize
```

**响应 `data`：**

```json
{
  "scenarioId": "uuid",
  "tripId": "uuid",
  "tripVersion": 1,
  "decisionContractVersion": 1,
  "materialized": true,
  "idempotentReplay": false
}
```

> `PUT .../principles` 也可能触发 lazy materialize，响应中带 `tripId`。以 Scenario 详情 `GET .../scenarios/:id` 为准。

### 1.3 环境 Gate

需服务端开启：`EXPLORATION_CONSUMER_MVP_ENABLED=1`、`DECISION_GATEWAY_UNIFIED=1` 等（见 Exploration API 文档 §环境 Gate）。

### 1.4 Native 注意

- 探索链路 **长流程**（原则 → 路线 → 检查 → 修复），不适合一个 API 完成创建。
- `contextId === scenarioId`（Travel Context Protocol）。
- 拿到 `tripId` 后，列表/详情走 [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md)。

---

## 2. 入口 ② — 从攻略开始规划（Guide-to-Plan）

**完整文档：** [`src/guide-to-plan/GUIDE_TO_PLAN_API.md`](../guide-to-plan/GUIDE_TO_PLAN_API.md)

### 2.1 流程（多步向导，非 Tab 表单）

```
POST /guide-to-plan/sessions
    ↓
POST .../import | /import/file | /import/screenshot   （可多次）
    ↓
POST .../parse/async  →  GET .../parse/status | /parse/stream
    ↓
GET  .../understanding
    ↓
PATCH .../travel-context
    ↓
POST .../generate  →  GET .../plan-candidates
    ↓
POST .../accept  ← 【此处才创建正式 Trip】
```

### 2.2 关键接口

#### 创建会话

```
POST /api/guide-to-plan/sessions
```

```json
{
  "countryCode": "IS",
  "destination": "冰岛南岸"
}
```

**响应 `data`：** `GuideToPlanSessionView`（含 `resumeRoute` 用于恢复步骤）

| resumeRoute | 含义 |
|-------------|------|
| `import` | 导入页 |
| `parse_progress` | 解析中 |
| `understanding` | 理解摘要 |
| `travel_context` | 出行条件 |
| `draft` | 草案对比 |
| `trip` | 已接受 |

#### 接受草案 → 创建 Trip

```
POST /api/guide-to-plan/sessions/{sessionId}/accept
```

```json
{
  "planCandidateId": "uuid",
  "acceptanceMode": "accept_all"
}
```

| acceptanceMode | 行为 |
|----------------|------|
| `accept_all` | 直接创建 Trip + 写入行程项 |
| `keep_faithful` | 按 FAITHFUL 变体重生成后落地 |
| `review_items` | **不创建 Trip**；返回逐项确认列表 |

**成功响应 `data`（节选）：**

```json
{
  "sessionId": "uuid",
  "planCandidateId": "uuid",
  "status": "accepted",
  "tripId": "uuid",
  "itemCount": 12,
  "message": "已创建正式行程 ..."
}
```

### 2.3 Native 注意

- **草案 ≠ Trip**：`itineraryDraft` 在 accept 前不落正式行程表。
- 解析进度 SSE：`GET .../parse/stream` 需 Bearer，**不能用**原生 `EventSource`（无 Header）。
- 恢复未完成会话：`GET /guide-to-plan/sessions?status=...`，读 `resumeRoute`。

---

## 3. 两条路径对照

| 维度 | ① Exploration | ② Guide-to-Plan |
|------|---------------|-----------------|
| 输入 | 目的地/条件/原则 | 攻略链接/截图/文字 |
| 会话 ID | `scenarioId` | `sessionId` |
| Trip 创建点 | materialize / lazy | **accept** |
| 初始 status | PLANNING | PLANNING |
| 是否有行程项 | 选路/修复后逐步 | accept 后写入 |
| 典型步数 | 8+ 屏 | 6+ 屏 |

---

## 4. 创建完成后统一动作

无论哪条入口，拿到 `tripId` 后 Native 共用：

```
GET  /api/trips/list              → 首页刷新
GET  /api/trips/{tripId}          → 详情
GET  /api/users/me                → 会话校验
```

列表卡片展示见 [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md) §2（`displayStatus` / `primaryAction`）。

---

## 5. curl smoke test

```bash
BASE=http://192.168.8.153:8080/api
TOKEN=<accessToken>

# ② Guide 会话
curl -s -X POST "$BASE/guide-to-plan/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"countryCode":"IS"}'

# ① Exploration
curl -s -X POST "$BASE/exploration/scenarios" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destinationCodes":["IS"],"dateRange":{"startDate":"2026-09-10","endDate":"2026-09-18"}}'
```

---

## 6. 相关文档

| 文档 | 说明 |
|------|------|
| [`TRIPS_NATIVE_API.md`](./TRIPS_NATIVE_API.md) | 列表 / 详情 |
| [`GUIDE_TO_PLAN_API.md`](../guide-to-plan/GUIDE_TO_PLAN_API.md) | 攻略规划全量接口 |
| [`EXPLORATION_API.md`](../trips/exploration/EXPLORATION_API.md) | 探索规划全量接口 |
| [`internal-docs/exploration/frontend-integration-guide.md`](../../internal-docs/exploration/frontend-integration-guide.md) | Hub ① 页面流 |
| [`EMAIL_AUTH_NATIVE_API.md`](./EMAIL_AUTH_NATIVE_API.md) | 登录（所有入口前置） |
