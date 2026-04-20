---
name: memory-model-team 
description: 构建并落地 TripNARA 记忆模型“团队构建”工作流：MemoryState schema、信号抽取、冲突仲裁与衰减、Decision Knob Registry 显式映射、持久化/治理、Shadow Mode（dry_run）注入、以及与 Kernel Belief（POMDP 先验/后验）桥接。在构建 memory/用户画像系统、DecisionParams 映射、长期偏好、会话记忆、belief prior、或用户要求“记忆模型团队构建/小队搭建”时使用。
---

# 记忆模型团队构建（TripNARA）

## 快速意图

构建一个**记忆模型小队**：将用户/会话信号沉淀为可版本化的 **MemoryState**，以确定性方式映射为运行时可执行的 **DecisionParams**，并作为 **Kernel Belief State（POMDP）先验**输入；Kernel 产出的 posterior（后验）再回流，形成闭环。

## 职责分工（推荐小队）

- **Memory Tech Lead（记忆负责人）**
  - 负责 MemoryState schema + 版本策略 + API + 与 runtime/KERNEL/skills 的集成契约。
- **Signal Extraction Owner（信号抽取负责人）**
  - 负责从对话、决策日志、gate/verify/repair 结果与用户反馈中抽取信号（含负向信号）。
- **Persistence & Governance Owner（持久化与治理负责人）**
  - 负责 DB schema/迁移、保留策略/TTL、删除、加密/脱敏、访问控制、PII 排除。
- **Runtime Integration Owner（运行时集成负责人）**
  - 负责注入点：route-and-run 上下文、各阶段上下文、Shadow Mode（dry_run），以及映射到 `DecisionParams`。
- **Evaluation & Observability Owner（评测与可观测负责人）**
  - 负责离线回放指标、线上护栏、漂移/质量看板、回滚门禁、熔断策略。

## 代码地图（在哪里改）

- **Decision params（执行旋钮）**：`src/agent/memory/interfaces/decision-params.interface.ts`
- **Trip 合同与运行时校验**
  - `src/agent/interfaces/trip-plan.interface.ts`
  - `src/agent/validation/trip-plan.schema.ts`
- **运行时入口**
  - `src/agent/services/agent.service.ts`
  - `src/agent/services/route-and-run-response-assembler.service.ts`
- **Kernel 桥接（当 memory 影响 belief/prior 或阶段输出时）**：`src/decision/kernel/decision-kernel.service.ts`
- **建议新增钩子**
  - 冲突仲裁：`src/agent/memory/strategies/conflict-resolver.strategy.ts`
  - belief 适配：`src/decision/kernel/adapters/memory-to-belief.adapter.ts`
- **回放/指标钩子（选择既有 harness 路径）**
  - `src/trips/decision/evaluation/**`
  - `scripts/**`（replay / smoke suites）

## 实施流程（增强版闭环）

### Step 0 — 定义合同（MemoryState）

创建/确认一个（带版本的）**MemoryState** 合同，要求严格“增量可审计”：

- **Long-term**（长期偏好）：稳定、可衰减
- **Session-specific**（会话偏好）：短期、可覆盖长期
- **Learned constraints**（可执行约束）
- **Negative signals**（负向信号）：用户明确拒绝/回避的内容（优先级高）
- **confidence + provenance**：置信度 + 溯源（必须排除 PII）
- **schemaVersion + updatedAt + TTL + half_life**：版本、更新时间、TTL、半衰期

规则：
- 写入时不要“整对象覆盖”，使用 patch 语义。
- 每个字段都必须可解释（source/provenance），且 provenance 不得包含 PII。
- memory 缺失 → 默认行为 100% 与当前一致（冷启动不劣化）。

### Step 1 — 决策旋钮注册表（Decision Knob Registry）+ 确定性映射（必须可测试）

要求：禁止“硬编码映射”。

- 建立 **Decision Knob Registry**：显式注册 `MemoryField → DecisionParam` 的映射规则与 reason codes。
- 实现 `mapMemoryToDecisionParams(memoryState, registry) -> DecisionParams`（纯函数 + 单测）。

#### 冲突仲裁（Conflict Arbitration）

不变量（Invariant）：
- 当长期偏好（Long-term）与当前会话（Session-specific）冲突时：**Session 优先**。
- 但必须记录 `contradiction_score`（冲突强度）与 `winner`（仲裁结果）。

#### 衰减机制（Decay）

引入 half-life（半衰期）：
- 过时偏好自动降权：例如 **3 年前的冰岛 F-Road 经验**，其贡献在 confidence 计算中应衰减。
- 衰减应确定性、可解释（记录衰减因子/时间差）。

### Step 2 — 信号抽取（含负向信号）

为以下来源定义 extractor：
- Intake 信号（目的地、节奏、约束、偏好）
- Gate/verify 结果（违规、required_adjustments）
- Repair 结果（应用了什么 / 避免了什么）
- Feedback 信号（采纳/拒绝/修改/评分）

必须新增：
- **Negative Signal 记录**：用户“拒绝了什么/回避什么”（在 TripNARA 中，回避某类路径往往比推荐某类路径更重要）。

每个 extractor 必须输出：`value`、`confidence`、`provenance`、`updatedAt`、（可选）`half_life`。

### Step 3 — 持久化与治理

决策项：
- MemoryState 存在哪里（DB / file / KV）
- TTL 策略（会话级 vs 长期）
- 删除/遗忘流程（用户请求 / 合规）
- 如何为回放做快照（稳定序列化）
- provenance 排除 PII 的规则与审计

### Step 4 — 运行时集成（含 Shadow Mode）

注入 `DecisionParams` 足够早，使其影响：
- routing（strategyPreference）
- constraints（bufferTimeMin、maxDailyAscentM 等）
- repairPolicy（preferSplitDays / preferAltRoute / preferRestDay）

必须加入：
- **Shadow Mode（dry_run）**：计算 memory 影响后的 params，但不实际执行；输出 diff（用于离线/灰度对比）。

保持不变量：
- memory 缺失 → 行为不变
- memory 低置信 → 不得硬性破坏约束

### Step 5 — 内核桥接：Memory ↔ Belief State（POMDP）

记忆不是静态配置，而是 belief 的先验输入：
- 注入点：`MemoryState → initial_belief_state`（通过 adapter 做概率化/分布化）
- 闭环：Kernel 运行产出的 `posterior_state` 回流给 Signal Extraction Owner，成为下一轮更新素材

#### Belief 最大熵约束（Entropy Guard / ε 探索下限）

痛点：当记忆置信度过高（例如“99% 确定用户讨厌 F-Road”），Belief 可能概率坍缩，导致内核几乎不探索（Exploration），POMDP 容易陷入局部最优或决策死锁。

要求（Adapter 约束）：
- 即使记忆非常确定，也必须保留一个最小探索冗余 \(\epsilon\)（例如 \(0.05\)）给“未知/备选”粒子或尾部分布。
- 记忆注入不得使 `initial_belief_state` 完全坍缩为单一粒子（除非显式策略允许且有可审计 reason_code）。
- 在 `memory-to-belief.adapter.ts` 中实现并记录审计字段（例如：`entropy_guard_epsilon`、`collapsed_prevented=true`）。

### Step 6 — 评测与可观测

离线：
- Replay 对比 memory ON vs OFF（feasibility、repair 次数、token、latency、用户确认率）
- Shadow Mode diff 统计（稳定性/漂移）

必须新增：
- **对抗性记忆回放（Adversarial Replay / User Pivot）**：
  - 场景：长期表现为“慢节奏”用户，在当前 Session 突然要求“特种兵式拉练”。
  - 判定标准：系统必须能在 **2 次交互内** 通过 `contradiction_score` 修正权重，不应被 Long-term 强行拖拽导致决策卡死/持续不满足。
- **灵敏度分析（Sensitivity Analysis）**：
  - 自动遍历 `half_life`（及必要时 \(\epsilon\)）参数，定位“记忆失效”与“满意度/可行性下滑”的临界点（用于门禁与默认参数选取）。

线上：
- 护栏 + 回滚：指标回退时自动关闭 memory 注入（feature flag）
- 熔断机制：若 memory 导致 verify/repair loop 次数显著增加，必须触发降级/关闭

## PR 自检（Hard Checklist，合并前必须回答）

- [ ] **反向抑制**：若 Memory 导致 verify/repair loop 次数显著增加，是否有熔断/降级？
- [ ] **隐私对齐**：所有 provenance 是否排除了 PII，仅保留行为特征？
- [ ] **冷启动表现**：MemoryState 全空（新用户）时，DecisionParams 输出是否与当前默认行为 100% 一致？
- [ ] **冲突仲裁**：Session vs Long-term 冲突时，是否记录 contradiction_score 与仲裁结果？
- [ ] **衰减机制**：half-life 是否生效且可解释（时间差/衰减因子可追溯）？
- [ ] **Knob Registry**：是否通过注册表映射，避免硬编码？
- [ ] **Shadow Mode**：是否可在不影响执行的情况下产出 diff？
- [ ] **Traceability**：每一个被 Memory 修改的 DecisionParam 是否携带可审计 `reason_code`（例如 `MEMORY_DECAYED_LONG_TERM` / `SESSION_PRIORITY_WEIGHTED`）？

## 记忆模型专家（Memory Scientist）专项规范

### 1) 核心职责（RACI Matrix）

| 任务项 | R（负责） | A（审批） | C（协作） | I（知会） |
|---|---|---|---|---|
| 信号口径定义（什么样的行为算 Negative Signal） | Memory Scientist | Kernel Lead | Platform Eng | - |
| 衰减函数与置信度建模（Half-life 曲线） | Memory Scientist | Kernel Lead | - | - |
| Memory-to-Belief 映射精度 | Memory Scientist | Scientist | Kernel Lead | - |
| Shadow Mode 指标对齐与门禁 | Platform Eng | Memory Scientist | - | QA |
| 降级与熔断策略（Kill Switch） | Platform Eng | Kernel Lead | Memory Scientist | SRE |

### 2) 第一期交付清单（2-Week MVP: “Active Memory Loop”）

目标：实现从“静态记忆”到“可审计、可回流、可熔断”的动态闭环。

#### Week 1：冲突与可解释性（Auditability）

- **Deliverable 0（可选但推荐）：Shadow Mode 日志审计工具**
  - 目的：分析 `v2_with_memory` 与 `legacy`（或 `v2_no_memory`）的分歧点，输出“严重漂移”清单与原因归类（冲突已处理 vs 映射缺口）。
  - 建议脚本：`scripts/audit-memory-shadow.ts`

- **Deliverable 1：Session Atoms 集成**
  - 在 v2 registry 中接入真实的 SessionState。
  - 实现 ConflictResolverStrategy 的线上埋点：记录 `contradiction_event`（当 Memory 与当前输入权重冲突超过 \(0.3\) 时触发）。

- **Deliverable 2：Contradiction Score Audit Log**
  - 日志输出 `Memory_Decision_Diff`，格式：
    - `[Memory-Audit] Field: pace, Memory: 0.8, Input: 0.2, Result: 0.35, Reason: Session_Priority_Weighted`

#### Week 2：闭环与防御（Safety & Feedback）

- **Deliverable 3：Posterior Feedback Loop（K3/K4 信号回流）**
  - 当 verify/repair loop 成功修复路径后，将修复后的 `constraint_delta`（如：用户实际接受了更慢的 Pace）写回 **Session Memory**，而非直接污染 Long-term。

- **Deliverable 4：记忆熔断器（Memory Circuit Breaker）**
  - 定义阈值：若 Memory_ON 导致 Repair_Count 环比上升 \(>20\%\) 或 Latency 增加 \(>50ms\)，自动将记忆置信度降级至 0。

- **Deliverable 5：Shadow Metrics 看板**
  - 对比：`v2_with_memory` vs `v2_no_memory` 的可行性（Feasibility Rate）差异。

### 3) 给专家的“三不”原则（Constraints）

- **不可灾难性覆盖**：任何回流信号禁止直接 overwrite 长期记忆字段，必须经过 Confidence-Weighted Average。
- **不可黑盒注入**：任何受 Memory 影响的 DecisionParams 必须带 `source_memory_version` 溯源标签。
- **不可绕过内核**：记忆只能作为 Belief Prior 影响内核，严禁在 `DecisionKernelService` 之外私自拦截并修改决策逻辑。