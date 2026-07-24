# Canary Kill-Switch & Rollback SOP（M4-RA-01）

> 开 `selected_trips` 前必读。谁拥有关闭权见 `authority.json` → `accountability.rollbackOwner`。

## 立刻关闭（≤ 2 分钟）

```bash
# Staging / target env
unset OR_TOOLS_AUTHORITATIVE_CANARY
# or: export OR_TOOLS_AUTHORITATIVE_CANARY=0
export OR_TOOLS_CANARY_STAGE=shadow
```

重启 / 热更配置后确认：

```bash
curl -s "$BASE/decision-engine/v1/ortools-shadow/authority/gate" | jq '.data.mode,.data.authoritativeRepairProviderId'
# expect: "shadow" , "neptune-repair"

curl -s "$BASE/decision-engine/v1/ortools-shadow/health" | jq '.data.canaryStage,.data.authoritativeCanaryFlag'
```

## 立即回滚触发（任一命中）

| 信号 | 来源 |
|------|------|
| Gateway bypass > 0 | canary dashboard `views.safety` |
| 未授权 Plan Version 写入 > 0 | 同上 |
| Evidence stale 后继续执行 > 0 | 同上 |
| booked 内容误改 > 0 | 同上 |
| 自动回落失败 > 0 | 同上 |
| duplicate Plan Version > 0 | 同上 |

```bash
curl -s "$BASE/decision-engine/v1/ortools-shadow/canary/dashboard" | jq '.data.views.safety,.data.safetyIncident'
```

`safetyIncident: true` ⇒ **先关 Canary，再排查**。

## 关闭后必须确认

1. 新 evaluate：`canary.authoritativeProviderId = neptune-repair`，`merged=false`  
2. 未执行的 OR-Tools 候选不再进入授权集（RD-05）  
3. Evidence 已变的旧 shadow：`selectUsableOrtToolsEvaluateShadow` → void（RD-06）  
4. 同一问题由 Neptune 重新生成，不复用旧 ortools candidateId（RD-07）  
5. 无重复 Plan Version / 决策卡（RD-08/09）  

### Authorize / Execute 硬拦（已接线）

对 `generatorVersion` 含 `ortools-repair` 的候选：

| 时机 | 行为 |
|------|------|
| Canary 已关 / 出 scope | `authorize` / `execute` → `ORTOOLS_CANARY_DISABLED`（400） |
| evaluate 时未 merge | `ORTOOLS_NOT_MERGED` |
| Evidence 版本漂移 | `ORTOOLS_EVIDENCE_STALE` |
| 同一 decisionId 再 finalize | `createPendingFromDecision` 返回已有 PlanVersion（RD-08） |
| 同一 decisionId 再 execute | apply executor 幂等 replay |

实现：`ortools-canary-authorization.guard.ts` + `Rfc001PlanVersionService.createPendingFromDecision`。

## 密封 Drill

```bash
npm run lab:seal-rollback-drill -- --result PASS --operator <you>
# or FAIL + --note "..."
```

产物：`planning-signoff/<date>/rollback-drill.json`

## 放量前后检查

```bash
npm run lab:go-no-go
npm run lab:pilot-preflight-status
npm run lab:authority-readiness
```

**禁止：** 关 Canary 失败时靠扩算法「修」；禁止跳过 Drill 直接 `5%`。
