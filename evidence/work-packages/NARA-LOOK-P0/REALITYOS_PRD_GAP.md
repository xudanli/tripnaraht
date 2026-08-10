# RealityOS PRD ↔ NARA-LOOK-P0 对照纪要

**Date:** 2026-07-26  
**PRD:** [`s0-contracts/TripNARA-Reality-Intelligence-RealityOS-PRD-v1.0.md`](./s0-contracts/TripNARA-Reality-Intelligence-RealityOS-PRD-v1.0.md)（PROPOSED）  
**Canvas:** `canvases/realityos-prd-look-gap.canvas.tsx`

---

## 一句话

RealityOS 是上位产品定义；NARA Look 是首个 Observation Channel。本仓已覆盖 **P0 主链 + 媒体上传 + 观察列表 + Authority + 停车 + 租车证据包 + PATCH context/Feedback + 行中 Mobile BFF**；相对 PRD，缺口主要在 **PDF 导出、iOS 真机联调、会签**。

---

## 强对齐

- Capture → Observation → Grounding → Assessment → Decision Entry → Preview → Confirm → **Existing Apply**
- `ObservationChannel = LOOK_FIELD`；不扩展 Assessment Lane
- 无 Look 专属 Apply；`writesPlanVersion = false`
- Observation ≠ 权威 World State（工程：`look.field_observation`）
- `AssessmentAuthority` + `contextHash`（S4-BE-05）
- API 命名映射：[`API_NAMING_MAP.md`](./API_NAMING_MAP.md)
- UNKNOWN / CONFLICTING / NO_GPS；驾驶限制；Member 不可 Apply
- 眼镜非 P0 依赖

---

## 主要差距

| PRD | 工程 | 动作 |
|-----|------|------|
| P0-A 停车规则 | ✅ S7-BE-01 `CHECK_PARKING` | 加深市政规则数据源 |
| P0-B 租车证据包 | ✅ S8-BE-01 `CHECK_RENTAL_HANDOVER` + `GET …/evidence-package` | PDF 导出 P0.5；实拍联调 |
| `AssessmentAuthority` | ✅ S4-BE-05 | — |
| `contextHash` | ✅ S4-BE-05 | — |
| API `reality-observations` | ✅ 映射表 | 可选 BFF 别名 |
| Feedback / PATCH context | ✅ S9-BE-01 | — |
| Media upload → mediaRef | ✅ `POST …/media` | 真机 multipart 联调 |
| Observation list VM | ✅ `GET …/observations` | 主页 limit=3 / 历史分页 |
| 行中 importantInfo | ✅ `in-trip-home` + overview-dashboard | 客户端停用 mapper 拼装 |
| iOS 15 页面 | handoff only | iOS Phase 0 |

---

## 建议

1. 会签 PRD（PROPOSED → APPROVED）  
2. **iOS Phase 0**（handoff + 五意图 + context/feedback）  
3. PDF EvidencePackage 导出（P0.5）
