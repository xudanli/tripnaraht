# High-Dimensional Implicit Parse — Shadow Research Charter

**状态：** `SHADOW_ONLY` — Research scaffold（非权威）  
**日期：** 2026-07-28  
**能力边界：** [TRIPNARA-CAPABILITY-BOUNDARIES.md](./TRIPNARA-CAPABILITY-BOUNDARIES.md)

## 0. 本专项是什么 / 不是什么

| 是 | 不是 |
|----|------|
| 高维隐性信号的 **旁路解析**（Shadow） | 学习型世界模型已上线 |
| 与显式规则因果的 **divergence 对照** | 隐式结构可直写 Plan / Effective Plan |
| Kill Switch 默认 **关闭**（须显式开启） | Authority Consistency 的替代品 |
| 为未来升权威评审准备合同与闸门 | 可对外宣称「完整 Causal WM」 |

统一产品口径 **不变**：

> TripNARA = 显式旅行本体 + 动态世界状态 + 规则型因果预测 + 多目标求解 + 可验证写回

## 1. 开干条件（已接受的风险）

Authority Consistency **最小闭环已在代码面完成**，但 **未合入 / 未放量**。  
本专项以 **Shadow scaffold** 启动，接受：

- 生产默认不启用  
- 任何输出 `authority = SHADOW_ONLY`  
- 禁止进入 Preview→Confirm→Apply / CanonicalApply / setEffective  

升权威（另立项）前置仍为：Authority Consistency 合入 + 选中场景观测稳定 + 独立评审。

## 2. 首版范围（v0）

| 允许 | 禁止 |
|------|------|
| 只读 facts / signals / 显式基线结论 | 修改 ConstraintAssessment / PlanVersion |
| 产出 `LatentShadowHypothesis[]` + divergence | 控制 READY / Confirm / Execute |
| 环境开关 `LATENT_IMPLICIT_PARSE_SHADOW=1` | 默认开启或 silent enable |
| 启发式占位解析（非训练模型） | 把占位结果标成「已学习」 |

代码落点：`src/travel-latent-shadow/`

## 3. Kill Switch

| Env | 默认 | 含义 |
|-----|------|------|
| `LATENT_IMPLICIT_PARSE_SHADOW` | unset / OFF | 不跑解析 |
| `LATENT_IMPLICIT_PARSE_KILL_SWITCH` | unset | `1/true` 强制关闭（即使上项为 ON） |

## 4. 与显式权威的关系

```text
Explicit path (authoritative)     Latent Shadow (旁路)
        │                                    │
        ▼                                    ▼
  DecisionScope + rules              LatentShadowReport
        │                                    │
        └──────── divergence compare ────────┘
                         │
                         ▼
              metrics / research only
              (never Plan write)
```

## 5. 退出 / 升权威（非本 PR）

须单独 Gate：合入 Authority Consistency、选中 trip 观测、divergence 质量、写回隔离证明、产品口径评审。
