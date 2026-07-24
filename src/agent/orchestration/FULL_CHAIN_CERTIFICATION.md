# 全链认证（Full Chain Certification）

> **版本**：`1.0.0`  
> **性质**：编排结果契约 / 固定 fixture — **不是** LLM 端到端 e2e  
> **代码**：`full-chain-certification.constants.ts` · `full-chain-certification.fixtures.ts` · `*.contract.spec.ts`

## 覆盖

| Fixture | 期望 |
|---------|------|
| `happy_path_ok` | RESEARCH→…→hallucination 节点序 + OK |
| `hallucination_hard_fact_failed` | 硬事实冲突 → FAILED |
| `flawed_forbid_need_confirmation` | HARD SAFETY 禁瑕疵 → NEED_CONFIRMATION |
| `r2r_scoped_partial` | R2R 定向 scopes + forbid_full |
| `plan_gen_empty_need_more_info` | 空草案 → NEED_MORE_INFO |

与主链协议、`hallucination-delivery-gate`、`flawed-draft-allow-matrix`、`agent_run_trace` 共享 SSOT。
