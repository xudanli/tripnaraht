# ETA L2 — 冰岛 Pilot 清单（执行确认版）

**工作包：** `ETA-L2-EXECUTION-ACTUAL-01`  
**原则：** 用户只需「开始 → 可选停车 → 到了」。不做导航能力验收。

---

## 行前

- [ ] 行程在 Selected Trips 白名单  
- [ ] L2 Authority 已开；Kill Switch 可用  
- [ ] 每段已有 `travelEta`  
- [ ] 执行页可触发「开始这段车程 / 我到了」  
- [ ] 用户知道中途长停留需要填写（或到达后补填）  

## 行中

```text
开始这段车程 → 可选记录停车 → 到了
```

天气 / 路况 / 施工仅可选备注，**不反向改 L2**。

## 行后

```text
算 Actual → VALID/PARTIAL/INVALID → Reconciliation → Base MAE vs Planning MAE
```

异常样本人工复核；禁止单条立刻改参。

---

## 国内演练（只验确认环）

| Case | 场景 | 期望 |
|------|------|------|
| A | 09:00→10:30，无停车 | Actual = 90 |
| B | 09:00→11:00，拍照 25 分 | Actual = 95 |
| C | 到达后补填吃饭 40 分 | 正确排除 |
| D | 未到原计划目的地 | INVALID |
| E | 停车时长不确定 | PARTIAL |

**不演练：** 偏航重算、杀进程恢复导航、全程离线轨迹、转向播报、GPS 轨迹重建。
