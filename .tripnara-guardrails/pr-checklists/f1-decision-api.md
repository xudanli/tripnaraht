# PR Checklist — F1：`decision_api_or_durable_execution`

命中 `change_area` 含 **F1** 或 `decision_api_or_durable_execution` 时使用。

- [ ] 是否新增或修改 **run / continue / verify / explain** 契约？
- [ ] 是否考虑 **runId / traceId / dsoVersion / idempotencyKey**？
- [ ] **continue** 是否经过 **Resume Guard**（stage/version/resumable）？
- [ ] 是否补充流式阶段事件或**兼容性说明**？
- [ ] 是否影响 **MCP / OpenAPI** 映射？
- [ ] 暂停点是否与 `docs/TRIPNARA_DECISION_KERNEL_DECOUPLING_V1.md` §5 一致？
