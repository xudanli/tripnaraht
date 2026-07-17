# ETA-L2-EXECUTION-ACTUAL-01

**定位：** 基于行程执行确认事件，采集段级实际车程，并与出发时的 Base / Planning ETA 对账。

**不是：** 导航、GPS 轨迹产品、实时 ETA、偏航识别、道路状态监控。

**只回答：** 规划时建议预留的车程，真实执行后有没有被打脸？

```text
开始这段车程
→ 我到了
→ 可选剔除非驾驶停留
→ Actual Driving Duration
→ 绑定出发时 travelEtaSnapshot
→ Reconciliation
```

GPS 全程关闭仍可完成闭环。

---

## 交付

| # | 项 | 状态 | 路径 |
|---|----|------|------|
| 1 | P0 事件：DEPARTED / ARRIVED / STOP | ✅ | `contracts/travel-eta-field-events.contract.ts` |
| 2 | Actual 三元组 + 质量门 | ✅ | `contracts/travel-eta-actual.contract.ts` |
| 3 | Execution Reconciliation | ✅ | `contracts/travel-eta-reconciliation.contract.ts` |
| 4 | 误差归因（运营后台） | ✅ | `ops/travel-eta-error-attribution.ts` |
| 5 | Pilot 精简清单 | ✅ | `ops/ETA_L2_PILOT_CHECKLIST.md` |
| 6 | 规划 / 执行两类前端证据 | ✅ | `ops/TRAVEL_ETA_FE_EVIDENCE.md` |
| 7 | Gate Review 模板 | ✅ | `ops/ETA_L2_GATE_REVIEW_TEMPLATE.md` |
| 8 | 执行页「开始 / 到了 / 停车」 | ⏳ | App |
| 9 | 国内 Case A–E 演练 | ⏳ | 确认环，非导航 |

---

## 完成定义

1. 执行页支持开始车程  
2. 执行页支持确认到达  
3. 支持记录或补填非驾驶停留  
4. 出发时冻结 `travelEtaSnapshot`  
5. 自动算 elapsed / excluded / actualDriving  
6. 自动判定 VALID / PARTIAL / INVALID  
7. VALID 进入 Reconciliation  
8. 可算 Base Error 与 Planning Error  
9. GPS 关闭仍可闭环  
10. 可选 GPS 只增强证据  

完成后：

```text
SELECTED TRIPS AUTHORITY: ACTIVE
EXECUTION ACTUAL CAPTURE: READY
ICELAND OUTCOME EVIDENCE: PENDING
```

原名 `ETA-L2-FIELD-READY-01` 已废止，勿再扩导航向采集。
