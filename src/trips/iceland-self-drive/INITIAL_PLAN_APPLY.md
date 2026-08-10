# Initial Plan Apply / PlanVersion Contract

## Allowed claim

> 用户确认后的 Iceland Initial Plan Preview 可 **Apply** 写入正式行程：Prisma `Trip` / `TripDay` / `ItineraryItem` + Iceland PlanVersion 审计记录（覆盖日分配草案 + Shadow VERIFY + 用户 Confirm）。

## Forbidden claims

- Apply = OR-Tools 已完成权威优化 / 闭环求解
- Apply = arrange `ortoolsShadow.shadowChanges` 写回
- 未 Confirm 即可 Apply
- `status === VERIFIED` 即自动可 Apply

## Gate

```text
canApply =
  status === CONFIRMED
  AND confirmationRecord present
  AND proposal.contextVersion/Hash === shell
```

## HTTP

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/iceland-self-drive/trips/:tripId/initial-plan/proposals/:proposalId/apply` | Apply |

### Request

```json
{
  "contextVersion": 1,
  "contextHash": "…",
  "note": "optional"
}
```

### Response highlights

- `status: "APPLIED"`
- `planVersionId`, `appliedItemCount`
- `writesPlanVersion: true`
- `persistence: "prisma"`
- `prismaTripId`（默认 = shell `tripId`）
- `planVersionWriteCount` ≥ 1
- 幂等：重复 Apply 返回同一 `planVersionId`，不重复写库 / 不重复计数

### Errors

| Code | When |
|------|------|
| `APPLY_NOT_ALLOWED` | 非 CONFIRMED |
| `CONTEXT_STALE` / `CONTEXT_*_CONFLICT` | 上下文不匹配 |
| `NO_APPLIABLE_ITEMS` | 无可写 place 项 |
| `NO_VALID_PLACE_IDS` | placeId 均不在 Place 表 |
| `PROPOSAL_STALE` | STALE / SUPERSEDED |

## Persistence（Prisma 绑定）

正式写链（P0）：

`EffectivePlanWriteGuard` + `EffectivePlanWriter.runExecute` + Prisma materialize  
（注册表 id：`iceland.initial-plan.apply` / disposition `FORMAL_CHAIN`）

| Store | Role |
|-------|------|
| `Trip` | `id = shell.tripId`；`destination=IS`；metadata.initialPlan 审计 |
| `TripDay` | 按 travelDates 逐日创建（若尚无） |
| `TripCollaborator` | OWNER = apply 用户 |
| `ItineraryItem` | ACTIVITY；`placeId` + start/end（UTC day + HH:mm） |
| `IcelandAppliedPlanRepository` | PlanVersion 审计镜像（含真实 itineraryItemId） |
| Proposal `APPLIED` / Shell `ITINERARY_APPLIED` | 终态 |

物化规则：

1. 投影 `dayPlans` 中带 `placeId` 且非 `EXPERIENCE_OPTIONAL` 的项
2. 校验 Place 目录存在
3. 事务内：ensure Trip → ensure TripDays → ensure OWNER → create ItineraryItems
4. `itineraryItemId` 使用 DB UUID（非临时 `ii_…`）

服务：`IcelandInitialPlanPrismaApplyService.materialize`（经 `EffectivePlanWriter`）  
时间工具复用 arrange：`buildDayDateTime` / `resolveTripDayByIndex`。

## Provenance（必须保留）

- `sourceEngine: ICELAND_COVERAGE_DAY_ASSIGN`
- `verificationAuthority: ICELAND_SHADOW_UNIFIED_ASSESSMENT`
- Trip.metadata.initialPlan 同上

## FE

```ts
const ui = previewUiFlags(preview);
if (ui.showApplyCta) {
  const res = await client.applyProposal(tripId, proposalId, {
    contextVersion: shell.contextVersion,
    contextHash: shell.contextHash,
  });
  // res.persistence === 'prisma'
  // res.prismaTripId 可用于平台行程页
}
```

## Next

- Shadow vs 平台对照已接线 Preview + Gateway + Apply 后 `buildBundle` — see `INITIAL_PLAN_SHADOW_VS_PLATFORM.md`
- OR-Tools 仍属后续，且不得成为本 Apply 权威
