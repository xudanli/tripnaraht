# M4 Authority Canary — Release Authorization Gate

> **当前工作项：[M4-RA-01 Selected Trips Pilot](./M4_RA_01_SELECTED_TRIPS_PILOT.md)**  
> M4 = **Release Authorization Gate**（不是 Engineering Gate）。  
> 不要用 `OR_TOOLS_AUTHORITATIVE_CANARY=1` 当作唯一解锁开关。

---

## 解锁链

```
Engineering Artifacts PASS
        ↓
Product Approval Package (authority.json, 受限 scope)
        ↓
Authority Token (artifactHash + env + ops + expiry)
        ↓
Rollback Drill
        ↓
selected_trips canary
        ↓
(later) 5% → 20% → 50% → 100%
```

## 首批 Scope（硬边界）

允许：`SHIFT` `SWAP` `SHORTEN` `REROUTE`  
排除：`MOVE_DAY` `REPLACE` `AUTO_ARRANGE`、高风险道路、booked 取消/跨日  

## 关键命令

```bash
npm run lab:prepare-product-approval
# product → APPROVED
OR_TOOLS_AUTHORITY_TOKEN_SECRET=... OR_TOOLS_AUTHORITY_ENVIRONMENT=staging \
  npm run lab:mint-authority-token
npm run lab:rollback-drill -- --checklist
# fill selected-trips.whitelist.json
export OR_TOOLS_AUTHORITY_TOKEN=...
export OR_TOOLS_CANARY_STAGE=selected_trips
export OR_TOOLS_AUTHORITATIVE_CANARY=1
npm run lab:authority-readiness
```

Token 校验：`signoffId` · `artifactHash(authority.json)` · `environment` · `provider=ortools-repair` · `allowedOperations ⊆ scope` · `expiresAt`.

Percent 阶段额外需要 `OR_TOOLS_CANARY_PERCENT_APPROVED=1`（M4-RA-01 不设）。

## Ops

| Endpoint | 用途 |
|----------|------|
| `GET .../authority/gate` | Release checklist |
| `GET .../canary/dashboard` | 授权链硬零 + provider 角色 |
| `GET .../health` | `canaryStage` + whitelist count |

回滚：清 canary flag / `OR_TOOLS_CANARY_STAGE=shadow` → `neptune-repair`。
