# Product Approval Template（M4-RA-01 — 规则可先定稿）

产品负责人**现在**可审核下列制度；真实 tripId 到位后只需确认白名单与签名字段。

## 已定稿（勿因缺数据而重开讨论）

| 项 | 提案值 | 产品确认 (Y/N) |
|----|--------|----------------|
| 允许 operations | SHIFT, SWAP, SHORTEN, REROUTE | ☐ |
| 禁止 operations | MOVE_DAY, REPLACE, AUTO_ARRANGE | ☐ |
| 禁止行为 | 高风险道路选择、booked 取消、booked 跨日、支付/不可逆 | ☐ |
| 必须用户确认 | `requiresUserConfirmation: true` | ☐ |
| 目的地 | IS only | ☐ |
| maxRiskLevel | MEDIUM | ☐ |
| tripSelectionMode | selected_trips（首批） | ☐ |
| rollbackProvider | neptune-repair | ☐ |
| selected_trips 最短观察 | 3–5 天 | ☐ |
| 进入 5% 条件 | 零安全事故 + 人工抽检通过 + 看板硬零 | ☐ |

## 责任矩阵（填姓名/角色）

| 角色 | 姓名 | 权限 |
|------|------|------|
| 产品责任人 failureOwner | | 范围批准 / 接受残余风险 |
| 工程责任人 escalation | | 机制故障升级 |
| Canary 关闭权 rollbackOwner | | 一键关 `OR_TOOLS_AUTHORITATIVE_CANARY` / stage→shadow |
| 写 Plan Version 最终权威 | Decision Runtime | 不可移交 OR-Tools |

## 立即回滚触发（草案）

任一条命中 ⇒ 关 Canary，provider → Neptune：

- Gateway bypass > 0  
- 未授权 Plan Version 写入 > 0  
- Evidence stale 后继续执行 > 0  
- booked 内容误改 > 0  
- 自动回落失败 > 0  
- duplicate Plan Version > 0  

## 签名前仍空的字段（等数据）

- `approvedAt` / `approvedBy`  
- `selectedTripRefs`（白名单 10–20）  
- final `artifactHash`（批准后 mint token 生成）

正式文件：`planning-signoff/<date>/authority.json`（保持 DRAFT/READY_FOR_APPROVAL，直至签字）。  
机制测试只用：`authority.test.json`（不得当作生产批准）。
