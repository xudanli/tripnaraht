# TripNARA Agent 架构

## AI-Native 决策系统

TripNARA 是一个以「旅行决策」为核心的 AI-native 系统，**不是**内容生成型旅行助手。

### 核心差异

| 维度 | 传统 AI 旅行产品 | TripNARA |
|------|-----------------|----------|
| 核心单位 | Prompt | **Decision Node** |
| 学习对象 | 文本 | 决策结果 |
| 护城河 | 模型 | 决策闭环 |
| UI | 对话 | 判断 |
| 迁移能力 | 低 | 极高 |

> **关键理念**：LLM 不在架构中心，它只是被调用的"推理器官"。

---

## 五层架构

```
┌──────────────────────────────────────────────┐
│           Decision Experience Layer          │
│   决策体验层（非页面 / 非表单 / 非对话）       │
│   - 决策理由可视化                           │
│   - 方案对比 / 回放 / 反事实模拟               │
├──────────────────────────────────────────────┤
│        Decision Orchestration Layer          │
│   决策编排层（Multi-Agent + CoW）             │
│   - 问题拆解 / 并行推理 / 冲突解决              │
│   - Plan A/B/C 生成与权重调整                  │
├──────────────────────────────────────────────┤
│          Decision Core Engine                │
│   决策内核（TripNARA 的"心脏"）               │
│   - 约束系统（Hard / Soft）                   │
│   - 权衡模型（时间/成本/体验/风险）            │
│   - 不确定性评估                              │
├──────────────────────────────────────────────┤
│       World Model & Context Layer            │
│   世界模型层（结构化现实）                     │
│   - 地理 / 气候 / 交通 / 成本波动               │
│   - 风险 / 情绪 / 体力消耗模型                  │
├──────────────────────────────────────────────┤
│        Signal & Feedback Loop                │
│   信号与学习层（RLHF / 行为反馈）               │
│   - 行为信号 / 决策结果 / 执行偏差               │
│   - 决策质量自学习                            │
└──────────────────────────────────────────────┘
```

---

## 最小原子：Decision Node

TripNARA 的最小单位**不是**页面、表单或功能按钮，而是 **Decision Node**。

```typescript
interface DecisionNode {
  context: WorldState;           // 世界状态（地理/天气/交通/成本）
  constraints: HardConstraint[]; // 不能违反的事实
  preferences: SoftPreference[]; // 可妥协的偏好
  options: Option[];             // 可选方案集合
  tradeOff: TradeOffModel;       // 权衡逻辑
  confidence: number;            // 置信度 (0..1)
  uncertainty: UncertaintyProfile; // 不确定性分布
}
```

> **UI 只是 Decision Node 的"投影"**

---

## Decision Core Engine（护城河）

### 三类决策元素

#### 1. Hard Constraints（不可违背）
- 签证 / 封路 / 航班不可达
- 天气阈值（风速、降雪）
- 体力极限
- 营业时间硬限制

#### 2. Soft Preferences（可调节）
- 风景 vs 舒适
- 自驾 vs 公交
- 冒险 vs 安全
- 预算敏感度

#### 3. Trade-off 模型（TripNARA 独有）
- 用「损失函数」而不是排序
- 每个方案都带「代价说明」
- 量化「你在为哪种风险付费」

### 不确定性是一等公民

TripNARA 不追求"确定答案"，而是输出多方案 + 风险分布：

```
Plan A：最优体验（风险 30%）
Plan B：稳妥方案（风险 12%）
Plan C：保底方案（风险 5%）
```

UI 展示的是：**「你在为哪种风险付费」**

---

## Agent 分工

### Conductor Agent（编排层）

| Agent | 职责 |
|-------|------|
| **PlanningWorkbench** | Conductor - 拆问题、聚合冲突、输出可解释决策 |

### Domain Agents（世界模型层）

| Agent | 职责 |
|-------|------|
| **GeoAgent** | 地理结构 & 路线可行性 |
| **WeatherAgent** | 气象条件 & 封路概率 |
| **CostAgent** | 价格曲线 & 预算优化 |
| **ExperienceAgent** | 体验密度 & 节奏优化 |

### Core Decision Agents（决策内核）

| Agent | 职责 | 映射人格 |
|-------|------|----------|
| **Planner** | Decision Node 拆解、缺口识别、方案结构设计 | - |
| **Gatekeeper** | 约束守门（Hard/Soft）、Should-Exist Gate | Abu |
| **CoreDecision** | 权衡模型、多方案评估、不确定性量化 | Dr.Dre |
| **LocalInsight** | 世界模型注入、替代方案、空间修复 | Neptune |
| **Compliance** | 风险分类、合规检查、免责留痕 | - |

### Experience Agents（体验层）

| Agent | 职责 |
|-------|------|
| **Narrator** | 决策理由可视化、排除过程展示 |
| **TripDetail** | 决策回放、反事实模拟（What-if）、历史风格建模 |
| **Execution** | 执行信号采集、偏差反馈、RLHF 闭环 |

---

## Decision Experience 原则

### 原则 1：展示"排除过程"而非"结果"

```
❌「这是你的行程」
✅「我排除了 4 个方案，原因是……」
```

### 原则 2：用户是裁判，不是输入员

不是填偏好，而是做判断：
- 「你更讨厌哪种失败？」
- 「你愿意为确定性牺牲多少体验？」

### 原则 3：决策可回放、可反悔、可学习

- 决策 replay（时间轴回溯）
- 假设模拟（What if）
- 历史决策风格建模

---

## Agent 文件清单

### Core Decision Agents

1. **Planner** (`Planner.md`) - Decision Node 拆解
2. **Gatekeeper** (`Gatekeeper.md`) - 约束守门（Abu）
3. **CoreDecision** (`CoreDecision.md`) - 权衡与选择（Dr.Dre）
4. **LocalInsight** (`LocalInsight.md`) - 世界模型注入（Neptune）
5. **Compliance** (`Compliance.md`) - 风险与合规

### Domain Agents

6. **GeoAgent** (`GeoAgent.md`) - 地理 & 路线
7. **WeatherAgent** (`WeatherAgent.md`) - 气象 & 封路
8. **CostAgent** (`CostAgent.md`) - 价格 & 预算
9. **ExperienceAgent** (`ExperienceAgent.md`) - 体验 & 节奏

### Orchestration & Experience

10. **PlanningWorkbench** (`PlanningWorkbench.md`) - Conductor Agent
11. **Narrator** (`Narrator.md`) - 决策可视化
12. **TripDetail** (`TripDetail.md`) - 决策回放
13. **Execution** (`Execution.md`) - 信号与反馈

---

## 参考文档

- `.claude/roles/AGENT_COLLABORATION.md` - Agent 协作机制
- `.claude/roles/MULTI_AGENT_COLLABORATION.md` - 多角色协作机制
- `docs/ROLES_AND_COLLABORATION.md` - 角色定义与协作关系
