# TripNARA Travel Execution Planning Specification — Self-Drive Profile v1.0

**文档层级：** Product Foundation（产品与架构基线）  
**状态：** 冻结方向 · **非**全量开发需求清单  
**版本：** 1.0.1 · **2026-07-12**  
**受众：** 产品 / 架构 / 研发负责人  
**工程契约：** [TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md](./TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md) **v0.2.0**（含附录 A–E）

---

## 0. 文档定位

### 0.1 本文回答什么

- 系统应遵循什么原则、具备哪些能力
- 用户侧与系统内部的命名分层
- 完整产品链路（含可执行性验证节点）
- 四个核心对象与统一规则结果模型
- Core 与 Destination Pack 的职责边界
- Planner 与 Decision Runtime 的分工
- 三阶段实施路径（Phase 0 → 3）

### 0.2 本文不直接回答什么

以下内容在 **Phase 0 工程契约** 中编号化、可验收化：

- 每条 P0 规则的输入 / 输出 / 判定条件
- 数据不足时的降级策略
- `RuleOutcome` 与 `RuleSeverity` 的映射表
- 规则冲突时的最终裁决权
- 冰岛首期验收案例（golden scenarios）

> **原则：** 不再扩写更多产品原则；下一步进入 **契约化、规则编号化、状态统一化、验收案例化**。

---

## 1. 规格族谱（长期扩展）

```
Travel Execution Planning Specification
│
├── Self-Drive Profile          ← 本文档 v1.0
│   ├── Iceland Destination Pack
│   └── New Zealand Destination Pack
│
├── Public Transit Profile      （未来）
├── Urban Exploration Profile   （未来）
└── Guided Tour Profile         （未来）
```

「旅行执行规划」不等于「自驾规划」。自驾是 TEP 下的第一个 **Profile**。

---

## 2. 命名分层

| 层 | 名称 | 用途 |
|----|------|------|
| **用户侧** | 自驾行程规划 / 智能行程规划 | App、营销、Onboarding；用户理解「规划行程」 |
| **系统内部** | Travel Execution Planning (TEP) | 模块、服务、契约、审计 |
| **运行时** | Travel Execution Planning Runtime | 与 Continuous Decision Runtime 衔接时的内部称谓 |

**禁止：** 在用户主流程文案中强制使用「旅行执行规划」。技术定位通过内部命名保留，不转嫁理解成本给用户。

---

## 3. 产品定位

TripNARA 自驾行程规划器 **不是** 传统景点行程规划器。

**目标：** 在车辆、道路、天气、时间、住宿、活动、成员等多约束下，生成 **可执行、可恢复、可持续监测** 的自驾旅行计划。

规划只是第一步。完整链路：

```
Travel Goal
    ↓
Travel Execution Planning        ← 生成候选计划
    ↓
Executability Validation         ← 验证是否可执行（≠ 规划本身）
    ↓
Executable Plan                  ← 当前有效 Plan Version
    ↓
Continuous Decision Runtime      ← 持续监测环境与执行变化
    ↓
Decision & Local Repair          ← 决策与局部修复
    ↓
Travel Execution                 ← 真实执行
    ↓
Travel Outcome                   ← 结果、反馈与模型校准
```

**关键区分：** Planner 可产出「看起来合理」的候选计划；只有经过 **Executability Validation** 才能成为 **Executable Plan**。这与现有 Constraint Engine、Decision Gateway、Plan Version 结构一致。

---

## 4. 六条不可违反原则（Product Foundation）

| # | 原则 | 要点 |
|---|------|------|
| **P1** | Safety First | 硬安全违规 → `REJECT`；不确定或高风险 → `NEED_CONFIRM` / `SUGGEST_REPAIR`（见 §6） |
| **P2** | Drive before Sightseeing | 规划顺序：Route Skeleton → Daily Drive → Accommodation → Activities → POI |
| **P3** | Execution over Optimization | 宁愿少一个景点，也不接受 7h 连续驾驶、危险夜驾、为拍照赶死线 |
| **P4** | Recoverability | 每日须存在恢复空间；节点须标记 Importance × Flexibility（见 §8） |
| **P5** | Continuous Decision Ready | 规划期为 Runtime 预埋 Decision Hook；取消/替换须可追溯影响 |
| **P6** | Evidence Driven | 重要判定须有 `EvidenceRef`；禁止无来源的 LLM 猜测作为 BLOCK 依据 |

---

## 5. 规划管线（固定顺序）

```
Trip Goal
    ↓
Trip Constraints
    ↓
Vehicle  (SelfDriveProfile)
    ↓
Route Skeleton
    ↓
Daily Legs  (DailyDrivePlan)
    ↓
Accommodation
    ↓
Activities
    ↓
POIs
    ↓
Validation  → ExecutabilityAssessment
    ↓
Decision Workspace
    ↓
Executable Plan  (+ Runtime Context)
```

**Planner 职责边界（规划阶段）：**

- 生成候选 `DailyDrivePlan`、打标 Importance/Flexibility、预埋 `DecisionHook`、组装 `RecoveryGraph` 草案
- 调用 Pack 规则引擎产出 `PlanningRuleResult[]`
- 汇总为 `ExecutabilityAssessment`
- **不** 持续监测环境、**不** 写回行中 Plan Version（除非用户确认 commit）

**Decision Runtime 职责边界（执行阶段）：**

- 消费 Executable Plan 附带的 Runtime Context 与 Decision Hooks
- 监测道路/天气变化，命中 Hook → 生成 Decision Problem
- 局部修复候选 → 用户确认 → Plan Version 写回 → **重新** Executability Validation

---

## 6. Safety First — 硬阻断 vs 软处置

### 6.1 硬阻断 → `REJECT` / `CRITICAL`

- 道路官方关闭（计划执行窗口内）
- 车辆明确禁止进入（如 2WD × F-road 法定/官方准入）
- 法规或租车合同 **明确** 禁止
- 行程时间数学上无法成立
- 续航不足且不存在可靠补给
- 固定活动与住宿存在不可解冲突
- 官方明确要求撤离或禁止进入

### 6.2 高风险但不一定硬阻断 → `NEED_CONFIRM` / `SUGGEST_REPAIR`

- 风速较高但未达明确禁行阈值
- 单日驾驶负荷 `HIGH` / `EXTREME`
- 部分夜间驾驶（用户政策允许但需确认）
- 初次海外自驾
- 山路 / 碎石路经验不足
- 住宿可能晚到（在 Latest Arrival 缓冲内）
- 道路状态数据不确定或过期

**工程要求：** 禁止将所有安全相关信号一律 `REJECT`，否则系统过度保守、阻断无意义。

---

## 7. 四个核心对象（契约摘要）

完整字段见 [Phase 0 工程契约](./TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md#1-核心对象契约)。

| 对象 | 职责 |
|------|------|
| **SelfDriveProfile** | 车辆、驾驶员、驾驶政策、租车限制 |
| **DailyDrivePlan** | 每日驾驶骨架：锚点、legs、住宿、活动、缓冲 |
| **ExecutabilityAssessment** | 计划是否可执行 + findings + evidence |
| **RecoveryGraph** | 可删/可换/可移/受保护节点与依赖、fallback |

---

## 8. 可恢复性 — Importance × Flexibility

仅 `Mandatory / Recommended / Optional` 不足。每个计划节点须有两维：

```typescript
type PlanImportance = 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
type PlanFlexibility = 'FIXED' | 'MOVABLE' | 'REPLACEABLE' | 'REMOVABLE';
```

| 节点示例 | Importance | Flexibility |
|----------|------------|-------------|
| 当晚酒店 | MANDATORY | FIXED |
| 冰川徒步 | MANDATORY | MOVABLE |
| 黑沙滩 | RECOMMENDED | REMOVABLE |
| 路边咖啡馆 | OPTIONAL | REPLACEABLE |

`RecoveryGraph` 由 Importance + Flexibility + `PlanDependency` 投影生成。

---

## 9. 统一规则结果（禁止多套状态）

所有规则 **必须** 输出 `PlanningRuleResult`：

```typescript
interface PlanningRuleResult {
  ruleId: string;                    // 如 SDR-001
  outcome: RuleOutcome;
  severity: RuleSeverity;
  affectedRefs: string[];
  explanation: string;
  evidenceRefs: EvidenceRef[];
  suggestedActions?: SuggestedAction[];
}

type RuleOutcome =
  | 'PASS'
  | 'CAUTION'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPAIR'
  | 'REJECT'
  | 'UNKNOWN';

type RuleSeverity =
  | 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
```

**`RuleOutcome`（处置）与 `RuleSeverity`（影响）不可混用。**

`ExecutabilityStatus` 由规则结果 **聚合** 得出（非单规则直接返回）：

```typescript
type ExecutabilityStatus =
  | 'EXECUTABLE'
  | 'EXECUTABLE_WITH_CAUTION'
  | 'REQUIRES_CONFIRMATION'
  | 'REQUIRES_REPAIR'
  | 'NOT_EXECUTABLE'
  | 'UNKNOWN';
```

映射逻辑见工程契约 §4 与 **附录 E（用户可见状态映射）**。

---

## 10. Driving Load — P0 确定性模型（概念）

```
Adjusted Driving Minutes =
  Base Navigation Minutes
  × Road Factor
  × Weather Factor
  × Vehicle Factor
  + Stop Overhead

Drive Load Score =
  Adjusted Driving Minutes
  + Continuous Driving Penalty
  + Night Driving Penalty
  + Difficult Road Penalty
  + Driver Experience Penalty
```

**分级（默认阈值，须由 Pack / Policy 配置，禁止硬编码 Core）：**

| 等级 | 等效负荷（P0 默认） |
|------|---------------------|
| LOW | 0–180 min |
| MEDIUM | 181–300 min |
| HIGH | 301–420 min |
| EXTREME | > 420 min |

因子初始值表见工程契约 §3。

---

## 11. Decision Hook（须含触发条件）

Hook 不是 `weatherSensitive: true` 标签，而是 Runtime 可消费的契约：

```typescript
interface DecisionHook {
  hookId: string;
  targetRef: string;
  triggerType: TriggerType;
  triggerCondition: TriggerCondition;
  leadTime: Duration;
  impactScope: string[];
  defaultPolicy: DecisionPolicy;
}
```

示例与 `TriggerType` 枚举见工程契约 §5。

---

## 12. Core vs Destination Pack 边界

| Self-Drive Core | Destination Pack |
|-----------------|------------------|
| 规则执行框架 | 当地道路分类与准入 |
| `PlanningRuleResult` | 道路/天气数据源绑定 |
| `ExecutabilityAssessment` | 阈值与因子配置 |
| `RecoveryGraph` / `DecisionHook` | 季节规则、活动规则 |
| Plan Version 写回 / 审计 / 回滚 | 区域风险、repair 模板 |

**禁止：** `if (destination === 'Iceland')` 进入 Core。国家逻辑仅存在于 Pack 与 Pack 适配器。

**代码落点（现状参考）：**

- Pack 契约：`src/decision-runtime/packs/contracts/destination-pack.types.ts`
- 冰岛 Pack：`data/destination-packs/is/`
- 规则示例：`data/destination-packs/is/rules/is-road-rules.json`

---

## 13. P0 规则目录（12 条）

首期 **仅** 实现以下规则；完整 I/O 见工程契约 §2。

| ID | 名称 | 默认 Outcome |
|----|------|--------------|
| **SDR-001** | 车辆道路准入 | REJECT |
| **SDR-002** | 道路关闭 | REJECT |
| **SDR-003** | 租车合同限制 | REJECT / NEED_CONFIRM |
| **SDR-101** | 单日驾驶负荷 | CAUTION → SUGGEST_REPAIR |
| **SDR-102** | 连续驾驶限制 | SUGGEST_REPAIR |
| **SDR-103** | 连续多日疲劳 | CAUTION / SUGGEST_REPAIR |
| **SDR-201** | 住宿最晚抵达 | NEED_CONFIRM / REJECT |
| **SDR-202** | 安全日照窗口 | SUGGEST_REPAIR / REJECT |
| **SDR-203** | 固定活动可达性 | REJECT |
| **SDR-301** | 每日弹性节点 | CAUTION |
| **SDR-302** | 天气敏感活动替代 | CAUTION |
| **SDR-303** | 关键节点依赖 | 生成依赖影响（非阻断） |

---

## 14. 实施阶段

### Phase 0 — 契约冻结（立即）

**交付物：**

- [ ] 核心对象 TypeScript 契约（`tripnara/tep_self_drive@v1`）
- [ ] `RuleOutcome` / `ExecutabilityStatus` 统一
- [ ] 12 条 P0 规则目录（工程契约）
- [ ] `DecisionHook` / `RecoveryGraph` 契约
- [ ] Iceland Pack 接口扩展清单
- [ ] 验收 golden scenarios 索引

**目标：** 防止规划页面与 API 继续按「普通景点规划」演进。

### Phase 1 — 冰岛规划验证

实现 SDR-001～003、101～103、201～203、301～302；输出完整 `ExecutabilityStatus` 谱系。

### Phase 2 — Runtime 联动

Hook 命中 → Decision Problem → 影响范围 → 局部修复 → 用户确认 → Plan Version → 再验证。

### Phase 3 — 新西兰迁移

验证 Core 零目的地硬编码、Pack 可替换、UI 状态可复用。

---

## 15. 与现有系统映射（现状）

| 能力 | 现状 | Gap |
|------|------|-----|
| 道路关闭 BLOCK | `IS_ROAD_CLOSED_BLOCK` | 需映射到 `SDR-002` + 统一 `PlanningRuleResult` |
| 驾驶负荷 | `EXCESSIVE_DAILY_LOAD` | 需 `SDR-101` 确定性模型 + Pack 阈值 |
| 证据链 | `WorldStateAssertion` | 需强制写入 `ExecutabilityAssessment.evidenceRefs` |
| Plan Version | guardian-decision-core | 需与 `ExecutabilityAssessment` 门禁绑定 |
| 三入口规划 | Workbench / Guide / Exploration | 需收敛到 TEP Orchestrator（Phase 1+） |
| RecoveryGraph | 缺失 | Phase 0 契约冻结后实现 |

---

## 16. 相关文档

| 文档 | 用途 |
|------|------|
| [TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md](./TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md) | 规则 I/O、降级、裁决权、验收案例、**附录 A–E** |
| [backend-handoff-planning-constraints-p0.md](../../docs/backend-handoff-planning-constraints-p0.md) | 约束摘要 BFF |
| [ADR-ROAD-TRAVERSABILITY-MODEL.md](../architecture/ADR-ROAD-TRAVERSABILITY-MODEL.md) | 道路可通行模型 |
| [RFC-002_GLOBAL_DECISION_RUNTIME.md](../../docs/rfc/RFC-002_GLOBAL_DECISION_RUNTIME.md) | Decision Runtime |

---

## 17. 签收

| 角色 | 事项 | 签名 |
|------|------|------|
| Product | Product Foundation 方向冻结 | |
| Architecture | 四对象 + Core/Pack 边界认可 | |
| Engineering | Phase 0 契约可实施性评审 | |

**下一里程碑：** Phase 0 工程契约 **v0.2.0** 三方签收 → 创建 `src/trips/tep/contracts/` + `VerdictMapper` 骨架 PR
