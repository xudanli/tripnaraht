# 前端用户系统与后端管理系统 API 对接指南

> 更新时间: 2026-01-21

本文档明确了前端用户系统和后端管理系统各自需要对接的 API 接口。

---

## 目录

- [一、前端用户系统 API](#一前端用户系统-api) (18 模块, ~90+ 端点)
  - 认证、用户、行程、地点、交通、RAG 知识检索等
- [二、后端管理系统 API](#二后端管理系统-api) (11 模块, ~65+ 端点)
  - Agent 管理、训练管理、RAG 知识库管理、LLM 管理等
- [三、共享 API（两端都可使用）](#三共享-api两端都可使用)
- [四、内部服务 API（不对外暴露）](#四内部服务-api不对外暴露)

---

## 一、前端用户系统 API

前端用户系统面向终端用户，提供行程规划、查询等功能。

### 1.1 认证相关 `/api/auth`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/auth/login` | POST | 用户登录 |
| `/auth/register` | POST | 用户注册 |
| `/auth/logout` | POST | 退出登录 |
| `/auth/refresh` | POST | 刷新 Token |
| `/auth/me` | GET | 获取当前用户信息 |

### 1.2 用户相关 `/api/users`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/users/profile` | GET | 获取用户资料 |
| `/users/profile` | PUT | 更新用户资料 |
| `/users/preferences` | GET | 获取用户偏好设置 |
| `/users/preferences` | PUT | 更新用户偏好设置 |

### 1.3 行程相关 `/api/trips`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/trips` | POST | 创建新行程 |
| `/trips` | GET | 获取我的行程列表 |
| `/trips/:id` | GET | 获取行程详情 |
| `/trips/:id` | PUT | 更新行程 |
| `/trips/:id` | DELETE | 删除行程 |
| `/trips/:id/days` | GET | 获取行程天列表 |
| `/trips/:id/days` | POST | 添加行程天 |
| `/trips/:id/share` | POST | 分享行程 |
| `/trips/:id/clone` | POST | 复制行程 |

### 1.4 行程项目 `/api/itinerary-items`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/itinerary-items` | POST | 添加行程项目 |
| `/itinerary-items/:id` | GET | 获取项目详情 |
| `/itinerary-items/:id` | PUT | 更新项目 |
| `/itinerary-items/:id` | DELETE | 删除项目 |
| `/itinerary-items/reorder` | POST | 重新排序项目 |

### 1.5 智能规划助手 `/api/agent`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/agent/route-and-run` | POST | 智能路由和执行（主入口） |
| `/agent/status/:runId` | GET | 获取执行状态 |

### 1.6 规划工作台 `/api/planning-workbench`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/planning-workbench/start` | POST | 开始规划会话 |
| `/planning-workbench/message` | POST | 发送消息 |
| `/planning-workbench/session/:id` | GET | 获取会话状态 |
| `/planning-workbench/session/:id/history` | GET | 获取会话历史 |

### 1.7 规划助手 `/api/agent/planning-assistant`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/agent/planning-assistant/chat` | POST | 规划对话 |
| `/agent/planning-assistant/suggest` | POST | 获取建议 |

### 1.8 行程助手 `/api/agent/journey-assistant`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/agent/journey-assistant/chat` | POST | 行程对话 |
| `/agent/journey-assistant/help` | POST | 获取帮助 |

### 1.9 地点相关 `/api/places`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/places/search` | GET | 搜索地点 |
| `/places/:id` | GET | 获取地点详情 |
| `/places/nearby` | GET | 获取附近地点 |
| `/places/popular` | GET | 获取热门地点 |
| `/v5/places/search` | GET | V5 搜索地点（新版） |

### 1.10 国家/城市 `/api/countries` `/api/cities`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/countries` | GET | 获取国家列表 |
| `/countries/:code` | GET | 获取国家详情 |
| `/cities` | GET | 获取城市列表 |
| `/cities/:id` | GET | 获取城市详情 |
| `/cities/search` | GET | 搜索城市 |

### 1.11 路线/交通 `/api/route-directions` `/api/transport`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/route-directions` | POST | 获取路线规划 |
| `/route-directions/multi` | POST | 多点路线规划 |
| `/transport/options` | GET | 获取交通选项 |
| `/transport/estimate` | POST | 估算交通时间/费用 |

### 1.12 酒店/机票/铁路 

| 端点 | 方法 | 说明 |
|------|------|------|
| `/hotels/search` | GET | 搜索酒店 |
| `/hotels/:id` | GET | 酒店详情 |
| `/flight-prices/search` | GET | 搜索机票价格 |
| `/railpass/search` | GET | 搜索铁路通票 |
| `/railpass/:id` | GET | 铁路通票详情 |

### 1.13 徒步路线 `/api/trails`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/trails` | GET | 获取徒步路线列表 |
| `/trails/:id` | GET | 获取路线详情 |
| `/trails/search` | GET | 搜索徒步路线 |

### 1.14 行程模板 `/api/trip-templates`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/trip-templates` | GET | 获取行程模板列表 |
| `/trip-templates/:id` | GET | 获取模板详情 |
| `/trip-templates/:id/use` | POST | 使用模板创建行程 |

### 1.15 语音/视觉 `/api/voice` `/api/vision`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/voice/transcribe` | POST | 语音转文字 |
| `/voice/synthesize` | POST | 文字转语音 |
| `/vision/analyze` | POST | 图像分析 |
| `/vision/ocr` | POST | OCR 识别 |

### 1.16 联系我们 `/api/contact`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/contact` | POST | 提交联系信息/反馈 |

### 1.17 行程准备度 `/api/readiness`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/readiness/:tripId` | GET | 获取行程准备度 |
| `/readiness/:tripId/checklist` | GET | 获取准备清单 |

### 1.18 RAG 知识检索 `/api/rag`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/rag/retrieve` | GET | 检索文档（简单版） |
| `/rag/search` | POST | RAG 搜索（高级） |
| `/rag/route-narrative/:id` | GET | 生成路线叙事 |
| `/rag/local-insight` | GET | 获取当地洞察 |
| `/rag/destination-insights` | GET | 目的地深度信息 |
| `/rag/chat/answer-route-question` | POST | AI 回答路线问题 |
| `/rag/chat/explain-why-not-other-route` | POST | AI 解释路线选择 |
| `/rag/extract-compliance-rules` | POST | 提取行程合规清单 |
| `/rag/compliance/rail-pass` | POST | 获取铁路通票规则 |
| `/rag/compliance/trail-access` | POST | 获取步道访问规则 |

---

## 二、后端管理系统 API

后端管理系统面向运营人员和管理员，提供监控、管理功能。

### 2.1 Agent 运行管理 `/api/agent/admin`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/agent/admin/runs/stats` | GET | 获取运行统计 |
| `/agent/admin/performance` | GET | 性能分析 (P50/P95/P99) |
| `/agent/admin/runs` | GET | 运行列表 (分页/筛选) |
| `/agent/admin/runs/:id` | GET | 运行详情 |
| `/agent/admin/runs/:id/cancel` | POST | 取消运行 |
| `/agent/admin/attempts` | GET | Attempt 列表 |
| `/agent/admin/attempts/:id` | GET | Attempt 详情 |

### 2.2 Context Engine 管理 `/api/context/admin`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/context/admin/metrics` | GET | Context 监控指标 |
| `/context/admin/packages` | GET | Context Package 列表 |
| `/context/admin/packages/:id` | GET | Context Package 详情 |
| `/context/admin/analytics` | GET | Context 使用分析 |

### 2.3 决策管理 `/api/decision` `/api/decision-stats`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/decision` | GET | 决策列表 |
| `/decision/:id` | GET | 决策详情 |
| `/decision/:id/approve` | POST | 批准决策 |
| `/decision/:id/reject` | POST | 拒绝决策 |
| `/decision-stats/overview` | GET | 决策统计概览 |
| `/decision-stats/by-type` | GET | 按类型统计 |
| `/decision-stats/trends` | GET | 决策趋势 |

### 2.4 审批管理 `/api/approvals`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/approvals` | GET | 审批列表 |
| `/approvals/pending` | GET | 待审批列表 |
| `/approvals/:id` | GET | 审批详情 |
| `/approvals/:id/action` | POST | 执行审批动作 |

### 2.5 ROLL/训练管理 `/api/training/roll`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/training/roll/metrics` | GET | ROLL 监控指标 |
| `/training/roll/workers/status` | GET | Workers 状态 |
| `/training/roll/health` | GET | 健康检查 |
| `/training/roll/ab-test/create` | POST | 创建 A/B 测试 |
| `/training/roll/ab-test/analyze` | POST | 分析 A/B 测试 |
| `/training/roll/ab-test/should-use` | GET | 检查是否使用 ROLL |

### 2.6 训练数据管理 `/api/training`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/training/trajectories/collect` | POST | 收集轨迹 |
| `/training/trajectories/:id/validate` | POST | 验证轨迹 |
| `/training/batches/prepare` | POST | 准备训练批次 |
| `/training/batches/:id/export/jsonl` | POST | 导出 JSONL |
| `/training/jobs` | POST | 创建训练任务 |
| `/training/jobs/:id` | GET | 获取任务状态 |
| `/training/jobs/:id/start` | POST | 启动训练 |
| `/training/models` | GET | 模型列表 |
| `/training/models/:version` | GET | 模型版本详情 |
| `/training/models/register` | POST | 注册模型 |
| `/training/metrics/collection-stats` | GET | 收集统计 |
| `/training/metrics/training-quality` | GET | 训练质量指标 |

### 2.7 评估管理 `/api/training/evaluation`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/training/evaluation/router` | POST | 评测 Router |
| `/training/evaluation/gate` | POST | 评测 Gate |
| `/training/evaluation/itinerary` | POST | 评测 Itinerary |
| `/training/evaluation/full-pipeline` | POST | 评测完整流程 |
| `/training/evaluation/ope/report` | POST | 生成 OPE 报告 |

### 2.8 安全合规 `/api/training/safety`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/training/safety/constraints/check` | POST | 检查规划约束 |
| `/training/safety/risk-events/classify` | POST | 分级风险事件 |
| `/training/safety/risk-events/:id/handle` | POST | 处置风险事件 |
| `/training/safety/compliance/audit/record` | POST | 记录审计信息 |
| `/training/safety/compliance/audit/report` | GET | 审计报告列表 |
| `/training/safety/red-team/run` | POST | 运行红队测试 |

### 2.9 系统管理 `/api/system`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/system/health` | GET | 系统健康检查 |
| `/system/info` | GET | 系统信息 |
| `/system/config` | GET | 系统配置 |

### 2.10 RAG 知识库管理 `/api/rag`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/rag/index` | POST | 索引单个文档 |
| `/rag/index/batch` | POST | 批量索引文档 |
| `/rag/stats` | GET | RAG 知识库统计 |
| `/rag/compliance/refresh` | POST | 刷新合规规则缓存 |
| `/rag/local-insight/refresh` | POST | 刷新当地洞察缓存 |
| `/rag/segment-narrative` | POST | 生成路线段叙事（内部） |

### 2.11 LLM 管理 `/api/llm`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/llm/models` | GET | 可用模型列表 |
| `/llm/usage` | GET | Token 使用统计 |
| `/llm/cost` | GET | 成本统计 |

---

## 三、共享 API（两端都可使用）

以下 API 前端用户系统和后端管理系统都可能使用。

### 3.1 Context Engine `/api/context`

| 端点 | 方法 | 前端 | 后端 | 说明 |
|------|------|------|------|------|
| `/context/build` | POST | ✓ | ✓ | 构建 Context Package |
| `/context/compress` | POST | - | ✓ | 压缩 Context |
| `/context/project-state` | POST | ✓ | ✓ | 获取项目状态 |
| `/context/metrics` | GET | - | ✓ | 获取指标 |

### 3.2 行程优化 `/api/itinerary-optimization`

| 端点 | 方法 | 前端 | 后端 | 说明 |
|------|------|------|------|------|
| `/itinerary-optimization/optimize` | POST | ✓ | ✓ | 优化行程 |
| `/itinerary-optimization/suggest` | POST | ✓ | - | 获取优化建议 |

### 3.3 规划策略 `/api/planning-policy`

| 端点 | 方法 | 前端 | 后端 | 说明 |
|------|------|------|------|------|
| `/planning-policy/evaluate` | POST | ✓ | ✓ | 评估规划策略 |
| `/planning-policy/rules` | GET | - | ✓ | 获取策略规则 |

---

## 四、内部服务 API（不对外暴露）

以下 API 仅供内部服务间调用，不对外暴露。

| 模块 | 路径 | 说明 |
|------|------|------|
| Schedule Action | `/api/schedule` | 定时任务调度 |
| Trip Detail | `/api/trip-detail` | 行程详情内部处理 |
| Execution | `/api/execution` | 执行引擎内部调用 |
| Trip Planner | `/api/trip-planner` | 行程规划器内部调用 |

---

## 接口统计

| 系统 | 模块数 | 预估端点数 |
|------|--------|-----------|
| 前端用户系统 | 18 | ~90+ |
| 后端管理系统 | 11 | ~65+ |
| 共享 API | 3 | ~10 |
| 内部服务 | 4 | ~15 |

---

## 认证要求

| 系统 | 认证方式 | 说明 |
|------|----------|------|
| 前端用户系统 | JWT Token | 用户登录后获取 |
| 后端管理系统 | JWT Token + RBAC | 需要管理员权限 |
| 内部服务 | API Key / 服务间认证 | 内部调用 |

---

## 相关文档

- [ROLL API 文档](./ROLL_API_DOCUMENTATION.md)
- [后台管理 API 文档](./ADMIN_API_DOCUMENTATION.md)
- [Context Engine API 文档](./CONTEXT_API_DOCUMENTATION.md)
- [RAG/LLM 管理 API 文档](./RAG_LLM_ADMIN_API_DOCUMENTATION.md)

---

*文档由 rl-infra 团队维护*
