# TripNARA 组织与能力体系（完整方案 · Claude 侧）

**一句话**：TripNARA = 多团队协作的**决策计算系统**，而不是传统旅游系统。

**Cursor 侧入口**：`.cursor/org/tripnara-org-capability-system/SKILL.md`（快捷 **`/org`**）；目录分层见 **`.cursor/STRUCTURE.md`**。

---

## 核心分层

`Team（交付）→ Role（视角）→ SubAgent（执行角色）→ Skill（能力单元）→ Kernel / Domain / RAG`

| 原则 | 含义 |
|------|------|
| **Team ≠ Role** | Team = 工程与业务责任；Role = AI 专家视角（Consult）。 |
| **Skill 为执行单位** | Agent 通过 Skill 组合行为，不在长 Prompt 里堆业务立法。 |
| **决策权集中** | 决策语义在 Decision Layer（`src/decision/`、`src/trips/decision/`、`planning-policy` 等），不在纯 prompt / Domain 最终排序 / RAG 选方案。 |

---

## 六团队（摘要）

1. **Decision Design**：Strategy、Constraint、Utility、Narrative 口径；DSL / 配置。Roles：`chief-decision-psychologist`、`psychologist`、`chief-product-architect`、`architect`。  
2. **Agent & Orchestration**：Orchestrator、SubAgent、状态机、Context；Prompt 只注入流程。Roles：`claude-team-orchestrator`、`agent_collaboration`、`muti_agent_collaboration`。  
3. **Decision & Optimization**：CGUS、Utility、Constraint 执行、MC、TopN。Roles：`chief-optimization-scientist`、`chief-ai-scientist`。  
4. **Travel Domain**：POI/Hotel/Transport、路线与时间、供应商。Roles：`chief-geographic-scientist`、`geographic-scientist`。  
5. **RAG & Data**：RAG 管线、知识库、证据。Roles：`chief-ontology-scientist`、`rag-engineer`、`rag-content-manager`、`data-engineer`、`chief-data-engineer`。  
6. **Platform**：CI/CD、Harness/Replay、监控、CLI、Shadow。Roles：`skills-engineer`、`rl-infra/*`。

**原子能力注册表（Cursor 契约 stub）**：`.cursor/skills/{decision,domain,knowledge,orchestration,platform}/*.md`（与 `src/skills/` 渐进对齐）。

**工程专题（非原子 Skill）**：`.cursor/capabilities/*/SKILL.md`（如 `cgus-engineering`、`orchestration-mainline`）。

---

## 标准 Pipeline

`INTAKE → RESEARCH → GATE → PLAN → OPTIMIZE → VERIFY → REPAIR? → NARRATE → DONE`

Playbook 叙述见 **`.cursor/pipelines/`**；实现权威见 **`.cursor/capabilities/orchestration-mainline/SKILL.md`** 等。

---

## 职责边界（红线）

- **决策逻辑**：Decision Design + Kernel / Optimization。  
- **Agent**：不定义规则、不改权重。  
- **Domain**：不做最终排序与采纳决策。  
- **RAG**：不决定方案。

---

## 对内一句话

**TripNARA = 用 Skill 连接世界，用 Agent 编排流程，用 Kernel 计算决策，用 Strategy 定义「什么是好」。**

更多 SubAgent / Skill 命名表与代码锚点见历史完整版或同步 **`.cursor/org/tripnara-org-capability-system/SKILL.md`** 引用的各 capability 包。
