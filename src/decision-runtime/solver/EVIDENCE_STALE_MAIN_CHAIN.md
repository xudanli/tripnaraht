# Evidence Stale 主链化 — P2

> **状态：DONE（2026-07-15）**  
> Shadow 附件绑定 Evidence/snapshot；版本漂移 → **丢弃旧 shadow、强制重算**。  
> 仍不晋升权威。

参考：[ADR-008](../ADR-008-OR-Tools-Candidate-Provider.md) ·
[`ortools-shadow-evidence-freshness.util.ts`](./lab/ortools-shadow-evidence-freshness.util.ts)

---

## 规则

1. Attach 时写入 `evidenceVersionId` / `snapshotId`（evaluate ≈ `problem.worldStateSnapshotId`；planning ≈ `ctx:{contextVersion}`）。
2. 主链消费前调用 `selectUsableOrtToolsEvaluateShadow`；stale 或 `shadowAuthority===true` → `undefined`。
3. Evaluate 复用 workspace 时：若 prior shadow 相对当前 Evidence  stale → `recordStaleDiscard` + 重新 `bridge.run` + stamp `discardedStalePrior`。
4. Apply 永不写 `ortoolsShadow.shadowChanges`；planning 另用 `selectUsableOrtToolsPlanningShadow`。

## 可观测字段

| 字段 | 含义 |
|------|------|
| `evidenceFreshness` | `FRESH` \| `STALE` |
| `discardedStalePrior` | 本次因 stale 丢弃了 prior |
| `evidenceBoundAt` | stamp 时间 |
| metrics `staleDiscardTotal` | 丢弃次数 |

## 非目标

- ❌ 用 stale 检查替代 Gateway  
- ❌ 把 OR-Tools 推成 authoritative  
- ❌ MOVE_DAY / multi-day（M2）
