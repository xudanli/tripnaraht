---
name: replay-evaluation
description: >-
  TripNARA 回放与评估：e2e replay、CGUS replay suite、golden 捕获、决策日志
  可追溯性契约、fixture mocks、artifact 报告与脚本化回归。
  在用户或任务涉及 e2e-replay、cgus-replay、decision-replay、golden、
  evaluation/contracts、或 artifacts/*.json 报告时使用。
---

# 回放与评估工程

**快捷唤起**：在 Agent 中输入 **`/replay`**（`.cursor/capabilities/replay/`）。

## 建议团队

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **评估负责人** | e2e 用例注册、断言策略、与产品验收对齐 | `src/trips/decision/evaluation/` |
| **CGUS / 优化回放** | Lite suite、artifact、批量报告 | `cgus-replay.module.ts`、`cgus-replay-suite.util.ts`、`scripts/replay-cgus-suite.ts` |
| **决策可追溯** | decision log、contract spec、与内核状态一致 | `decision-log-traceability.contract*.ts`、`decision-replay.service.ts` |
| **Fixture 与 Golden** | mock 世界、捕获 CLI、回归基线 | `e2e-replay.fixture-mocks.ts`、`e2e-golden-capture*.ts` |

## 原则

- **可重复**：固定 `SEED`、明确 `sampleSize` 的测试与脚本需在 PR 中说明波动容忍度。
- **契约优先**：改 DSO / trace 形状时先更新 contract spec，再改实现。
- **与优化栈联动**：CGUS 数值回归见 **`cgus-engineering`** / **`optimization-candidate-search`**。
- **CGUS 回归基线**：官方 replay JSON 的存放、命名、何时可覆盖 vs 仅 compare，见仓库根目录 **`baselines/cgus/README.md`**；差异对比使用 `npm run cgus:replay:compare`。

## 代码地图

- `src/trips/decision/evaluation/`（`e2e-replay.service.ts`、`e2e-assertions.ts`、`e2e-cases/` 等）
- `src/trips/decision/contracts/`（可追溯性等）
- `scripts/replay-cgus-suite.ts`、`scripts/cgus-cli.ts`、`scripts/capture-golden*.ts`
- `src/agent/services/decision-replay.service.ts`（若任务涉及 Agent 侧 replay）

## PR 自检

- [ ] 新断言：失败信息是否可定位到具体 caseId / tripId。
- [ ] 更新 golden：注明数据来源与是否人为审过。
- [ ] CI 时间与 flaky：避免无界随机或未 mock 的外部调用。

## 相邻主线 Skill

- 优化与 CGUS：`optimization-candidate-search`、`cgus-engineering`
- 决策内核：`decision-kernel-engineering`
- Harness trace / grader：`harness-runtime`
- 强化学习与轨迹/Reward：`reinforcement-learning`（快捷 `/rl`）
- 角色映射与可复制提示词：`decision-platform-roles`
