# 正式启动通知 — 研究机构

**发件方：** TripNARA 研发  
**状态：** ENGINEERING FACT LAYER: FROZEN · BASELINE: AFFIRMED · MATRIX REGENERATION: NOT REQUIRED · RESEARCH INPUT: APPROVED  

---

TripNARA 研发事实层已冻结并通过三方确认。

本轮唯一评估基线为 Commit `a7e9bdca588431143e04e98d7c1c1204299c6e54`，事实索引为 `CLAIM_EVIDENCE_MATRIX_v1.0`。Matrix 入库 Commit 为 `c9757e89b829e605ac257c04e440f1f75041d980`，后续基线范围决定和签署记录已固化于 `claim/evidence-matrix-v1.0` 分支（见 `BASELINE_SCOPE_DECISION.md`、`SIGNATURES.md`、`FINAL_STATUS.md`）。

研究机构只能引用 Matrix Claim ID 开展架构评价，不得自行生成代码路径、代码片段、类型、测试名称或测试结果。

冻结树中不存在的 Iceland Confirm/Apply、Mobile Verified Apply 实现不属于本轮研究范围。此前关于这些能力「已接入」的人工描述已由 Matrix 事实覆盖。

C018 应解释为 **`BASELINE_INCOMPLETE`**：冻结 Commit 存在悬空 Iceland util import，相关实现未进入冻结树并导致测试加载失败。不得将其解释为环境问题、测试缺陷、功能移除或缺失实现的安全漏洞。

请分卷交付：

- **卷 A：** 仅包含 Claim Matrix 支持的代码事实；
- **卷 B：** 基于 Claim ID 的架构分析、风险推断和方案建议。

在客户端源码、生产指标及冻结树外能力缺少证据时，必须输出 `NEEDS_MORE_EVIDENCE`，不得外推结论。

---

## 本轮事实边界（摘要）

### 纳入评估

- `route_and_run` 主入口；主状态机；冻结树内核心 DTO/状态模型；
- 冻结树中真实存在的 Proposal / 验证 / 写回实现；
- Matrix 中 PASS / FAIL / PARTIAL / CODE_ONLY；
- 审计矩阵与契约（以 Claim 为准）；
- C018 揭示的基线不完整事实。

### 不纳入评估

- Iceland Confirm / Apply 实现；
- Mobile Verified Proposal Apply 实现；
- 冻结树外的 `iceland-self-drive`、`mobile-in-trip-home`、`verified-proposals/apply`；
- 未进入 Matrix 的 WIP、文档叙事或旧报告结论。

允许说：「当前评估基线不覆盖该能力。」  
禁止说：「该能力设计错误 / 存在漏洞 / 已经实现。」（在基线外时）

### C018

可评价：基线完整性管理、WIP 治理、悬空依赖对可复现性的影响、声明与入库状态治理。  
不可评价：缺失 Iceland Apply 实现内部是否安全。

### 验收门槛（研究报告）

| 验收项 | 要求 |
|--------|------|
| FACT 引用 | 100% 来自 Claim ID |
| 自造代码路径 | 0 |
| 自造测试 | 0 |
| 基线外实现评价 | 0 |
| needs_audit 推导漏洞 | 0 |
| C018 分类 | 必须是 `BASELINE_INCOMPLETE` |
| 事实与建议 | 分卷（A / B） |
| 单一总分 | 非必需；有评分必须有独立模型 |
| 客户端结论 | 未审查时必须标明 |
| 国家扩展结论 | 只能做条件性 Extension Point 评价 |

卷 B 每条评价须含：`依据：Claim Cxxx…` · `判断：INFERENCE / RECOMMENDATION` · `置信度：High / Medium / Low`。
