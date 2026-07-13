# Weather Auto-Promotion Shadow Wiring Closure

**Effective:** 2026-07-12  
**Verdict:** **Weather Auto-Promotion Shadow Wiring Closure = PASS**  
**Evidence pack:** `internal-docs/operations/evidence/assertion-promotion-shadow-*` (2026-07-11 UTC)

---

## Closure statement

Collector 信号能够安全、幂等地进入 Promotion Shadow 层。接线、权限、幂等、Allowlist、Road 隔离以及对前端的零影响均已证明。

**当前最准确的结论：** 系统已证明 Collector 的信号能够安全、幂等地进入 Promotion Shadow；下一步要证明一次完整「风险出现—持续—恢复」的生命周期，以及服务端失败后的自动重试。

---

## Formal status table

| 状态行 | 当前值 |
|--------|--------|
| Assertion Auto-Promotion ADR | **ACCEPTED** |
| Internal Promotion Endpoint | **PASS** |
| Collector → Promotion Trigger | **PASS** |
| Weather Allowlist | **PASS** |
| Promotion Ledger | **PASS** |
| Duplicate Signal Suppression | **PASS** |
| Secret / Access Control | **PASS** |
| Reconcile Fallback | **PASS** |
| Retry Scheduler Wiring | **PRESENT** |
| Retry Scheduler Operational Drill | **PASS** |
| Visible Queue Impact | **ZERO** |
| DecisionProblem Writes | **ZERO** |
| Road Promotion | **OFF** |
| Live Promotion | **OFF** |
| `ASSERTION_PROMOTION_SHADOW_MODE` | **1** (保持) |
| Weather Shadow Wiring Closure | **PASS** |
| Weather Auto-Promotion Observation Closure | **PASS** |

---

## What this closure proves

| 维度 | 证据 |
|------|------|
| Collector → `:3002` promote | Vedur cron 18:30:03 UTC：CALM/SILENT ingest 同秒 `POST promote-assertion` 201 |
| CALM recovery shadow | `RECOVERY_SHADOW` on `weather:recovery:day:1:RECOVERY_OBSERVED` |
| 幂等 | 重复 CALM / 重复 promote → `skipped: true`，ledger 无新条目 |
| Allowlist | 非 Canary trip → `trip_not_on_promotion_allowlist` |
| Road 隔离 | `ASSERTION_PROMOTION_ROAD_ENABLED=0` → `predicate_not_enabled` |
| Secret | 错误 secret → 403 |
| 前端零影响 | `rfc001DecisionProblems` 0→0；`decision-queue openCount` 2→2 |
| Reconcile fallback | `:3002` 不可达后恢复 → 手动 promote / `monitoring/scan` 补回信号 |

---

## Retry Scheduler — 措辞约束

服务中断 drill 证明了：

```
Collector POST 失败 → 服务恢复 → 手动重放 / monitoring scan reconcile → 信号被补回
```

因此 **Reconcile Fallback = PASS**。

但 **不能** 记为 Retry Scheduler = PASS：`:3002` 完全不可达时 `failedQueue=[]`，请求未进入服务端 ledger，scheduler 无从自动重试。

若要关闭 Retry Scheduler Operational Drill，需构造：

```
请求已被 :3002 接收
  → promotion 执行阶段失败
  → ledger status = FAILED
  → attempts / nextRetryAt 写入
  → 5 分钟后 scheduler 重试
  → SHADOW_OBSERVED
  → attempts = 2
```

---

## Ledger 保留政策

**禁止** 为产生「新 cron 条目」而清除 `rfc001AssertionPromotionLedger`。

- 清除 ledger 会破坏幂等与审计证据
- 自然 CALM 重复本就应该被跳过

需要新样本时，优先采用：

- 新的 Weather Canary `dayIndex`
- 新的 `weatherEpisodeId`
- 受控 Canary fixture
- 新的语义状态变化

---

## Observation closure — 仍缺什么

当前仅证明 **CALM recovery 信号接线**。完整天气风险生命周期仍待验证：

```
CALM → STRONG_WIND → 重复 STRONG_WIND → CALM → CALM
```

| 阶段 | Shadow 预期 |
|------|-------------|
| 初始 CALM | `RECOVERY_SHADOW` 或幂等跳过 |
| 首次强风 | `SHADOW_OBSERVED` |
| 重复强风 | `SKIPPED`，无重复 projection |
| 第一次 CALM | recovery streak = 1 |
| 第二次 CALM | recovery eligible → `RECOVERY_SHADOW` |
| 全过程 | DecisionProblem 写入 0，Queue 变化 0 |

重点保留字段：`assertionId`、`eventId`、`promotionKey`、`stateFingerprint`、`weatherEpisodeId`、`streak`、`shadow impact`、Problem 数量前后对比。

---

## Next drills (ordered)

### 1. Hazard Lifecycle Drill

受控 Canary 数据（不必等待真实天气突变），证明：

```
ASSERTION_EMITTED → SHADOW_OBSERVED → duplicate suppressed
  → RECOVERY_OBSERVED × 2 → recovery shadow
```

### 2. Retry Scheduler Drill

在 `:3002` **内部**制造 pipeline/ledger 阶段可控失败（非整服务下线）：

```
第一次处理 → FAILED → attempts=1 → nextRetryAt 有值
  → 5 分钟后 scheduler 重试 → SHADOW_OBSERVED → attempts=2
```

---

## Completion criteria (Observation Closure)

两项 drill 均通过后，可更新为：

| 状态行 | 目标值 |
|--------|--------|
| Weather Auto-Promotion Observation Closure | **PASS** |
| Weather Recovery Shadow Closure | **PASS** |
| Promotion Retry Operational Drill | **PASS** |

仍保持：

- `ASSERTION_PROMOTION_SHADOW_MODE=1`
- Live Promotion = **OFF**
- Visible Queue Impact = **ZERO**
- Road Promotion = **OFF**

在此之后才讨论 Weather 有限 Live Canary。**禁止**在此之前将 Shadow 改为 0。

---

## References

- [ADR-ASSERTION-AUTO-PROMOTION-2026-07-12.md](../architecture/ADR-ASSERTION-AUTO-PROMOTION-2026-07-12.md)
- `config/decision-runtime/assertion-promotion.env`
- `scripts/validate-assertion-promotion-shadow.ts`
- Evidence: `assertion-promotion-shadow-summary-2026-07-11T183049Z.json`
