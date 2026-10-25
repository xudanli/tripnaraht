# TripNARA Proactive Decision V1 — Phase 4 Production Readiness Plan（冻结）

**文档版本：** 1.0.0  
**状态：** **FROZEN** — 能力建设结束；进入验证与放量，**不开 PD-11**  
**日期：** 2026-08-11  
**上位：** [RFC-PD-001](./rfc-proactive-decision-v1.md) · [Engineering Backlog](./rfc-proactive-decision-v1-engineering-backlog.md) · [Canary Plan](./PROACTIVE-DECISION-V1-CANARY-PLAN.md) · [iOS Handoff](../../src/trips/proactive-decision/PROACTIVE_DECISION_IOS_HANDOFF.md)

---

## 当前状态一句话（冻结表述）

> TripNARA Proactive Decision V1 已完成 Observe→Impact→Decision→Intervention→Apply 全链路闭环，并接入 Mobile 消费能力。当前进入 Phase 4 Production Readiness，重点从能力建设转向主动建议质量、用户信任和干预时机验证；下一阶段通过 Shadow/Canary 数据验证「什么时候 Nara 应该出现」，而不是继续扩展功能。

**不要再加能力，开始收集真实 Decision Outcome。**  
这才是与普通 Agent 产品拉开的数据壁垒。

---

## Production Readiness 评估（~90%）

```text
                 TripNARA Proactive Decision V1
                    Production Readiness ~90%

              ┌──────────┴──────────┐
              Backend Runtime        ✅
              Decision Intelligence  ✅
              Safety Governance      ✅
              Memory Feedback        ✅
              Mobile Consumption     ✅
              User Experience        🟡  iOS 完整体验验收
              Real User Validation   🟡  Shadow / Canary 数据
              Production Rollout     ⏳  会签后放量
```

| 维度 | 状态 | 说明 |
|---|---|---|
| Backend Runtime | ✅ | WorldSignal→…→Apply 闭环 |
| Decision Intelligence | ✅ | Lens + CGUS-shaped + Hard Gate |
| Safety Governance | ✅ | Confirm→Apply；Push/AutoApply 关 |
| Memory Feedback | ✅ | Silent Learning → Travel Memory + Outcome Review |
| Mobile Consumption | ✅ | BFF + L1/L2/Trace 契约 |
| User Experience | 🟡 | iOS 认知文案与 Confirm 闭环待验收 |
| Real User Validation | 🟡 | 运营 Shadow / Decision Dataset |
| Production Rollout | ⏳ | 会签 + 指标门禁 |

---

## 一、已完成的核心能力（冻结）

### 1. 主动决策 Runtime 已闭环

```text
World Signal → Impact → Decision Problem → Lens Activation
  → CGUS Synthesis → Verification → Intervention Gate
  → Change Draft → Confirm → Apply → Outcome / Memory
```

TripNARA 已不是「天气提醒功能」，而是：

**旅行状态变化驱动的 Decision Runtime。**

### 2. 三人格已进入生产机制（非包装）

```text
                 Decision Problem
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      Abu            Dr.Dre         Neptune
   现实约束          人体验          修复方案
   Can I?          Should I?         How?
        └──────────────┼──────────────┘
                       ↓
                     CGUS
              Decision Synthesis
```

冻结纪律：

- Abu Hard Gate **不可绕过**
- Neptune **不是**万能修复；按需激活
- 三人格按 Lens Activation Policy 触发

### 3. 最大产品突破：Intervention Intelligence

主动 Agent 最大问题不是「能不能发现问题」，而是：

**什么时候应该说话。**

```text
Observation → Impact → Decision → Intervention Value → 是否打扰用户
```

公式（冻结）：

```text
Improvement × Confidence × Actionability − Attention Cost
```

这是 TripNARA 主动能力的核心护栏。

### 4. 用户体验分层（冻结）

| Stage | 名称 | 用户可见 | 目标 |
|---|---|---|---|
| **0** | SHADOW | 否 | 判断是否正确、建议是否合理、是否应出现 |
| **1** | L1 Passive | 被动条带 | 建立信任；不打断（执行首页 / 今日行程） |
| **2** | L2 High Value Interrupt | 打断卡 | 仅 `IV > 0.2` ∧ `Confidence > 0.9` ∧ Actionable |

未来用户对 AI 最大不满往往不是「不聪明」，而是「太吵」。

---

## 二、永久冻结（禁止项）

| 禁止 | 原因 |
|---|---|
| ❌ **PD-11 / 继续扩能力** | V1 能力建设已结束 |
| ❌ **Push 自动通知** | 旅行场景注意力成本极高 |
| ❌ **Auto Apply** | 旅行计划是高责任决策；必须 Recommend → Preview → Confirm → Apply |
| ❌ **新建平行 Decision Agent** | 保持既有 Decision Runtime + Proactive 薄编排 |

---

## 三、Phase 4 剩余工作（非研发扩能力）

### P0 — iOS 体验验收

重点不是 API，而是完整体验：

1. **卡片认知文案**

不要：Weather Alert / Decision Case / Impact DTO  

应像：

```text
下午黑沙滩计划可能需要调整
因为：风力增强
影响：今天 16:00 黑沙滩
建议：改到明早
```

2. **Confirm 闭环**

```text
查看方案 → 确认调整 → Today's Plan 更新 → 状态恢复
```

禁止确认后停留在 AI 对话页。

验收清单见 [iOS Handoff](../../src/trips/proactive-decision/PROACTIVE_DECISION_IOS_HANDOFF.md)。

### P1 — 运营 Shadow（积累 Decision Dataset）

每一次主动决策记录（用户不可见亦可）：

```json
{
  "trigger": "weather_change",
  "impact": true,
  "recommended": true,
  "user_visible": false,
  "user_action": null,
  "outcome": null
}
```

工程已有：Shadow Log · Decision Trace · Silent Learning Memory。  
运营目标：持续写入真实 Trip，形成 **Travel Decision Dataset**。

### P1 — 核心指标（不要看触发次数）

| 指标 | 问题 |
|---|---|
| **Useful Intervention Rate** | 发出的建议是否真有价值？ |
| **Accept Rate** | 用户是否相信 Nara？ |
| **False Positive Rate** | Nara 是否制造噪音？ |
| **Regret Reduction** | 是否减少错过体验 / 风险事件 / 行程后悔？ |

---

## 四、下一阶段命名（Phase 5）

**不要再叫：**「Proactive Decision 开发」——开发已结束。

**建议命名：**

# Phase 5 — Travel Decision Intelligence Validation

**目标：**验证 Nara **是否知道什么时候应该介入**。

| Goal | 含义 |
|---|---|
| **G1** Impact Precision ↑ | 提高判断准确率 |
| **G2** Useful Intervention Rate ↑ | 提高建议价值 |
| **G3** Accept ↑ · Regret ↓ | 建立用户信任 |

入口条件：Phase 4 iOS 验收清单通过 + Shadow 样本达到 Canary 门禁下限。

---

## 五、战略变化（冻结叙事）

**以前：**

```text
用户打开 App → 问 Nara → 得到答案
```

**现在：**

```text
Trip World → Nara Observe → 发现变化 → 理解影响
  → 提出行动 → 用户确认 → 旅行状态持续优化
```

从 **AI Travel Assistant** 走向 **Travel Decision Operating System**。

---

## 六、会签

| 角色 | 结论 | 日期 |
|---|---|---|
| Product | ☐ 同意冻结 Phase 4 / 进入验证 | |
| Algorithm | ☐ 同意指标与 High-Value 门禁 | |
| Engineering | ☐ 同意不开 PD-11 / 禁 Push·AutoApply | |
| Client | ☐ 同意 iOS 验收清单 | |

会签后：Stage 0 Shadow 运营波次 → 再议 L1 / L2 放量（仍禁止 Push）。
