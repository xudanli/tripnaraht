# PR Checklist — F2：`kernel_state_or_dso_governance`

命中 **F2** 或 `kernel_state_or_dso_governance` 时使用。

- [ ] 是否有任何地方**绕过** `StateManager.merge` / 未来的 `computeNextState` / `commitNextState`？
- [ ] 新增 stage 是否**只返回 PhaseResult**（或等价 patch），而非就地 mutate DSO？
- [ ] 是否引入**新的 DSO 写路径**？若有，是否集中在 StateManager？
- [ ] **目录边界**是否被破坏（见 `.tripnara-guardrails/arch-boundaries.json`）？
- [ ] **transition rules** 是否仍集中可见（Kernel / 单文件规则表）？
- [ ] 是否评估对 **replay / baseline** 的影响？
