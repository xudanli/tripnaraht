# ETA L2 — Gate Review 模板

**用途：** 第一轮冰岛执行 Actual 后（约 3–5 Trip / 20–30 VALID Segment）做正式审查。  
**输出只能是：** `GO` | `CONDITIONAL_GO` | `NO_GO`  
**禁止：** 无 Actual 升 `iceland_canary_5%`；用国内确认环代替冰岛效果证据。

---

## 元信息

| 字段 | 填写 |
|------|------|
| Review 日期 | |
| Reviewer | |
| 样本窗口 | |
| VALID Segment 数 | |
| PARTIAL / INVALID 数 | |
| 普通铺装 Segment 数 | |
| 高地 / F 路 Segment 数 | |
| 当前 stage | `selected_trips` |

---

## A. 硬门禁（任一失败 → NO_GO）

| 检查项 | 计数 | Pass? |
|--------|------|-------|
| CLOSED 错误进入排程 | 0 | |
| 2WD 错误进入强制四驱路段 | 0 | |
| REQUIRED Terrain 静默缺失 | 0 | |
| UNKNOWN Provider 权威使用 | 0 | |
| Kill Switch 失效 | 0 | |

---

## B. 数据门禁

| 检查项 | 目标 | 实测 | Pass? |
|--------|------|------|-------|
| VALID Actual | ≥ 20–30 | | |
| 铺装 + F 路均有样本 | 是 | | |
| ETA 快照完整率 | ≥ 98% | | |
| Provider provenance 完整率 | ≥ 98% | | |
| REQUIRED Terrain 执行率 | = 100% | | |

---

## C. 效果门禁（第一轮方向性，非严格统计）

| 检查项 | 观察 | Pass? |
|--------|------|-------|
| Planning 无系统性比 Base 更差 | | |
| 高地严重低估有所下降 | | |
| 南岸无明显过度加时 | | |
| uncertainty 能覆盖大部分 Actual | | |
| 无安全错误 | | |

---

## D. 裁决

**Decision：** ☐ GO　☐ CONDITIONAL_GO　☐ NO_GO

**含义：**

- **GO** → 进入 `iceland_canary_5%`  
- **CONDITIONAL_GO** → 继续 Selected Trips 并记录待调整项（仍不默认升 5%）  
- **NO_GO** → 回 Shadow 或关闭部分 Adjustment  

**理由（必填）：**

```
…
```

**明确不做：** 本轮不宣称「比地图准 X%」「冰岛用户验证有效」。
