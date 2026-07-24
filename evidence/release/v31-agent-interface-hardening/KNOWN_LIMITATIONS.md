# KNOWN_LIMITATIONS — V3.1 Agent Interface Hardening release

本轮发布**已知限制**。不得在发布说明中写成已验证能力。

| Limitation | Claim / gate | Release implication |
|------------|--------------|---------------------|
| 无生产 Web/iOS 协议遵从证据 | C025b DEFER | 不得宣称端到端客户端合规 |
| 无大型跨走廊并发写回 E2E | C024b DEFER | 不得开放/宣称多走廊同 trip 并发写保证 |
| Iceland Apply 不在本轮；Rollback 未覆盖 | C023f / C010b lineage | Iceland Confirm/Apply OUT OF SCOPE |
| Mobile Verified Apply 不在本轮；Rollback 未覆盖 | C023g | Mobile Verified Apply OUT OF SCOPE |
| OR-Tools Authority 禁止 | C026, C031 BLOCKED | Shadow only；禁止权威 Apply |
| TravelContext 非全局运行时 SSOT | C021, C021b | 仅局部 freshness 库存（CTX-1）；禁止强制接管主链 |
| Actions rollback 为产品 stub | C023b | HTTP 200 ≠ 补偿写回 |
| Unified rollback 无跨产品补偿总线 | C023 | 仅 Canonical Runtime 决策回滚链 |
| v1 C018 历史 BASELINE_INCOMPLETE | C018 HISTORICAL | 以 C018R 为准；勿把历史 FAIL 当作当前 tip 状态 |

完整 Owner / Reopen Trigger：`evidence/claim-evidence-matrix-v2/DEFER_BLOCKED_REGISTRY.md`。
