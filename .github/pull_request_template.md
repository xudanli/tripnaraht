## Summary

<!-- 简述本 PR 目的与行为变化 -->

## Execution OS — Change Impact (CID v1)

若本 PR 改动了 **契约敏感路径**（编排入口、trace v1、replay、memory binding、governance 材料等），请更新仓库根目录的 **`change-impact-descriptor.v1.json`**，并勾选：

- [ ] 我已阅读 `src/agent/runtime/specs/execution-os-stability-contract.v1.md`（含 **§6 freeze** 与 **§7 CID**）
- [ ] 我已更新 `change-impact-descriptor.v1.json`（`impacts.*` 与 `classification` 一致；若全为 `false` 须填 `rationaleNoContractImpact`）
- [ ] 若 `impacts.governanceHash === true`：已运行 `npm run exec:gateway-governance-hash` 并在需要时更新 pinned hash（见 SSC §2）
- [ ] 若需在运行时可追溯本次变更语义：在 `route_and_run` 请求中设置 `options.change_impact_descriptor_v1`（将出现在 `observability.trace.change_impact_descriptor_v1`）

敏感路径规则见：`src/agent/contracts/execution-os-change-impact-descriptor.v1.ts` 中的 `CID_STRICT_PATH_RULES_V1`。

## Test plan

- [ ] `npm run ci:execution-os-stability`
- [ ] `npm run ci:cid-v1`
