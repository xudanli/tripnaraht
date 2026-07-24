# POST_RELEASE_MONITORING — V3.1 Agent Interface Hardening

**Window:** 7–14 days after deploy  
**Do not** reopen all DEFER items by default — only on trigger (below).

## Metrics / signals to watch

| Signal | Why |
|--------|-----|
| `route_and_run` error rate | Main entry stability |
| Gate Block 比例 | Gate Block Scope regressions |
| Verify / Repair 次数 | Plan-verify loop health |
| REPAIR budget exhaustion | Post-plan / R2R contract pressure |
| Flawed Draft opt-in 次数 | Explicit opt-in audit path |
| 幂等冲突 / 重复提交 | Unified Execute + Actions Commit |
| Stale context（Arrange dual-signal / TEP / Mobile） | Freshness regressions |
| Module-load / dangling import anomalies | C018R / CI Guard regression |
| Shadow leak guard 命中 | OR-Tools must stay non-authoritative |
| HTTP 失败 vs business `delivery_verdict` 分布 | Delivery contract health |

## Reopen DEFER only on trigger

| Trigger signal | Reopen work |
|----------------|-------------|
| lost update / stale write across corridors | 跨走廊并发 E2E |
| 客户端开始正式接 Apply | Web/iOS 合规审计 |
| Iceland/Mobile Apply 准备上线 | Rollback 与写回闭环 |
| Shadow 样本达到门槛 | OR-Tools RFC 下一阶段 |
| 局部 freshness 不一致 | TravelContext 收敛评估 |
| 重复写入或幂等异常 | Unified/Actions 深度加固 |

## Rollback posture

Retain fast rollback of this release train and keep OR-Tools Shadow kill/disable path available.
