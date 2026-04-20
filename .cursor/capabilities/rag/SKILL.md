---
name: rag
description: >-
  TripNARA RAG 工程上下文（显式 /rag 调用）：Chunk 检索、索引、Embedding、
  降级与语料治理。
disable-model-invocation: true
---

# /rag — RAG 工程

用户已通过 **`/rag`** 唤起。在继续前用 Read 工具读取：

1. `.cursor/capabilities/rag-engineering/SKILL.md` 全文  
2. （按需）`.cursor/capabilities/rag-engineering/prompts-rag-squads.md`  
3. （角色长文）`.claude/roles/rag-engineer.md` 或 `rag-content-manager.md`  

**职责域**：`src/rag/`、`src/knowledge-base/`、索引脚本、`embedding`/`Chunk`/`pgvector`。
