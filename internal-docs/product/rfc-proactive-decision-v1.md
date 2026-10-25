# RFC-PD-001 — TripNARA Proactive Decision V1

**文档版本：** 1.0.1  
**状态：** **Phase 5 ACTIVE** — Travel Decision Intelligence Validation；能力建设结束（Phase 4 FROZEN）；**不开 PD-11**  
**生效日期：** 2026-08-11  
**产品名称：** Nara 主动旅行决策（Proactive Decision）  
**文档类型：** RFC / PRD（研发 · 算法 · 产品可直接执行）  
**维护原则：** 本文冻结 **V1 产品边界、编排关系、三人格触发策略与验收标准**；底层模块实现以各子系统 SSOT 为准，本文不重复定义其内部协议。

> **冻结表述（2026-08-11）：** TripNARA Proactive Decision V1 已完成 Observe→Impact→Decision→Intervention→Apply 全链路闭环，并接入 Mobile 消费能力。Phase 4 Production Readiness 已冻结；**当前进入 Phase 5 Validation**，通过 Shadow/Canary + Decision Dataset 验证「什么时候 Nara 应该出现」，而不是继续扩展功能。

**Phase 4 冻结稿：** [PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS](./PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS.md)  
**Phase 5 验证计划：** [PROACTIVE-DECISION-V1-PHASE5-VALIDATION](./PROACTIVE-DECISION-V1-PHASE5-VALIDATION.md)

**上位文档：**

- [TripNARA AI Native 产品定位与收敛战略](./TRIPNARA_AI_NATIVE_POSITIONING.md)
- [旅行决策基础设施叙事](./tripnara-decision-infrastructure-narrative-v1.md)
- [RFC-003 — Travel Context Protocol](./rfc-travel-context-protocol-v1.md)
- [旅行本体与世界模型](./travel-ontology-world-model-v1.md)
- 冰岛 Country Pack（`country_pack.IS` / SkillEvolver）

**工程任务清单：** [RFC-PD-001 Engineering Backlog](./rfc-proactive-decision-v1-engineering-backlog.md)  
**架构决策：** [ADR-012 — Observe / Impact / Apply SSOT](../architecture/ADR-012-Proactive-Decision-V1-SSOT.md)  
**Canary 计划：** [PROACTIVE-DECISION-V1-CANARY-PLAN](./PROACTIVE-DECISION-V1-CANARY-PLAN.md)  
**契约代码：** `src/trips/proactive-decision/`（`nara.proactive_impact@v1`）  
**客户端对接：** `src/trips/proactive-decision/PROACTIVE_DECISION_IOS_HANDOFF.md`

**相关实现（现状底座）：**

| 产品模块 | 生产接线路径（V1 SSOT） | 备注 |
|---|---|---|
| World Observer | `guardian-decision-core/evidence/`（Vedur / Gagnaveita）· road.is skill | `observer/` collapse **非** V1 摄取入口；Look 为并行通道 |
| Impact Engine | `guardian-decision-core/detection/` · `travel-ontology/p1-weather-deterioration/` | ERC **不**重写 Impact；ERC 负责投影 / 队列 / Confirm 写链消费 |
| Decision Runtime | `decision-runtime/` · `guardian-decision-core/` · `trips/decision/` | Decision Problem 写入既有 RFC001 store |
| Three Lens | Abu / Dr.Dre / Neptune strategies + persona-closure + Country Pack IS | 按 Lens Activation Policy 按需触发 |
| Decision Synthesis | CGUS（`trips/decision/optimization/`） | 主动 Case 合成入口待接线 |
| Intervention | `intervention-intelligence/` · `proactive-surface-pilot/` | 默认不通知；Canary 按场景授权 |
| Confirm / Apply | Change Draft → Preview → Confirm → Apply（权威写链见 Backlog PD-0.3） | 禁止静默 Apply |
| Memory | Travel Memory Runtime（Silent Learning） | 未过阈落盘 |

---

## 0. 文档控制

### 0.1 目的

本文将「主动决策」从能力叙事冻结为 **可交付产品切片**：

1. **产品目标** — Answer Agent → Decision Intervention Agent  
2. **用户价值链** — 世界变化到确认执行的价值闭环  
3. **系统编排关系** — 已有底座如何串成主动闭环  
4. **V1 用户流程** — 端到端可测路径  
5. **三人格触发机制** — Lens Activation Policy  
6. **验收标准** — 功能门禁 + 产品门禁 + 埋点门禁  

**结论（冻结）：** V1 **不是**新增 Agent 能力，而是把已有决策基础设施包装成用户可感知的「主动决策产品」。

### 0.2 证据标记

- **[PRODUCT DECISION]**：本 RFC 冻结的产品范围或交互决策  
- **[ENGINEERING]**：依赖现有模块，需编排 / 接线，不要求从零造引擎  
- **[TO VERIFY]**：需上线观察或离线评测验证的阈值 / 效果  

### 0.3 术语

| 术语 | 定义 |
|---|---|
| **Proactive Decision** | 在用户未主动询问时，由世界变化驱动的决策干预能力 |
| **World Observer** | 持续感知天气、道路、行程、位置等现实信号 |
| **Impact Detection** | 判断变化是否足以改变用户旅行决策 |
| **Decision Problem** | 结构化决策问题（Case） |
| **Lens Activation Policy** | 三人格按需触发策略，禁止无差别全量调用 |
| **CGUS** | 多维候选综合排序（非投票） |
| **Intervention Value** | 是否打扰用户的量化门槛 |
| **Change Draft** | 建议调整的只读草稿，未经 Confirm 不得写入行程 |
| **Silent Learning** | 未达打扰门槛时的观察与记忆，不通知用户 |

---

## 1. 产品定位

### 1.1 一句话定义

在旅行执行过程中，Nara 持续观察真实世界变化；当环境变化可能影响用户当前计划时，主动完成影响分析、多维决策评估和方案生成，在合适的时间提醒用户，并通过用户确认完成行程调整。

### 1.2 核心变化 **[PRODUCT DECISION]**

| 维度 | 当前旅行 Agent | TripNARA Proactive Decision |
|---|---|---|
| 起点 | 用户发现问题 | 世界变化 |
| 驱动 | 用户询问 | Nara 发现 |
| 产出 | 信息回答 | 影响判断 + 调整方案 |
| 决策主体 | 用户自行判断 | 三人格 + CGUS，用户确认 |
| 角色 | Answer Agent | **Decision Intervention Agent** |

```text
当前：用户发现问题 → 询问 AI → 获取信息 → 用户自行判断 → 修改计划

目标：世界变化 → Nara发现 → 判断影响 → 三人格决策 → 生成调整方案
      → 用户确认 → 执行调整
```

---

## 2. 产品目标

### 2.1 用户价值目标

| 目标 | 说明 | 对应指标 |
|---|---|---|
| **降低决策成本** | 用户不必时刻盯天气与路况 | User Query Reduction |
| **提前干预** | 在影响发生前给出可行动建议 | Useful Intervention Rate |
| **可信打扰** | 只在值得打断时提醒 | False Positive Rate ↓ |
| **可控执行** | 建议须经确认，禁止静默改行程 | Confirm → Apply 合规率 |

### 2.2 产品成功表述 **[PRODUCT DECISION]**

> 用户不是因为害怕风险才打开 Nara，而是在关键变化发生时相信 Nara 会主动提醒，并给出下一步行动。

### 2.3 非目标（V1）

- 不做酒店价格、餐厅排队、普通 POI 兴趣变化的主动推送  
- 不做无 Confirm 的自动改行程  
- 不扩展到非冰岛自驾 Country Pack  
- 不要求每次变化都跑满 Abu + Dr.Dre + Neptune  

---

## 3. 用户价值链

```text
World Signal
    ↓
Observe（感知）
    ↓
Impact? ──No──→ Silent Learning / Memory
    ↓ Yes
Decision Problem
    ↓
Lens Evaluation（按需 Abu / Dr.Dre / Neptune）
    ↓
CGUS Synthesis
    ↓
Verify / Policy Gate
    ↓
Intervention Value > Threshold?
    ├── No  → Silent Learning
    └── Yes → Notify（三层提醒卡）
                ↓
           Change Draft → Preview
                ↓
           User Confirm
                ↓
           Apply → Verify
                ↓
           Better Outcome → Memory Learning
```

**价值链要点：**

1. **感知有价值** — 发现用户尚未察觉的变化  
2. **判断有价值** — 过滤无决策意义的噪声  
3. **方案有价值** — 给出可执行替代，而非只报风速  
4. **时机有价值** — 现在调整仍有效才打扰  
5. **确认有价值** — 用户保持最终控制权  

---

## 4. 系统编排关系

### 4.1 Overall Architecture

```text
                         World
        Weather / Road / Booking / Location / Schedule
                              |
                              ↓
                    World Observer
                    (现实变化感知)
                              |
                              ↓
                    Impact Engine
              (是否影响当前旅行决策)
                              |
                              ↓
                 Decision Problem Builder
                    (问题结构化)
                              |
                              ↓
        ┌────────────────────────────────┐
        │        Decision Runtime         │
        │                                  │
        │      Abu       Dr.Dre   Neptune │
        │    Reality    Human    Repair   │
        └────────────────────────────────┘
                              |
                              ↓
                    CGUS Decision Synthesis
                              |
                              ↓
                    Verification / Gate
                              |
                              ↓
                 Intervention Manager
              ┌───────────────┴───────────────┐
              ↓                               ↓
          Notify User                    Silent Learning
              |
              ↓
          Change Draft → Confirm → Apply
```

### 4.2 现有能力映射 **[ENGINEERING]**

| 产品模块 | 已有底座 | V1 职责 |
|---|---|---|
| World Observer | observer / observer-rewrite / travel-observation | 感知天气、道路、环境变化 |
| Impact Engine | execution-risk-center | 判断变化是否影响计划 |
| Decision Engine | decision-runtime | 构建 Decision Problem |
| Three Lens | Abu / Dr.Dre / Neptune | 多维决策评估（按需激活） |
| Decision Synthesizer | CGUS | 候选方案综合排序 |
| Verification | Unified Assessment / Policy | 权威验证 |
| Intervention Manager | intervention-intelligence / proactive-surface-pilot | 判断是否打扰用户 |
| Execution | Change Draft / Apply | 用户确认后执行 |

**编排原则：** V1 优先 **接线与产品表面（Surface）**，禁止平行重写 Decision Runtime / ERC / CGUS。

### 4.3 与 Country Pack 的硬约束 **[PRODUCT DECISION]**

| 规则 | 要求 |
|---|---|
| **Abu Hard Gate** | 如 `2WD + F-road` → `HARD_BLOCK`；禁止三人格建议覆盖规则 |
| **mustAdjust** | 必须进入 Abu → Dr.Dre → Neptune → Repair，不可跳过 |
| **mustRepair** | 必须生成替代方案：Original → Neptune → Alternative → Abu/Dre 再评估 |
| **countryCode** | V1 仅 `IS`（Iceland Self-drive） |

---

## 5. V1 使用范围

### 5.1 国家与场景 **[PRODUCT DECISION]**

| 项 | V1 |
|---|---|
| 国家 | Iceland |
| 形态 | Self-drive Country Pack |
| 选择原因 | 天气变化强 · 道路约束明显 · 决策价值高 · 已有 Abu 门禁体系 |

### 5.2 Trigger 范围 **[PRODUCT DECISION]**

**纳入：**

| 域 | Trigger |
|---|---|
| Weather | 风力变化 · 暴雪 · 强降雨 |
| Road | Road Closure · Road Difficulty Change · Route Availability Change |

**不纳入：**

- 酒店价格变化  
- 餐厅排队  
- 普通 POI 推荐变化  
- 用户兴趣变化  

**原因：** 非高价值主动决策，误打扰成本高。

### 5.3 Decision Case（仅三个）**[PRODUCT DECISION]**

| Case ID | 问题 | 示例 |
|---|---|---|
| `CASE_CONTINUE_ACTIVITY` | 景点 / 活动是否继续 | Reynisfjara：风速 15→25 m/s |
| `CASE_REROUTE` | 路线是否调整 | Vik → F-road → Highland：Open → Difficult |
| `CASE_POSTPONE_ACTIVITY` | 活动是否延期 | 冰川徒步：天气窗口关闭 |

每个 Case 必须产出可审计的 `Decision Problem`，并绑定 `affected_items`。

---

## 6. 三人格触发机制

### 6.1 Decision Lens Activation Policy **[PRODUCT DECISION]**

**不是每次变化都调用三个人格。** 按触发条件激活；未触发则跳过该 Lens。

#### Abu — 现实约束专家

| 项 | 内容 |
|---|---|
| 触发 `required` | `safety_related` · `feasibility_uncertain` · `road_constraint` · `weather_risk` · `legality_constraint` |
| 回答 | 这个方案还能不能成立？ |
| 输出 | `feasibility` · `risk` · `constraint` · `confidence` |

#### Dr.Dre — 体验优化专家

| 项 | 内容 |
|---|---|
| 触发 `required` | `schedule_tradeoff` · `fatigue` · `experience_loss` · `user_preference_conflict` |
| 回答 | 即使能做，这样安排是否值得？ |
| 输出 | `experience_score` · `load_score` · `utility` |

#### Neptune — 方案修复专家

| 项 | 内容 |
|---|---|
| 触发 `required` | `original_plan_failed` · `utility_drop` · `user_requested_change` · `repair_required` |
| 回答 | 如果不能这样做，最佳替代是什么？ |
| 输出 | `alternative_candidates` · `repair_plan` |

### 6.2 合成规则

- 三人格 **不是投票**  
- 顺序语义：Abu 可行性 → Dr.Dre 体验 → Neptune 候选 → **CGUS 综合排序**  
- 输出：`Recommended Option` · `Confidence` · `Reason` · `Impact`  

### 6.3 V1 默认编排顺序

```text
Weather / Road Update
        ↓
Impact Detection
        ↓
Affected Itinerary?
        ↓
Decision Problem
        ↓
Abu（若 Activation 命中）
        ↓
Dr.Dre（若 Activation 命中）
        ↓
Need Alternative?
        ↓
Neptune（若 Activation 命中）
        ↓
CGUS Ranking
        ↓
Verify
        ↓
Intervention Gate
        ↓
Change Draft → User Confirm → Apply
```

**天气风险默认：** Abu + Dr.Dre 必参与；Neptune 仅在 `Need Alternative = true` 时触发。

---

## 7. V1 用户流程

### 7.1 端到端主路径（Happy Path）

1. **Observe** — Weather / Road Update 进入 World Observer  
2. **Impact** — Impact Engine 判定 `decision_required=true`，标注受影响行程项  
3. **Problem** — 映射到三个 Case 之一，生成 Decision Problem  
4. **Lenses** — 按 Activation Policy 评估  
5. **Synthesize** — CGUS 产出推荐方案与置信度  
6. **Verify** — Policy / Hard Gate 通过  
7. **Intervene** — Intervention Value 过阈 → 推送三层提醒卡  
8. **Draft** — 生成 Change Draft（只读预览）  
9. **Confirm** — 用户确认  
10. **Apply** — 授权写链落盘，Verify 闭环  

### 7.2 主动提醒卡（UX 冻结）**[PRODUCT DECISION]**

| 层 | 内容 | 示例 |
|---|---|---|
| L1 发生了什么 | 变化事实 | 下午黑沙滩附近风力预计增强 |
| L2 影响什么 | 绑定行程项 | 影响今天 16:00 黑沙滩计划 |
| L3 Nara 建议 | 可行动建议 + 收益 | 调整到明天上午：风险↓ · 体验保留 · 后续影响低 |

**操作：**

- `[查看方案]` → Change Draft Preview  
- `[暂不调整]` → 记录拒绝 / 延后，进入冷却与评估  
- `[为什么]` → 展示 Lens / CGUS 可解释理由（不暴露内部实现细节）  

### 7.3 用户确认链路（强制）**[PRODUCT DECISION]**

```text
禁止：Recommendation → 自动修改

必须：Recommendation → Change Draft → Preview → User Confirm → Apply → Verify
```

---

## 8. Intervention Gate

### 8.1 公式 **[PRODUCT DECISION]**

```text
Intervention Value
  = Improvement × Confidence × Actionability
  − Attention Cost
```

仅当 `Intervention Value > Threshold` 时提醒用户；否则：

```text
Observe → Memory（Silent Learning）
```

### 8.2 与现有闸门对齐 **[ENGINEERING]**

对接 `intervention-intelligence` / `proactive-surface-pilot`：

- Useful ≠ Worth Interrupting  
- L1 Passive / L2 Interrupt Canary 分层投放  
- 默认关闭：全局 auto-apply、无场景授权的 Push  

Threshold 与 Canary 比例为 **[TO VERIFY]**，上线前由产品 + 算法给定初始值并写入配置 SSOT。

---

## 9. 数据埋点

| 指标 | 定义 | 用途 |
|---|---|---|
| **Accept Rate** | `accepted_intervention / shown_intervention` | 建议质量 |
| **Useful Intervention Rate** | 用户反馈「有帮助」占比 | 价值感知 |
| **False Positive Rate** | 提醒后判定「无影响 / 不需调整」占比 | 误打扰 |
| **User Query Reduction** | 「今天还能不能去？」类主动询问下降 | 替代效应 |
| **Apply Rate** | Confirm 后成功 Apply 占比 | 执行闭环 |
| **Neptune Trigger Rate** | Neptune 实际触发 / Decision Case | 编排是否过触发 |
| **Silent Suppress Rate** | 有 Impact 但未通知占比 | Gate 健康度 |

埋点事件至少绑定：`tripId` · `caseId` · `decisionProblemId` · `interventionCandidateId` · `surfaceLevel` · `lensActivated[]`。

---

## 10. V1 验收标准

### 10.1 功能验收（Must Pass）

| # | 标准 | 通过条件 |
|---|---|---|
| F1 | 天气变化可触发 Observation | 风 / 暴雪 / 强降雨信号可进入 Observer |
| F2 | 能识别影响 Trip Plan | Impact 输出 `affected_items` + `decision_required` |
| F3 | 能形成 Decision Problem | 映射到三个 Case 之一，结构可审计 |
| F4 | Abu / Dr.Dre 正确参与 | 天气风险场景下二者激活且输出完整 |
| F5 | Neptune 只在需要时触发 | `Need Alternative=false` 时不调用 Neptune |
| F6 | CGUS 输出排序方案 | 含 Recommended · Confidence · Reason · Impact |
| F7 | Change Draft 可生成 | Preview 只读，未 Confirm 不写行程 |
| F8 | 用户确认后 Apply | 经授权写链；Verify 通过 |
| F9 | Hard Gate 不可覆盖 | `2WD+F-road` 等 HARD_BLOCK 不被建议绕过 |
| F10 | 未过阈不打扰 | Intervention Gate 失败走 Silent Learning |

### 10.2 产品验收

| # | 标准 |
|---|---|
| P1 | 提醒卡严格三层：发生了什么 / 影响什么 / Nara 建议 |
| P2 | 提供「查看方案 / 暂不调整 / 为什么」 |
| P3 | 禁止 Recommendation 自动改行程 |
| P4 | 达到产品成功表述：用户信任 Nara 会在关键变化时主动给出下一步行动 |

### 10.3 指标验收（初始门禁 · **[TO VERIFY]**）

上线 Canary 期建议最低观察：

| 指标 | 方向性目标 |
|---|---|
| Accept Rate | 相对基线 ↑ |
| False Positive Rate | 相对基线 ↓ |
| Useful Intervention Rate | 可测且不劣化 |
| User Query Reduction | 目标场景询问次数 ↓ |

具体数值阈值在 Canary 计划中冻结，不在本 RFC 锁死。

### 10.4 范围验收

- 仅 Iceland Self-drive  
- 仅 Weather + Road Trigger  
- 仅三个 Decision Case  
- 文档 §5.2 非目标未出现在用户可见主动推送中  

---

## 11. 工程落地建议（执行清单）

> 可开票任务、依赖顺序、权威主链与 Sprint 切片见：  
> **[RFC-PD-001 Engineering Backlog](./rfc-proactive-decision-v1-engineering-backlog.md)**

| 角色 | 负责 | 产出 |
|---|---|---|
| **产品** | Case 文案、提醒卡、Confirm 文案、Threshold 初值、Canary 场景 | UX 规格 + 验收用例 |
| **算法** | Lens Activation 特征、Intervention Value 因子、CGUS 排序输入 | 策略配置 + 离线评测集 |
| **后端** | WorldSignal→Impact→Problem→Runtime→Gate→Draft 编排接线 | Orchestrator + 适配器 |
| **客户端** | 三层提醒卡、Preview、Confirm、为什么 | 用户可见 Surface |
| **Harness** | F1–F10 统一回放（含 Hard Gate / mustRepair） | Golden + 不变量 |

**接线顺序（摘要）：** PD-0 契约 → PD-1 Observe → PD-2 Impact/Case → PD-3 Runtime → PD-4 Lens → PD-5 CGUS → PD-6 Intervention → PD-7 Draft/Confirm/Apply → PD-8 ERC 投影 → PD-9 Harness → PD-10 Canary。

**禁止：** 为 V1 平行新建第二套 Decision Agent / 第二套 Confirm-Apply 写链。

---

## 12. 后续演进

### V1.5

- Booking Failure  
- Activity Availability  
- Flight Delay  
- Team Member State  

### V2

```text
Travel Digital Twin
      + Continuous Observation
      + Decision Intelligence
      → Adaptive Trip → Better Outcome → Memory Learning
```

**最终目标：** Nara 不是旅行聊天机器人，而是持续管理旅行状态并主动帮助用户做决策的旅行智能体。

---

## 13. 会签

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| Product | | | ☐ Approve / ☐ Request Changes |
| Algorithm | | | ☐ Approve / ☐ Request Changes |
| Engineering | | | ☐ Approve / ☐ Request Changes |
| Country Pack (IS) | | | ☐ Approve / ☐ Request Changes |

---

## 附录 A — Impact 输出示例

TypeScript 契约：`src/trips/proactive-decision/contracts/proactive-impact.types.ts`  
Wire JSON（`toProactiveImpactWireJson`）：

```json
{
  "impact_level": "HIGH",
  "affected_items": ["Day4 Reynisfjara"],
  "decision_required": true,
  "case_id": "CASE_CONTINUE_ACTIVITY",
  "trip_id": "trip_is_day4",
  "signal_kind": "WEATHER_WIND",
  "signal_event_id": "evt_wind_001",
  "schema_id": "nara.proactive_impact@v1"
}
```

## 附录 B — 与 RealityOS / NARA Look 关系

- **NARA Look / RealityOS**：视觉 / 现场 Observation Channel  
- **Proactive Decision V1**：天气与道路驱动的主动决策切片  

二者共享 Decision Runtime、Confirm/Apply、Intervention 闸门；V1 不以 Look 为前置依赖。
