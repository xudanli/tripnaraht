# Travel Memory Validation Loop（V1）— 证据驱动验证冻结

> ADR：[ADR-TRAVEL-MEMORY-RUNTIME](../../internal-docs/architecture/ADR-TRAVEL-MEMORY-RUNTIME.md)  
> 就绪：[`TMR_READINESS.md`](./TMR_READINESS.md)  
> **✅ Evidence Ingestion · ⚠️ Selective Soft Consume · ✅ Trip Shadow Pair + Outcome 回填**  
> 架构讨论已停止。禁止把验证基建误认为扩 Memory 能力。

## 唯一生产问题

不是「能不能存更多？」，而是：

> **这条 Memory 是否改变了正确的决策行为？**

验收单位：`Memory Record` → **`Memory-assisted Decision Episode`**  
（有 Shadow Pair 后可记 Without/With；有 Outcome 后才能答北向问题。）

北向问题：

> 在第 N 个真实 Trip 中，Memory 是否让 Nara 少犯了一次过去犯过的错误？

## 目标闭环

```
真实旅行事件 → Decision Context → Decision Kernel / CGUS
  → User Action → Outcome → Decision Episode
  → Memory Evaluation → 可复用证据 → 未来 Decision Context（经 Assembly）
```

## 今日真实链路

```
Agent → 旧 Memory OS → Decision/CGUS（+ 可选 TMR soft）→ Outcome Loop
  → TMR 写入 Episode
  → trip_shadow_pair 回填 → tripShadowCaseLog → Benefit/Harm / 北向问题草稿
```

## 最小验证闭环（冻结）

### 1. Decision Pair

每次 Memory 参与决策，生成可比较样本：

```json
{
  "decisionId": "D001",
  "baseline": { "context": "without_memory", "recommendation": "A" },
  "memory_assisted": {
    "context": "with_memory",
    "recommendation": "B",
    "memoryContribution": ["M001"]
  }
}
```

回答：没有这条 Memory，会不会做出不同选择？

### 2. Outcome Attribution（Acceptance ≠ 成功）

```
Decision Outcome
├── Acceptance
├── Execution Success
├── Satisfaction
├── Regret
├── Constraint Violation
└── Recovery Cost
```

例：接受冰川徒步，但延误 2h + 高疲劳 + 次日取消 → **不算 Memory 成功**。

### 3. Memory Contribution 必须可证明

```json
{
  "memoryContribution": {
    "used": true,
    "influence": [
      { "memoryId": "M123", "role": "PACE_CONSTRAINT", "weight": 0.34 }
    ]
  }
}
```

禁止：Memory 命中了，但 Decision 没用它 → 假提升。

### 4. Harm Rate 细分（总红线仍 8%）

| 类型 | 含义 |
|------|------|
| Direct Harm | 错误记忆直接导致错误决策 |
| Missed Benefit | 未造成错误，但错过机会 |
| Over-restriction | 过度保守（旅行 Agent 特有） |

### 5. Dependency + Context Authority Distribution

**Reality First, Memory Second。**

每次 Decision 观察：World / Booking / Team / Memory Evidence %。  
长期 `Memory > World` → 系统退化。

## Prisma Ledger = Decision Accountability

不是只迁表。核心查询（服务已挂；表需 `20260810_travel_memory_evidence_chain` migrate）：

| 查询 | 路由 | 状态 |
|------|------|------|
| 为什么这个建议出现？ | `GET /decision/{id}/explanation` | ✅ 服务 |
| 为什么认为有这个偏好？ | `GET /memory/{id}/evidence` | ✅ 服务 |

热路径进程内 Ledger 始终可查；DB 未就绪时 durable 静默降级。

## 系统边界（冻结）

**负责：** 保存决策证据、提供历史经验、解释、支持未来决策改善  

**不负责：** 规划路线、判断现实、替代 CGUS/World Model、自动学技能、自动改画像  

## Agent 学习闭环

```
World Model → Decision Engine → CGUS → Outcome → Travel Memory → Future Decision Improvement
```

不是：聊天 → Embedding → RAG → 回答。

## 变化唯一来源

```
真实 Trip → Decision Trace → Outcome → Memory Evaluation → 是否值得保留
```
