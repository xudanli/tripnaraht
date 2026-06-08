# Vibe LLM Engine（PRD 4.3）

Decision OS 发布招募模块的 **LLM 动态场景生成与解析引擎**：用户自由输入小作文 → 结构化 `vibe_chips` / `hard_gates` / `slot_definitions` / 行为契约。

## 链路

```
用户键入 freeText
  → POST /api/match-square/vibe-llm/parse   （实时，debounce）
  → VibeLlmService.parseFreeText
      → VibeLlmGateway.parsePrimary
          ├─ LLM 语义（默认开启）
          ├─ calibrateLlmPayloadWithRules（规则校验/补全）
          └─ 失败 → parseVibeFreeTextWithRules
      ├─ vibe_chips / slot_definitions / derived_fields（itinerary_summary + captain_message）

发布 POST /api/match-square/posts { vibeFreeText }
  → attachVibePayloadToSnapshot(captainPersonaSnapshot._vibeLlm)
  → planningStyle ← suggestedPlanningStyle（仅 vibeFreeText 存在时）
  → buildTeamPuzzle 优先 slot_definitions
  → apply-preview 校验 hard_gates + 返回 behavioral_contracts
```

## 模块

| 文件 | 职责 |
|------|------|
| `config/vibe-tag-lexicon.config.ts` | PRD Tag Mapping Lexicon |
| `config/behavioral-contract-dictionary.config.ts` | 动态契约字典 |
| `config/vibe-llm-system-prompt.config.ts` | LLM System Prompt + JSON Schema |
| `engine/vibe-llm-parse.engine.ts` | 规则解析、normalize、拼图映射 |
| `gateway/vibe-llm.gateway.ts` | LlmService 调用 |
| `util/vibe-hard-gate.util.ts` | 申请侧学历/授信门槛 |
| `util/vibe-post-view.util.ts` | Card 视图 `vibeLlm` |

## 存储

无 DB migration：`captainPersonaSnapshot._vibeLlm` 嵌套 JSON。

## 测试

```bash
npm test -- --testPathPattern="vibe-llm|vibe-hard-gate|slot-filling"
```

## 前端

见 `internal-docs/match-square/frontend-integration-guide.md` §7.0。
