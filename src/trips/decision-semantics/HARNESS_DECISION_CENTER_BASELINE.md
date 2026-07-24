# TripNARA Harness / Decision Center — 开发基线（V1.6.2）

> 完整产品定义参见
> [DECISION_CENTER_V1.0.md](./DECISION_CENTER_V1.0.md)；
> 当前实施和发布验收范围以本文档为准。

**状态快照：** 后端「执行可信」第一阶段已完成；产品「用户感知可信」尚未闭环。

> **核心判断：** 当前最大风险不在后端能力缺失，而在前端是否严格消费 Release Gate 执行态。

---

## 1. 阶段定位

| 层级 | 状态 |
|------|------|
| 组件存在（Validator / Gateway / Trace / Memory） | ✅ 已完成 |
| 单组件验证 | ✅ 已完成 |
| **后端终态 Release Gate** | ✅ 已完成 |
| **CI 发布阻断（后端）** | ✅ 已完成 |
| 前端执行态消费 | ⏳ 待完成 |
| 用户可见可信闭环 | ⏳ 待完成 |
| P2 定量优化（MemoryUtilityLift / LoopStop / Inferential） | 🔜 延后 |

**准确表述：**

- 后端 Release Gate **已闭环**
- 产品 Release Gate **尚未闭环**

**第一阶段完整 DoD：**

> 后端不假成功 + 前端不展示假成功 + 用户不会因重复操作制造重复副作用

---

## 2. 后端 Release Blocker 注册表

### 数量说明（避免文档 / CI / 注册表不一致）

| 维度 | 数量 | 说明 |
|------|------|------|
| **Blocker Case（注册表）** | **6** | `BLOCKER_CASE_REGISTRY` |
| **Jest test spec** | **7** | `STATE-BLOCKER-PARTIAL-001` 含 Path A + Path B 两条合法路径 |

### 6 个 Case 清单

| caseId | phase | 验证什么 |
|--------|-------|----------|
| `DS-BLOCKER-IDEMPOTENCY-001` | P0 | 同方案重复 POST → 只 1 次有效 repair |
| `MEM-BLOCKER-SCOPE-001` | P0 | CURRENT_TRIP 约束不跨 trip 进入 assembled context |
| `MEM-BLOCKER-DELETE-001` | P0 | DELETE 后 canonical / cache / snapshot / vector / context 五层不可召回 |
| `STATE-BLOCKER-PARTIAL-001` | P1 | apply 成功 + 路线重算失败 → 仅 `ROLLED_BACK` 或 `PARTIALLY_APPLIED`（**2 tests**） |
| `POLICY-BLOCKER-STALE-001` | P1 | 证据过期 → 禁止 auto-repair，须 refresh |
| `MEM-BLOCKER-PDI-001` | P1 | 私密愿望不泄漏给其他成员 digest / context |

### 延后（不在 blocker 注册表）

| 原计划 | 状态 |
|--------|------|
| `LOOP-BLOCKER-INFINITE-001`（LoopStopPolicy 运行时停止） | P2 延后；fault 矩阵登记为 `TBD-LOOP-STOP-001` |
| MemoryUtilityLift / ablation | P2 |
| Inferential grader（对话猜出来源） | P2 |
| Policy Gateway 全局 fail-closed | P2 |

### 后端 CI

```bash
npm run harness:blockers    # 6 suites / 7 tests
npm run harness:replay      # ReplayPass@10 + PolicyPass@20 + FinalStatePass@20
npm run harness:fault-injection   # 主分支 / 每日
npm run memory:regression         # 主分支 / 每日
```

Workflow：`.github/workflows/harness-release-gate.yml`

### 后端已能回答的问题

- 同一方案重复提交，是否只执行一次？
- 行程更新失败后，是否会错误显示为成功（record 层）？
- 数据过期时，是否会阻止自动修复？
- Trip 级记忆是否跨行程泄漏？
- 私密 PDI 是否暴露给其他成员？
- 记忆删除后是否还会进入上下文？
- Release Gate 是否可在 CI 中稳定执行？

---

## 3. 下一 Sprint 边界（不扩后端）

**主线唯一目标：** Decision Center 前端完整消费 V1.6.2 执行契约。

**本 Sprint 不做：**

- MemoryUtilityLift / 通用 ablation runner
- Inferential grader
- Policy Gateway 全局 fail-closed
- 更多 Agent 级 fault injection
- Readiness workflow 大合并
- 独立 `trip_decision_*` 持久化表

---

## 4. 前端 MVP — 按决策链路落地（非按页面模块）

必做 ticket：`DC-FE-001` · `003` · `004` · `005` · `006` · `009`（L1 强烈建议 `007`）

联调细则：`DECISION_CENTER_FE_MVP_INTEGRATION.md`

### 4.1 问题列表与详情

**主读模型仅：**

```
GET /decision-problems
GET /decision-problems/:problemId
```

**禁止**用 feasibility / constraints / readiness blocker / Gate 原始结果自行拼装「冲突中心」。

验收：列表与详情状态一致；不暴露 Gate/Constraint 对象为 UI 主模型。

### 4.2 Option Preview

Apply 前必须展示 mutation 预览（删/增/改/风险/残余问题）。

Preview 与 Apply 必须使用同一 `problemId` + `optionId` + 决策版本；禁止 preview 旧版、apply 新版。

### 4.3 Apply 防重复（最高优先级）

```
READY → SUBMITTING → PROCESSING
```

进入 `SUBMITTING` 后：

- 禁用当前按钮 + 互斥 Option
- **稳定** `idempotencyKey`（禁止重渲染生成新 key）
- 页面刷新后恢复执行状态（持久化 key + decisionId / execution ref）

依赖：**稳定 idempotencyKey + 前端状态锁 + 后端幂等**（不能只 debounce）

### 4.4 轮询与终态

**HTTP 200 ≠ 行程修改完整落地。**

必须使用共享状态机：`classifyCreateDecisionOutcome` / `classifyExecutionStatusPoll`

| 后端 `executionStatus` | 用户呈现 | 禁止 |
|------------------------|----------|------|
| `RECORDED` / `APPLYING` | 正在准备 / 正在调整行程 | 绿 success |
| `APPLIED`（validation 未完成） | 已修改，正在验证 | 提前绿 success |
| `APPLIED` / `RESOLVED` | 调整完成 | — |
| `IDEMPOTENT_REPLAY` | 方案已应用，无需重复操作 | 刷新行程 / success toast |
| `PARTIALLY_APPLIED` | 部分完成，需处理 | 绿 success / 关闭问题 |
| `ROLLED_BACK` | 修改未生效，行程已恢复 | 展示 mutation 成功 |
| `FAILED` | 应用失败 | — |
| `evidenceFreshnessBlock` | 路况过期，须刷新后再应用 | 调用 apply |

> 产品文案「APPLIED_PENDING_VALIDATION」对应后端 `APPLIED` + `validationStatus !== CONFIRMED` 阶段。

### 4.5 半成功 / needsRepair

`PARTIALLY_APPLIED` = **独立界面状态**（非 error toast）。

展示：已成功部分 / 未完成部分 / 行程是否仍可执行 / 恢复入口。

`needsRepair === true` 时：禁止「全部完成」、禁止自动关闭 problem、L1 计待处理。

### 4.6 DATA_STALE

用户文案：「路况信息已经过期，需要重新检查后才能应用此方案。」

```
DATA_STALE → 刷新 evidence → 重新 problem/options → 重新 preview → 用户确认 → apply
```

禁止：刷新后直接自动 apply 旧方案；禁止前端绕过 stale gate。

---

## 5. 前端 Release Gate（建议）

| 命令 | 时机 | 内容 |
|------|------|------|
| `decision-center:contract` | PR 必跑 | 生成契约 + 类型与 API V1.6.2 字段对齐 |
| `decision-center:state-machine` | PR 必跑 | 状态机单测（后端 SSOT 可先行） |
| `decision-center:e2e` | 合并主分支 / 发布前 | 契约级 E2E（6 场景，见下） |

**本仓库已提供（后端 SSOT 代理）：**

```bash
npm run decision-center:contract      # → contracts:decision-semantics
npm run decision-center:state-machine # → 状态机 util spec
```

`decision-center:e2e` 在前端仓库实现。

### E2E 六场景

1. **重复点击** — 同 idempotencyKey；第二次 neutral_replay；revision 只 +1  
2. **APPLIED + validation pending** — 不绿 success；继续 poll 至 RESOLVED/APPLIED 终态  
3. **PARTIALLY_APPLIED** — 不绿 success；needsRepair 可见；问题不关闭  
4. **IDEMPOTENT_REPLAY** — 不失败 toast；不重复改本地行程；服务端拉最新  
5. **DATA_STALE** — Apply 禁用；刷新 evidence → 重 preview → 再 apply  
6. **轮询中断恢复** — 刷新/断网后沿用原 key/ref；不新建 decision  

---

## 6. Definition of Done（产品 Release Gate）

| 维度 | 标准 |
|------|------|
| **契约** | 状态来自生成契约；V1.6.2 字段全部可解析 |
| **状态机** | 每后端状态唯一 UI 映射；未知状态 fail-safe |
| **幂等** | 连点 / 刷新不重复执行；replay 恢复服务端终态 |
| **一致性** | UI 状态 = DecisionRecord；revision 一致；needsRepair 不假完成 |
| **可理解性** | 用户知：系统在做什么 / 改了什么 / 为何失败 / 下一步 |

---

## 7. 文档 SSOT 关系

```
产品目标 SSOT          DECISION_CENTER_V1.0.md
        ↓
当前阶段 / Release Gate  HARNESS_DECISION_CENTER_BASELINE.md（本文）
        ↓
前端执行说明           DECISION_CENTER_FE_MVP_INTEGRATION.md
```

| 文档 | 职责 |
|------|------|
| `DECISION_CENTER_V1.0.md` | 完整产品目标、长期能力边界 |
| 本文 | 当前阶段、Sprint 边界、Release Gate 与 DoD |
| `DECISION_CENTER_FE_MVP_INTEGRATION.md` | 前端具体联调与实现方法 |
| `DECISION_SEMANTICS_KNOWN_GAPS.md` | 已知语义缺口、回归清单、下一迭代 P0/P1 |
| `DECISION_SEMANTICS_FRONTEND_API.md` | API 契约 + §4.1 Release Gate 字段 |
| `decision-center-execution-state-machine.util.ts` | 前端状态机 SSOT（代码） |
