# RELEASE_SCOPE — V3.1 Agent Interface Hardening

**Release train:** V3.1 Agent Interface Engineering Hardening  
**Not:** whole TripNARA system readiness  
**Stance:** Evidence-backed backend hardening only  

| Pin | Value |
|-----|--------|
| Implementation baseline | `bc6e2e6d5a087a6a20c47576ebdba295370ebec1` |
| Evidence branch tip (pre-merge) | `c1b7df504` (includes release pack; was `e33e214c4` at Delta complete) |
| Annotated tag | `claim-evidence-matrix-v2.0` → `c76fff36766e203065bd73e157e19fbf23fb02a7` |
| Matrix | `CLAIM_EVIDENCE_MATRIX_v2.0` **FROZEN** |
| Delta | `V32_DELTA_ASSESSMENT.md` **COMPLETE** |
| Final merge commit | _pending GitHub merge_ |

---

## IN SCOPE

- `route_and_run` 主入口加固
- C018 修复（C018R）及主入口可加载性（C001 PASS）
- OpenAPI 契约冻结（`execution_mode` / `allow_flawed_draft_narrate`）
- Post-plan / REPAIR / R2R 合同加固
- Gate Block Scope 文档与合同
- Flawed Draft 显式 opt-in 审计
- Unified / Actions 幂等保护
- CI freeze smoke / dangling import guard
- EWP-01…07 与 Matrix v2 证据治理
- Scoped 事实票：WB-1 / RB-1 / CC-1 / BFF-1 / CTX-1（契约与文档，非架构重写）

---

## OUT OF RELEASE SCOPE

- 生产 Web/iOS 协议遵从结论
- 跨走廊大型并发写回保证
- Iceland Confirm/Apply
- Mobile Verified Apply
- Iceland/Mobile Rollback
- OR-Tools authoritative Apply
- 全局 TravelContext SSOT
- Proposal 大一统
- 微服务 / CQRS / GraphQL 重构

只要以上排除项**未被包装成“已验证能力”**，它们**不自动阻断**本轮后端加固版本发布。

---

## 不得对外宣称

- Web/iOS 端到端合规已验证  
- Iceland / Mobile Apply 或 Rollback 已闭环  
- 跨走廊并发写回已保证  
- OR-Tools 可权威 Apply  
- TravelContext 已是全局运行时 SSOT  
- 整个 TripNARA 系统已全面就绪  

允许宣称（在 CONDITIONAL GO 且范围隔离落实后）：

- **V3.1 智能体接口工程加固基线**已具备进入/通过发布评审条件（以后续 `RELEASE_READINESS_DECISION.md` 为准）
