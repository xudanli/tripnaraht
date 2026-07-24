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

## Pins (fill merge fields from MERGE_RECORD.md)

- Implementation baseline: `bc6e2e6d5…`  
- Evidence tag: `claim-evidence-matrix-v2.0` → `c76fff367…`  
- Release tag / merge commit: _pending_  
