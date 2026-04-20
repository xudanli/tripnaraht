# TripNARA Guardrails（工程守卫配置）

本目录承载 **TripNARA Engineering Guardrails** 的机器可读规则与 PR 清单，与 `docs/TRIPNARA_ENGINEERING_GUARDRAILS.md` 配套。

## 文件索引

| 文件 | 用途 |
|------|------|
| `anti-patterns.md` | AP-1～AP-6 反模式与级别 |
| `arch-boundaries.json` | 目录允许/禁止依赖方向（供 dependency-cruiser / 自定义脚本） |
| `dso-governance.json` | DSO 受保护字段、StateManager 路径、扫描提示 |
| `executor-purity.json` | Stage 目录禁止的 import 模式 |
| `response-contracts.json` | DONE 等终态的响应完整性要求 |
| `pr-checklists/f1-decision-api.md` | F1 PR 勾选清单 |
| `pr-checklists/f2-kernel-dso.md` | F2 PR 勾选清单 |
| `pr-checklists/f3-evidence-world-model.md` | F3 PR 勾选清单 |

## 脚本

见 `scripts/guardrails/README.md`。Phase A 以**启发式检查**为主，逐步替换为 ESLint/AST。

## 与 role-router 对齐

PR 或分支若修改触及 `change_area`：

- `decision_api_or_durable_execution` → **F1** checklist  
- `kernel_state_or_dso_governance` → **F2** checklist  
- `research_evidence_or_world_model` → **F3** checklist  
