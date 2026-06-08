# Vibe LLM Prompt Spec

完整 System Prompt 见：`src/match-square/config/vibe-llm-system-prompt.config.ts`

- **Role**：Decision OS 首席计算官
- **输出**：vibe_chips / teamwork_contract_model / hard_gates（含 budget_range）/ slot_definitions / itinerary_summary / captain_message
- **Few-Shot**：Example 1–2 通用场景；Example 3–8 对应 PRD **Gold Dataset 剧本**（见下）
- **parse_version**：`vibe_llm_v2`

**预算 vs Vibe chip**：`hard_gates.budget_range`（及落库 `post.budgetRange`）承载费用契约；**勿**输出「预算全包」类 vibe chip。`luxury_tier`（💎 高净值顶配）表 luxury 圈层；`captain_full_service`（🎯 队长全包指挥）仅表行中服从/分工，不因单独「我出钱全包」触发。前端规范见 [frontend-integration-guide.md](./frontend-integration-guide.md) §7.0.2。

## Gold Dataset 剧本（规则引擎 + LLM 共用）

配置：`src/match-square/config/vibe-recruitment-scripts.config.ts`  
回归测试：`src/match-square/engine/vibe-llm-parse.gold-dataset.spec.ts`

| script id | 标题 | 组队风格 | 核心 Vibe 标签 |
|-----------|------|----------|----------------|
| `dopamine_escape` | 黑夜逃跑 · 多巴胺全托管 | 全托管 | 🌊冲浪/跳伞 · 🎵电音节 · ⚡️盲盒 · 🔥燃尽复活 |
| `polar_expedition` | 极圈科考 · 冰川极昼 | 一起策划 | ❄️极圈 · 🏔️极限徒步 · 📡DEM · 🥶极端生存 |
| `industrial_ruins` | 工业探秘 · APS/MES 溯源 | 一起策划 | 🏭废墟 · 📊APS/MES · ⚙️钢铁 · 🕵️溯源 |
| `island_geek_hackathon` | 海岛极客 · 海滩黑客松 | 一起随便玩 | 🌴巴厘岛游牧 · ⚡️Hacking · 🏎️狂飙 · 🤝Co-founder |
| `mountain_dyl_retreat` | 山野隐居 · DYL 人生设计 | 一起策划 | ⛰️安吉DNA · 📐DYL · ⛺️围炉 · 🧘班味净洗 |
| `dali_non_mainstream_collision` | 大理非主流对撞 | 一起随便玩 | 🌾大理 · 🍄捡菌 · 🍳炊事 · 🎨剥离悬浮 |

### Premium Trekking（🏃 徒步入口 · `premium_trekking`）

| script id | 标题 | 组队风格 | 核心 Vibe 标签 |
|-----------|------|----------|----------------|
| `iceland_laugavegur_heavy_trek` | 冰岛兰格维格 · DEM 盲导重装 | 一起策划 | 🏔️55km · 🌋火山荒原 · 📡DEM盲导 · 🌊冰川涉水 |
| `chuanxi_heavy_trek` | 川西重装 · DEM 冷酷行军 | 一起策划 | 🏔️重装 · 📡DEM · ⛺️自负重 · 🛡️风险自理 |
| `light_trek_dyl_retreat` | 轻装隐居 · 乌孙/雨崩 DYL | 一起策划 | 🪵轻装 · 📐DYL · 🧘班味净化 · 🌌星空围炉 |
| `weekend_fast_light_trek` | 山野速攀 · Fast&Light | 一起随便玩 | 🏃速攀 · ⚡️心率 · 🤐沉默 · 🍺精酿 |

配置：`config/premium-trekking.config.ts` · 测试：`vibe-llm-parse.premium-trekking.spec.ts` · `GET /filters/options` → `premiumTrekkingScene`

**TripNARA 深度联动（PRD 3.10）**：`trekking-vibe-orchestration.engine.ts` → 响应/详情字段 `trekkingOrchestration` · 完整规范见 [trekking-dna-integration-3.10.md](./trekking-dna-integration-3.10.md)

## 解析路径（线上默认）

1. **LLM 语义主解析** — `VibeLlmGateway.parsePrimary` → `LlmService.callLlmWithSchema`
2. **规则校准** — `calibrateLlmPayloadWithRules`：补全空 chip / 通用拼图位、剧本 teamwork 一致性、Hard Gates 加严、保留 LLM 的 `derived_fields`
3. **全量规则兜底** — LLM 不可用或调用失败 → `parseVibeFreeTextWithRules`（`parse_source: rules`）

关闭 LLM：`VIBE_LLM_ENABLED=false`（本地/CI 纯规则回归）。

规则引擎与 LLM 共用 lexicon：`config/vibe-tag-lexicon.config.ts`
