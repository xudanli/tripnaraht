---
name: rag-engineering
description: >-
  TripNARA RAG 工程：ChunkRetrievalService、KnowledgeFile/Chunk、pgvector、
  Hybrid 检索与降级、Embedding（BGE-M3 1024）、索引脚本与知识库管线。
  在用户或任务涉及 src/rag、chunk、embedding、vector、知识库索引、
  rag_index_or_chunking、rag_quality 或 places 向量检索时使用。
---

# RAG 工程（TripNARA）

**快捷唤起**：在 Agent 中输入 **`/rag`**（`.cursor/capabilities/rag/`）。

## 建议团队

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **RAG Engineer** | 分块、索引、检索、混合排序、缓存与降级、延迟/成本 | `src/rag/services/chunk-retrieval.service.ts`、`rag-fallback.service.ts`、`src/places/services/embedding.service.ts`、`.claude/roles/rag-engineer.md` |
| **RAG Content Manager** | 语料质量、时效、结构化字段、索引源治理 | `.claude/roles/rag-content-manager.md`、`scripts/index-*-kb*.ts` |
| **Data / Prisma** | `KnowledgeFile`/`Chunk` 迁移与血缘 | `prisma/schema.prisma`、`src/knowledge-base/` |
| **产品 / 决策体验** | 检索结果如何进入解释与 HITL（不伪造事实） | `chief_product_architect`、`decision_ux_architect`（按需 Consult） |

## role-router 与 manifest

- **`rag_index_or_chunking`** → `rag_engineer`、`rag_content_manager`（见 `.claude/role-router.json`）。  
- 两角色已登记 **`role-skill-manifest.json`**（`default_paths` / `checklist` / `consult_roles`）；三句版提示词见 **`decision-platform-roles/prompts-manifest-roles-short.md`**。  
- **`rag_quality`**（`task_tags`）→ 与评测/内容治理协同时叠加 **`trajectory_reward_or_metrics`** 或 **`decision_log_or_replay`**（按实际改动选）。

## 代码地图

1. **模块说明**：`src/rag/README.md`、`src/rag/RAG_API_MIGRATION_GUIDE.md`（若涉及 API 迁移）。  
2. **主检索路径**：`ChunkRetrievalService`（新系统）；`RagService` 已弃用 `document_index`，新代码勿再依赖其向量路径。  
3. **索引与知识库**：`src/knowledge-base/services/indexing.service.ts`、`scripts/index-all-docs-kb.ts`、各 `scripts/index-*-kb-standalone.ts`。  
4. **向量与地点**：`src/places/services/vector-search.service.ts`、`embedding.service.ts`。  
5. **REST**：`src/rag/rag.controller.ts`、`rag.module.ts`。

## 硬原则

- **失败降级不伪造事实**：空检索 ≠ 编造引用；须显式降级文案或跳过 RAG 增强路径。  
- **维度与模型一致**：Embedding 以项目约定（如 BGE-M3 / 1024）为准；迁移须可回滚。  
- **可观测**：关键路径有日志或指标（命中率、延迟、缓存命中）。

## PR 自检

- [ ] 改 chunk/schema：迁移、回填与 `ChunkRetrievalService` / 索引脚本一致。  
- [ ] 改降级链：各层阈值有注释或配置项，且单测覆盖。  
- [ ] 触达用户可见解释：与 Gate/合规披露不冲突（可 Consult `decision_safety_compliance_officer`）。

## 相邻 Skill

- 决策平台角色与提示词：`decision-platform-roles`（含 `prompts-rag-squads.md` 链接）  
- 回放与评估（若动 RAG 质量指标）：`replay-evaluation`  
- 强化学习（轨迹与训练数据，非同一栈但可血缘对齐）：`reinforcement-learning`
