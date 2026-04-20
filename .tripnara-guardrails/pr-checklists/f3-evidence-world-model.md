# PR Checklist — F3：`research_evidence_or_world_model`

命中 **F3** 或 `research_evidence_or_world_model` 时使用。

- [ ] 证据是否**结构化**，而不是只塞入 prompt？
- [ ] 是否有 **evidence snapshot / source binding**？
- [ ] **world / environment state** 是否与纯 RAG index 变更区分？
- [ ] research artifacts 是否能被 **trace / replay** 使用？
- [ ] 是否说明 **freshness / source reliability** 处理方式？
- [ ] 失败路径是否**不伪造事实**？
