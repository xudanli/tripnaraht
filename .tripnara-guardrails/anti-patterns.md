# Anti-patterns（反模式）

与 `docs/TRIPNARA_ENGINEERING_GUARDRAILS.md` §5、**§16** 一致；用于 PR 与 CI 人工/自动引用。

| ID | 描述 | 典型代码/行为 | 默认级别 |
|----|------|----------------|----------|
| AP-1 | 绕过 Kernel 直接产出最终结果 | `return { status: 'DONE', result: generatedPlan }` 且未经 Kernel+Verify+DSO | P0 |
| AP-2 | 直接 mutate DSO | `dso.tripState.planDraft = ...`、`dso.systemState.currentStage = ...` 在非 StateManager 路径 | P0 |
| AP-3 | Executor 内直接提交权威状态 | `await dsoRepository.save(dso)` 出现在 stage executor | P0 |
| AP-4 | LLM 替代约束/验证 | `const ok = await llm.judge('是否合理')` 参与 final 可执行性裁决 | P0～P1 |
| AP-5 | Narrative 取代结构化输出 | DONE 仅有 `message`，无 `result`/`verification`/`explain` | P1 |
| AP-6 | continue 不校验恢复窗口 | `repo.get(runId)` 后直接 `kernel.resume` 无 stage/version/resumable | P0 |
| AP-7 | Live 能力无 Runtime 声明即进入编排主线 | 新 MCP / live tool 未声明快照语义、freshness、依赖边、失效与叙事安全即接入 orchestration；或不可替代事实源充当「已协调」结论 | P1～P0 |

处理原则：P0 必须 CI/评审拦截；P1 需明确豁免与补救计划。AP-7 若伴随对用户作出确定性可执行承诺可按 **P0** 论处；纯 advisory-only 路径不在此列（见 Guardrails **§16**）。
