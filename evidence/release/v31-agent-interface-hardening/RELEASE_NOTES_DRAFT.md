# RELEASE_NOTES_DRAFT — V3.1 Agent Interface Hardening

Use only after Release Readiness Decision is **GO** (or CONDITIONAL with unmet conditions cleared).

## 本次发布包含

- 后端智能体接口工程加固  
- 主入口与 Post-plan 契约保护  
- OpenAPI 冻结（`execution_mode` / `allow_flawed_draft_narrate`）  
- 幂等、审计和 CI Guard  
- Matrix v2 证据基线（FROZEN）  

## 本次不得宣称

- Web/iOS 已端到端验证  
- Iceland/Mobile Apply 已完成  
- Rollback 已全面完成  
- 跨走廊并发已全面验证  
- OR-Tools 已获得权威写回权限  
- TravelContext 已成为全局 SSOT  
- 整个 TripNARA 系统已全面就绪  

## Pins

- Implementation baseline: `bc6e2e6d5a087a6a20c47576ebdba295370ebec1`  
- Release commit: `b5127ae942f81ea32216c073d7814db5e37b4e8a`  
- Release tag: `v31-agent-interface-hardening-rc1`  
- Evidence tag: `claim-evidence-matrix-v2.0` → `c76fff36766e203065bd73e157e19fbf23fb02a7`  
- Post-merge documentation commit: `0f50ca864` (docs only)  
- Decision: **GO — V3.1 Agent Interface Hardening Baseline Only**  
- `github_pr_approval: NOT_PERFORMED` · `direct_merge_exception: ACCEPTED`  
