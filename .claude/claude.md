# TripNARA — CLAUDE.md（决策型旅行 / 路线智能 / 可执行行程）

> 本仓库构建 TripNARA：**决策优先（Decision-first）** 的旅行应用。  
> 任何输出必须遵循：**Should-Exist Gate（路线是否应该存在）→ 可执行行程（Executable Itinerary）→ 决策日志（Decision Log）**。  
> Claude Code 必须严格遵守本文件规则，输出必须工程可落地（字段/状态/流程/异常/测试/降级）。

---

## 0) TripNARA 不可妥协原则（强制）

1) **决策优先（Decision-first）**  
   任何行程生成之前，必须先跑 **Should-Exist Gate**。  
   Gate 只能输出四种结果：**ALLOW | ADJUST_REQUIRED | BLOCK | NEED_USER_CONFIRM**。

2) **可执行优先（Executable-first）**  
   行程条目必须“可执行”：**时间窗 + 地点 + 可达性证据 +（必要时）开放时间/票务证据**。  
   若证据不足，必须标记 **UNVERIFIED/NEED_TOOL**，并触发 **调整或降级**（ADJUST_REQUIRED/REPAIR）。

3) **安全优先（Safety-first）**  
   风险高、不可达、证据无法核验时：优先 **ADJUST_REQUIRED/BLOCK**，并给出替代方案。

4) **可解释与可追责（Explainability-first）**  
   必须输出结构化 **Decision Log**：检查了什么、用了哪些证据、为什么允许/拒绝/调整、替代方案是什么。

5) **禁止编造事实（No hallucinated facts）**  
   不得编造：交通班次、开放时间、票价、票务规则、安全结论。  
   若无法通过 skills/tools/data 核验，只能标注 **ASSUMPTION（假设）** 并列出 **TODO：待核验清单**。

---

## 1) 仓库协作约定（Claude Code 工作方式）

### 1.1 语言与代码风格
- TypeScript 优先；函数保持短小可测。
- 所有 skill 输入/输出必须有 **schema（运行时校验）**（zod 或等价方案）。
- 必须使用 **结构化日志**，每一步带 `request_id`。
- 错误必须显式：**错误码 + 降级策略**。

### 1.2 安全与密钥
- 不得读取、打印 `.env`、密钥、token。
- 若需要配置，仅引用 env key 名称，并提供 `env.example` 模板。

### 1.3 完成定义（Definition of Done）
每次改动必须满足：
- **Gate 在 Plan 之前执行**（强顺序）。
- 输出包含：`gate_result`、`alternatives >= 1`、`decision_log[]`。
- 行程条目必须有 `evidence_refs[]`；否则 `verified=false` 且标注 UNVERIFIED。
- 新逻辑必须新增/更新测试。
- lint/typecheck 通过。

---

## 2) 核心架构（Agents + Skills）

TripNARA 核心由三部分组成：
- **主编排 Orchestrator（状态机 + 工具调用）**
- **子 Agent（专职输出结构化片段）**
- **Skills（可核验数据/确定性计算/规则检查）**

### 2.1 Orchestrator 状态机（强制顺序）
- **INTAKE**：解析请求 & 缺口识别  
- **RESEARCH**：调用 skills 获取硬数据（交通/POI/开放时间/DEM/风险）  
- **GATE_EVAL**：执行 Should-Exist Gate 决策  
- **PLAN_GEN**：生成结构化行程草案（非文案）  
- **VERIFY**：验证开放时间冲突/换乘 buffer/可达性/疲劳阈值  
- **REPAIR**：替换POI/改路线/加buffer/换交通/降级  
- **NARRATE**：产出用户可读解释（不得改硬字段）  
- **DONE / FAILED**

---

## 3) 统一数据合同（禁止漂移）

### 3.1 TripPlanRequest（最小字段）
- request_id（string，必填）
- origin（string 或 latlng）
- destination（string 或 latlng）
- date_range 或 start_date + days
- mode（walk|drive|transit|mixed）
- party（人数、亲子/老人标记、体力档位）
- constraints（预算?、每日时间窗?、max_ascent_m?、max_walk_km?）
- preferences（风景优先/效率优先、避收费等）

### 3.2 GateResult（最小字段）
- gate_result：ALLOW | ADJUST_REQUIRED | BLOCK | NEED_USER_CONFIRM
- violations[]：{ type: REACHABILITY|SAFETY|DEM|DATA_MISSING, severity: HARD|SOFT, detail }
- required_adjustments[]：{ action: CHANGE_MODE|CHANGE_DATES|SHORTEN_DAY|REPLACE_SEGMENT|REPLACE_POI|ADD_BUFFER, why }
- confidence（0..1）

### 3.3 EvidenceRef（证据引用）
- evidence_id
- source（skill_name / dataset）
- last_verified_at
- confidence
- url?（如可用）

### 3.4 Itinerary（可执行行程）
- days[]：{ date, items[] }
- item：{
  type: TRANSIT|DRIVE|WALK|POI|REST,
  start_window, end_window,
  location_ref,
  notes?,
  evidence_refs[],
  verified: boolean
}

### 3.5 DecisionLogEntry（决策日志）
- request_id
- step（INTAKE|RESEARCH|GATE_EVAL|PLAN_GEN|VERIFY|REPAIR|NARRATE）
- actor（Orchestrator|Planner|Gatekeeper|Compliance|LocalInsight|CoreDecision|Narrator）
- inputs_summary
- outputs_summary
- evidence_refs[]
- timestamp

---

## 4) 子 Agent 角色（必须存在）

- **Planner**：任务拆解、缺口清单、候选方案结构
- **Gatekeeper**：Should-Exist Gate 规则执行（硬门控+软评分）
- **Compliance**：风险提示/免责声明/用户确认留痕要求
- **LocalInsight**：替代点位/替代路线建议（无证据必须标 ASSUMPTION）
- **CoreDecision**：多候选方案权衡与最终选择
- **Narrator**：用户可读输出（不得更改硬字段与证据字段）

**规则：**Orchestrator 拥有状态机并按顺序调用；子 Agent 只输出结构化 JSON 片段，由 Orchestrator 合并并写入 decision_log。

---

## 5) Skills（MVP 必备清单）

最小可执行闭环（必须具备）：

1) intent.parse  
2) constraints.normalize  
3) transport.search（可达性 + 班次证据如有）  
4) poi.search / poi.get  
5) opening_hours.get  
6) dem.metrics  
7) fatigue.estimate  
8) risk.check  
9) gate.should_exist  
10) itinerary.generate  
11) itinerary.verify  
12) repair.apply  
13) alternatives.generate  
14) response.compose

**硬规则：**若 transport/opening_hours/risk 无证据 → 不得输出确定班次/确定开门时间/确定安全结论，只能 UNVERIFIED + ADJUST/REPAIR。

---

## 6) 新增 Skill 的标准流程（强制）

1) 新建文件：
- `src/skills/<domain>/<skill-name>.skill.ts`

2) 必须导出：
- `meta`：{ name, version, description, input_schema, output_schema, timeout_ms, cache_policy }
- `run(input, ctx) => output`

3) 注册：
- 在 MCP skills server / tool registry 中注册（例如 `mcp-skills-server.ts` 或 registry 模块）

4) 测试：
- schema 校验测试
- 合同测试（必填字段、错误码稳定）

5) 文档：
- `docs/skills/<skill-name>.md`：示例、失败模式、降级规则

---

## 7) 新增/修改 Agent 的标准流程（强制）

1) 新建或修改：
- `src/agents/<agent-name>.ts`（或 NestJS service 模块）

2) 输出必须有 schema 且运行时校验。

3) 接入 Orchestrator：
- 调用顺序固定：Planner → Gatekeeper → Compliance/LocalInsight → Plan/Verify/Repair → Narrator  
- 必须保证 **Gate 在 Plan 前**

4) 测试：
- Agent 输出格式测试
- E2E 流程测试：验证 Gate 在 Plan 前执行

---

## 8) 错误码与降级规则（必须显式）

### 8.1 标准错误码
- TOOL_TIMEOUT
- TOOL_UNAVAILABLE
- DATA_MISSING
- UNVERIFIED_EVIDENCE
- UNSAFE_ROUTE
- NOT_REACHABLE
- CONFLICT_OPENING_HOURS
- FATIGUE_EXCEEDS_THRESHOLD

### 8.2 降级规则
- 关键段可达性未知 → **ADJUST_REQUIRED**（无替代则 BLOCK）
- 关键 POI 开放时间缺失 → **ADJUST_REQUIRED**，条目 UNVERIFIED，给替代点
- DEM/疲劳超阈值 → 缩短/拆分/加休息/换交通
- 始终提供 **alternatives >= 1**

---

## 9) 日志与埋点（必须实现）

### 9.1 结构化日志
每次请求必须记录：`request_id`、`step`、`actor`、`duration_ms`、`result`。

### 9.2 决策日志（Decision Log）
必须持久化 `decision_log[]`，并保留证据引用。

### 9.3 核心事件（可映射你的 telemetry）
- agent_request_created
- gate_evaluated
- tool_called
- itinerary_generated
- itinerary_verified
- repair_triggered
- response_delivered
- user_feedback_submitted（若存在）

---

## 10) 常用命令（以 package.json 为准，若不一致需更新本段）

示例：
- 安装：`pnpm i`（或 `npm i`）
- 本地开发：`pnpm dev`
- 构建：`pnpm build`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 测试：`pnpm test`

Prisma（如使用）：
- Generate：`pnpm prisma:generate`
- Migrate：`pnpm prisma:migrate`

Skills server（如 MCP 存在）：
- `npm run mcp:skills`

---

## 11) Claude Code 在本仓库的工作顺序（必须遵守）

当用户要求“构建 TripNARA 主 agent / skills”时：
1) 先对齐 **统一数据合同**（TripPlanRequest → GateResult → Itinerary → DecisionLog）
2) 先实现/补齐 **skills 合同**（schema + 错误码 + 降级）
3) 再实现 **gate.should_exist**（硬门控 + 软评分 + 修复映射）
4) 再实现 **generate → verify → repair** 闭环
5) 最后实现 Narrator（不得改硬字段）

每次输出必须包含：
- 变更文件列表
- 变更原因
- 运行方式（如何 test / how to run）
- 假设&TODO（如有）

---

## 12) 文档目录（保持更新）
- `docs/PRD.md`（产品规格）
- `docs/DESIGN_SPEC.md`（设计规范）
- `docs/DEPLOYMENT.md`（部署手册）
- `docs/skills/`（每个 skill 的合同与示例）
