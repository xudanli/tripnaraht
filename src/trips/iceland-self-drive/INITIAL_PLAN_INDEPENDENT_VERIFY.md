# Initial Plan Independent VERIFY Bridge

## Allowed claim

> 系统已能够根据冰岛区域语义生成可解释的按日行程草案，并通过独立约束验证判断该草案是否可进入 Preview。

## Forbidden claims

- 求解器已经理解冰岛复杂约束
- OR-Tools 已完成冰岛多日规划
- Initial Plan 优化闭环已经完成
- 规划治理闭环已经完成
- Proposal 已经是可执行权威行程

## Roles

| Component | Role |
|-----------|------|
| `ICELAND_COVERAGE_DAY_ASSIGN` | **Preview Arrangement Engine** only |
| Generator internal check | `PREFLIGHT` (`authoritative: false`) |
| `IcelandShadowUnifiedAssessmentService` | **Authoritative** for `verificationMode: SHADOW` |
| Repair once | `terminal: false` — must re-VERIFY |

## Pipeline

```text
Proposal Day Plans
→ Preflight
→ Verification Snapshot
→ Shadow Unified Assessment (cid / slack / limit)
→ optional Repair Once
→ Second VERIFY
→ Verified / Blocked Preview Result
```

Never writes PlanVersion. `planVersionWriteCount === 0`.

## Audit

- `dominant_cid` — deterministic
- `drift_vector` — Arrange vs Proposal vs Repair
- `session_consistency_score` — fingerprint replay (≥0.99 expected)

## Fault injection

See `iceland-initial-plan-fault-injection.spec.ts` (Cases A–E).
