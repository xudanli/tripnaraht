# 智能体系统接口 — 事实材料证据包（冻结版）

**状态：FROZEN（事实材料冻结）**  
**代码审查基线（P0/P1）：** `a7e9bdca588431143e04e98d7c1c1204299c6e54`  
**本证据包入库 Commit：** `9aac792e5f01fa7d9236c3e0936f89262f5f02ed`  
**分支：** `feat/orchestration-phase-4b-routing-shell`  
**打包时间（UTC）：** 2026-07-24T05:29:31Z  

本包仅固化**可复核代码事实、契约、测试与导出物**。不再加入目标架构论证；后续由第三方研究机构基于本包评估接口方案是否合理。

---

## 首页限定（必须先读）

1. **局部 contextHash ≠ 全系统统一 contextHash**  
   部分走廊（例如 Iceland shell / Mobile spatial `contextVersion` / Arrange `contextVersion`）存在**局部**版本或 hash 语义，但**当前没有全系统统一的 `contextHash`**。不得把局部字段外推为全局一致性协议。

2. **页面调用关系不能替代客户端源码审查**  
   Web/iOS 页面调用关系来自**后端契约、handoff、Page AI Contract、Controller 标注**。本仓库是 NestJS BFF/API，**不含**生产 React/Swift/Kotlin 客户端源码；本包中的页面调用图**不能替代** Web/iOS 客户端源码审查。

---

## 包内容

| 目录 | 内容 |
|------|------|
| `openapi/` | 基于审查基线 Commit 生成的 `openapi.json` + 生成时间/环境元数据 |
| `contracts/` | 概念对照、走廊审计矩阵、TravelContext SSOT 标记等 |
| `audit-matrices/` | Gate/VERIFY 与写回走廊审计矩阵（`needs_audit` **保持原状**） |
| `dto/` | 关键 DTO / delivery 类型摘录 |
| `fixtures/` | `fixtures/agent` 样例 |
| `handoffs/` | iOS/Arrange/Trusted Delivery/TEP/Spatial 等对接文档 |
| `tests/` | 关键走廊 Jest 结果（JSON + console） |
| `prometheus/` | staging/pilot 导出状态（无数据则 `unavailable`，不补造） |
| `git/` | HEAD/审查基线、工作区差异清单、本轮 patch |

---

## 审查基线

- **代码 Commit：** `a7e9bdca588431143e04e98d7c1c1204299c6e54` — `feat(agent): freeze P0/P1 evidence baseline for interface fact pack`  
- **证据包 Commit：** `9aac792e5f01fa7d9236c3e0936f89262f5f02ed` — `chore(evidence): freeze agent interface fact pack for third-party review`  
- **完整 patch（相对代码基线）：** `git/P0_P1_evidence.patch`  
- **代码提交后工作区残余：** 见 `git/WORKTREE_STATUS_AFTER_COMMIT.txt`（主要为 coverage 删除与无关 runtime env；**未**纳入 P0/P1 代码 Commit）

---

## OpenAPI

- 文件：`openapi/openapi.json`  
- 元数据：`openapi/OPENAPI_GENERATION.txt`  
- 生成器：`scripts/generate-openapi-doc.ts`  
- 端点数：1839 paths  

---

## 关键测试覆盖映射

详见 `tests/COVERAGE_MATRIX.md`。原则：

- 通过 = 本会话可复现绿测  
- 失败 = 如实记录失败原因（DI / seal / env），**不改标为通过**  
- `needs_audit` 走廊在矩阵中保持 `needs_audit`，不因缺测改为“已安全”

---

## Prometheus

见 `prometheus/EXPORT_STATUS.txt`：**unavailable**（本工作区无法连接本地 metrics / Prometheus；staging 未提供可 scrape 的指标端点）。指标**定义**仍可在仓库 `src/monitoring/*` 与 `monitoring/*` 查阅，**无数值样本**。

---

## 冻结声明

本证据包自上述基线 Commit + 本 README 起视为事实材料冻结：

- 不再扩写架构目标/方案论证  
- 不在无证据时改写 `needs_audit`  
- 第三方评估应钉住代码基线 `a7e9bdca588431143e04e98d7c1c1204299c6e54`、证据包 `9aac792e5f01fa7d9236c3e0936f89262f5f02ed`，以及本包文件清单  
