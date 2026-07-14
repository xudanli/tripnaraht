# M4-RA-01B — Selected Trips Execution

> **前置：** [M4-RA-01A Pilot Preflight](./M4_RA_01A_PILOT_PREFLIGHT.md) = READY  
> **工作项：** 真实 10 条行程到位后的 Controlled Authoritative Canary  
> **不扩：** Solver 算法、MOVE_DAY、synthetic gold 数量、全量 `repairCandidates`

目标：从 **Production Ready（Shadow）** 进入 **Controlled Authoritative Canary**（仅 `selected_trips`）。

---

## 验收标准

| # | 标准 |
|---|------|
| 1 | `authority.json` 为受限 Scope 且产品 **APPROVED** |
| 2 | Authority Token 与 `authority.json` artifact hash / env / ops / expiry 对齐 |
| 3 | 白名单 10–20 条行程已填入 `selected-trips.whitelist.json`（非随机生产流量） |
| 4 | OR-Tools **仅**在批准 operation scope 内可升为候选权威源 |
| 5 | Decision Runtime 仍为最终验证与写入权威 |
| 6 | Rollback Drill 通过（运行态，不仅是脚本） |
| 7 | Canary 看板指标可审计 |

---

## 首批授权范围（硬边界）

**允许：** `SHIFT` · `SWAP` · `SHORTEN` · `REROUTE`  
**排除：** `MOVE_DAY` · `REPLACE` · `AUTO_ARRANGE` · 高风险道路选择 · booked 取消/跨日迁移  

`tripSelectionMode`: **selected_trips** only（未通过前禁止 `5%+`）

---

## 执行顺序

```bash
# 1) Engineering 已密封后，生成产品签核包 DRAFT
npm run lab:prepare-product-approval

# 2) 产品填写 accountability，将 authority.json → status=APPROVED, approved=true
# 3) Mint token（绑定 artifactHash）
OR_TOOLS_AUTHORITY_TOKEN_SECRET=... \
OR_TOOLS_AUTHORITY_ENVIRONMENT=staging \
  npm run lab:mint-authority-token

# 4) Rollback drill（先 checklist，再 live）
npm run lab:rollback-drill -- --checklist

# 5) 填白名单 tripIds → selected-trips.whitelist.json

# 6) 开启 selected_trips（不要直接 5%）
export OR_TOOLS_AUTHORITY_TOKEN=...
export OR_TOOLS_CANARY_STAGE=selected_trips
export OR_TOOLS_AUTHORITATIVE_CANARY=1

npm run lab:authority-readiness
```

---

## Canary 晋级（本工作项之后）

| 阶段 | 最短观察 | 晋级条件 |
|------|----------|----------|
| selected_trips | 3–5 天 | 零安全事故，人工抽检通过 |
| 5% | 7 天 | 核心错误 0，fallback 稳定 |
| 20% | 7–14 天 | 不劣于 Neptune |
| 50% | 14 天 | 产品+工程联合复核 |
| 100% | 单独批准 | 正式 Provider 切换 |

---

## 看板（授权链）

`GET .../ortools-shadow/canary/dashboard`（及 `OrToolsCanaryDashboardCollector`）

硬零：Gateway 绕过 / 未授权 Plan Version / stale 继续执行 / booked 误改 / 自动回落失败 / executability 恶化。

Provider 链：`candidateProvider` · `decisionAuthority` · `writeAuthorizer` · `fallbackProvider`。

---

## 冻结清单

- 新增 Solver 算法  
- 扩大 MOVE_DAY  
- 追更多 synthetic gold  
- OR-Tools 进入全部 repairCandidates  
- 把 `OR_TOOLS_AUTHORITATIVE_CANARY=1` 当成唯一解锁开关  
- 宣称 Planning Engine 已全面权威化  
