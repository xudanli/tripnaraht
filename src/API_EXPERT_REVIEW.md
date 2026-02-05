# API 接口专家评审报告

**评审日期**: 2026-02-03  
**评审人员**: 产品经理 + 架构师

---

## 一、当前接口总览

共发现 **45 个 API Tags**，分布在以下领域：

| 领域 | Tags 数量 | 说明 |
|------|-----------|------|
| 核心业务 | 12 | trips, places, itinerary 等 |
| Agent 智能体 | 9 | agent, planning-workbench 等 |
| 数据服务 | 8 | rag, kpu, weather 等 |
| 管理后台 | 7 | admin, training 等 |
| 辅助功能 | 5 | auth, upload, contact 等 |
| 特定场景 | 4 | iceland-info, railpass 等 |

---

## 二、建议删除的接口 🗑️

### 优先级 P0 - 立即删除

| 控制器 | 路径 | 删除原因 | 风险 |
|--------|------|----------|------|
| `iceland-info.controller.ts` | `/iceland-info` | **硬编码地区数据**，应合并到通用 weather/road 服务 | 低 |
| `places-v5.controller.ts` | `/v5/places` | **过时版本**，places.controller 已是最新 | 低 |
| `rag-metrics.controller.ts` | `/rag/metrics` | **无 ApiTags**，应合并到 rag.controller | 低 |

### 优先级 P1 - 近期删除

| 控制器 | 路径 | 删除原因 | 风险 |
|--------|------|----------|------|
| `llm.controller.ts` | `/llm` | **内部服务暴露**，LLM 应通过 Agent 统一调用，不应直接暴露 | 中 |
| `kpu.controller.ts` | `/kpu` | **内部服务暴露**，KPU 是 RAG 内部组件，应通过 rag.controller 访问 | 中 |
| `itinerary-optimization.controller.ts` | `/itinerary-optimization` | **内部服务暴露**，优化应通过 planning-workbench 调用 | 中 |
| `planning-policy.controller.ts` | `/planning-policy` | **内部服务暴露**，策略应通过 planning-workbench 调用 | 中 |

### 优先级 P2 - 评估后决定

| 控制器 | 路径 | 问题 | 建议 |
|--------|------|------|------|
| `voice.controller.ts` | `/voice` | 功能完整但**使用率低** | 保留，但移到 v2 路径 |
| `vision.controller.ts` | `/vision` | 功能完整但**使用率低** | 保留，但移到 v2 路径 |
| `railpass.controller.ts` | `/railpass` | **地区特定**（欧洲铁路通票） | 评估用户量后决定 |
| `schedule-action.controller.ts` | `/schedule` | 与 journey-assistant **功能重叠** | 合并到 journey-assistant |

---

## 三、建议保留的核心接口 ✅

### 用户端核心接口

| Tag | 路径 | 说明 | 状态 |
|-----|------|------|------|
| `trips` | `/trips` | 行程 CRUD | ✅ 核心 |
| `places` | `/places` | 地点搜索 | ✅ 核心 |
| `auth` | `/auth` | 认证授权 | ✅ 核心 |
| `users` | `/users` | 用户管理 | ✅ 核心 |
| `agent` | `/agent` | 智能体入口 | ✅ 核心 |
| `planning-workbench` | `/planning-workbench` | 规划工作台 | ✅ 核心 |
| `规划助手智能体` | `/agent/planning-assistant` | 规划对话 | ✅ 核心 |
| `行程助手智能体` | `/agent/journey-assistant` | 行程对话 | ✅ 核心 |

### AI-Native 决策系统接口

| Tag | 路径 | 说明 | 状态 |
|-----|------|------|------|
| `Decision Replay` | `/api/v1/decision-replay` | 决策回放 | ✅ 新增核心 |
| `RLHF Signals` | `/api/v1/rlhf` | 学习信号 | ✅ 新增核心 |
| `decision` | `/decision` | 决策系统 | ✅ 核心 |
| `readiness` | `/readiness` | 就绪评估 | ✅ 核心 |

### 管理后台接口

| Tag | 路径 | 说明 | 状态 |
|-----|------|------|------|
| `admin` | `/admin/*` | 管理接口 | ✅ 保留 |
| `agent-admin` | `/agent/admin` | Agent 管理 | ✅ 保留 |
| `training` | `/training` | 训练数据 | ✅ 保留 |

---

## 四、架构优化建议 🏗️

### 1. 接口分层重构

```
/api/v1/                    # 用户端 API（需认证）
├── /trips                  # 行程
├── /places                 # 地点
├── /agent                  # 智能体
│   ├── /route_and_run     # 统一入口
│   ├── /planning-assistant # 规划助手
│   └── /journey-assistant  # 行程助手
├── /decision-replay        # 决策回放
└── /rlhf                   # RLHF 信号

/api/internal/              # 内部 API（服务间调用）
├── /llm                    # LLM 服务
├── /kpu                    # KPU 服务
├── /rag                    # RAG 服务
└── /optimization           # 优化服务

/api/admin/                 # 管理后台 API
├── /agent                  # Agent 管理
├── /training               # 训练管理
├── /data-quality           # 数据质量
└── /conversation           # 会话管理
```

### 2. 合并冗余接口

| 当前 | 合并到 | 说明 |
|------|--------|------|
| `/iceland-info/weather` | `/weather` | 通用天气服务 |
| `/iceland-info/road-conditions` | `/route-directions/road-status` | 通用路况服务 |
| `/schedule/apply-action` | `/agent/journey-assistant` | 统一行程操作 |
| `/v5/places` | `/places` | 删除旧版本 |

### 3. 认证策略统一

**问题**: 大量接口使用 `@Public()` 装饰器，存在安全风险

**建议**:
- 用户端 API: 强制 JWT 认证
- 管理后台 API: JWT + RBAC
- 内部 API: 服务间认证 (API Key / mTLS)
- 健康检查: 公开

---

## 五、执行计划

### Phase 1: 立即执行 (本周) ✅ 已完成

- [x] 删除 `execution.controller.ts` ✅
- [x] 删除 `trip-detail.controller.ts` ✅
- [x] 删除 `trip-planner.controller.ts` ✅
- [x] 删除 `iceland-info.controller.ts` ✅ (服务保留，被其他模块使用)
- [x] 删除 `places-v5.controller.ts` ✅
- [x] 合并 `rag-metrics.controller.ts` 到 `rag.controller.ts` ✅

### Phase 2: 近期执行 (2 周内) ✅ 已完成

- [x] 标记 `/llm` 为内部接口 `[Internal] LLM Service` ✅
- [x] 标记 `/kpu` 为内部接口 `[Internal] KPU Service` ✅
- [x] 标记 `/itinerary-optimization` 为内部接口 ✅
- [x] 标记 `/planning-policy` 为内部接口 ✅
- [x] 标记 `/schedule` 为内部接口（计划合并到 journey-assistant）✅

### Phase 2.5: 内部接口控制器删除 (2026-02-03) ✅ 已完成

- [x] 删除 `llm.controller.ts` - 服务保留供内部调用 ✅
- [x] 删除 `kpu.controller.ts` - 服务保留供内部调用 ✅
- [x] 删除 `itinerary-optimization.controller.ts` - 服务保留供内部调用 ✅
- [x] 删除 `planning-policy.controller.ts` - 服务保留供内部调用 ✅
- [x] 删除 `schedule-action.controller.ts` - 服务保留供内部调用 ✅

**删除代码量**: ~58 KB（5 个控制器文件）

### Phase 2.6: Route-Directions 接口优化 (2026-02-03) ✅ 已完成

- [x] 标记 `GET /route-directions/cards` 为废弃 → 使用 `interactions` ✅
- [x] 标记 `GET /route-directions/:id/card` 为废弃 → 使用 `/:id` 或 `interactions` ✅
- [x] 标记 `GET /route-directions/observability/*` 为内部接口 ✅

**产品经理决策理由**：
- `cards` 与 `interactions` 功能重叠，后者提供更完整信息（分数+解释+whyNotOthers）
- `:id/card` 与 `/:id` 重复，无需额外卡片接口
- `observability` 是调试接口，不应暴露给用户

### Phase 2.7: Flight-Prices 接口优化 (2026-02-03) ✅ 已完成

- [x] 标记 `GET /flight-prices` 为管理接口 `[Admin]` ✅
- [x] 标记 `GET /flight-prices/:id` 为管理接口 `[Admin]` ✅
- [x] 标记 `POST /flight-prices` 为管理接口 `[Admin]` ✅
- [x] 标记 `PUT /flight-prices/:id` 为管理接口 `[Admin]` ✅
- [x] 标记 `DELETE /flight-prices/:id` 为管理接口 `[Admin]` ✅
- [x] 标记 `GET /flight-prices/day-of-week-factors` 为管理接口 `[Admin]` ✅

**产品经理决策理由**：
- CRUD 接口是数据管理功能，普通用户不应直接操作价格数据
- `day-of-week-factors` 是配置数据，可合并到估算响应或移到 admin
- 用户端保留：`estimate`、`details`、`domestic/*`、`predict` 等查询接口

### Phase 2.8: Itinerary-Items 接口优化 (2026-02-03) ✅ 已完成

- [x] 标记 `POST /itinerary-items/trip/:tripId/fix-dates` 为管理接口 `[Admin]` ✅

**产品经理决策理由**：
- `fix-dates` 是数据修复/维护接口，普通用户不应访问
- 该模块其他接口设计良好，无功能冗余

### Phase 2.9: Places 接口优化 (2026-02-03) ✅ 已完成

**标记为废弃的重复接口（5 个）**：
- [x] `POST /places` → 使用 `POST /places/admin` ✅
- [x] `PUT /places/:id` → 使用 `PUT /places/admin/:id` ✅
- [x] `DELETE /places/:id` → 使用 `DELETE /places/admin/:id` ✅
- [x] `POST /places/batch` → 使用 `POST /places/admin/batch` ✅
- [x] `GET /places/recommendations` → 功能未实现，使用 `/search/semantic` ✅

**已删除的数据导入接口（5 个）**：
- [x] `POST /places/attractions/:id/enrich` - 高德数据增强 🗑️ 已删除
- [x] `POST /places/attractions/batch-enrich` - 批量数据增强 🗑️ 已删除
- [x] `GET /places/overpass/:countryCode` - Google Places 数据获取 🗑️ 已删除
- [x] `POST /places/overpass/iceland/import` - 冰岛数据导入 🗑️ 已删除
- [x] `POST /places/nature-poi/import` - 自然 POI 导入 🗑️ 已删除

**产品经理决策理由**：
- 重复的 CRUD 接口造成维护负担和前端困惑
- 数据导入接口是管理功能，不应暴露为 REST API，应通过脚本或后台管理系统执行
- 未实现的功能应明确标记为废弃
- 代码减少约 365 行

### Phase 3: 中期执行 (1 月内)

- [ ] 完成接口分层重构
- [ ] 统一认证策略
- [ ] 生成新版 API 文档
- [ ] 删除已废弃的 route-directions 接口（cards、:id/card）

---

## 六、实际收益（已完成）

| 指标 | 清理前 | Phase 1 后 | Phase 2.5 后 | 改善 |
|------|--------|------------|--------------|------|
| 删除的控制器 | 0 | 6 个 | 11 个 | +5 |
| 删除的代码 | 0 | ~43 KB | ~101 KB | +58 KB |
| 用户端 API Tags | ~45 | ~34 | ~29 | -36% |
| 内部 API Tags | 0 | 5 | 0 | 完全移除 |
| Swagger 文档清晰度 | 低 | 中 | 高 | ⬆️⬆️ |

### Phase 2.5 删除统计

| 控制器 | 路径 | 代码量 | 状态 |
|--------|------|--------|------|
| `llm.controller.ts` | `/llm` | ~12 KB | ❌ 已删除 |
| `kpu.controller.ts` | `/kpu` | ~10 KB | ❌ 已删除 |
| `itinerary-optimization.controller.ts` | `/itinerary-optimization` | ~4 KB | ❌ 已删除 |
| `planning-policy.controller.ts` | `/planning-policy` | ~25 KB | ❌ 已删除 |
| `schedule-action.controller.ts` | `/schedule` | ~7 KB | ❌ 已删除 |

---

## 七、专家意见汇总

### 产品经理观点 🎯

> "用户只需要核心的 trips、places、agent 接口。内部服务（llm、kpu、rag）不应该直接暴露给前端，这会造成：
> 1. 前端开发困惑（不知道该调哪个）
> 2. 安全风险（内部服务被滥用）
> 3. 文档维护负担
> 
> 建议将用户接口控制在 10-15 个 Tags 以内。"

### 架构师观点 🏛️

> "当前架构存在几个问题：
> 1. **职责不清**: `iceland-info` 是硬编码的地区服务，应该抽象为通用服务
> 2. **版本混乱**: `places` 和 `places-v5` 同时存在，应该统一
> 3. **内部服务外泄**: `llm`、`kpu` 是内部组件，不应该有独立的外部接口
> 4. **认证不一致**: 大量 `@Public()` 接口，生产环境有安全隐患
>
> 建议按照 `/api/v1`、`/api/internal`、`/api/admin` 三层架构重构。"

---

**是否执行 Phase 1 清理？** 请确认后我将执行删除操作。
