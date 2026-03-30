# TripNARA — CLAUDE.md（入口索引）

> 你当前看到的是 **入口文件**。  
> 为保证“人类架构说明”与“LLM执行协议”不互相干扰，已拆分为两份文档。

---

## A) 模型执行（最高优先级）

**文件**：`/.claude/claude_exec.md`

用途：给 LLM 的运行时协议（Runtime Spec）。  
包含：

- 强制输出 JSON 协议（Output Contract）
- 强制执行顺序（Gate -> Plan -> Verify -> Repair）
- 失败与降级模板（UNVERIFIED / TODO_verification_list）
- 决策日志硬结构（skills/evidence/degradation）

**规则**：当出现冲突时，执行以 `claude_exec.md` 为准。

---

## B) 人类架构与工程说明

**当前已落地文件**：

- `docs/ARCHITECTURE.md`（架构设计）

**建议文件**（按需扩展）：

- `docs/PRD.md`（产品规格）
- `docs/DESIGN_SPEC.md`（设计规范）
- `docs/DEPLOYMENT.md`（部署手册）
- `docs/skills/`（skill 合同与示例）

**推荐阅读顺序**：

1. `/.claude/claude_exec.md`（先看执行协议，保证模型稳定运行）  
2. `docs/ARCHITECTURE.md`（再看架构分层与治理边界）  
3. `scripts/rl-infra/roll/RACI_WEEK1_3.md`（最后看发布责任与审批链）

---

## C) 不可妥协原则（简版）

1. **Gate-first**：任何行程生成前必须先做 Should-Exist Gate。  
2. **Executable-first**：无证据不做确定性承诺。  
3. **Safety-first**：高风险/不可达优先 ADJUST_REQUIRED 或 BLOCK。  
4. **Explainability-first**：必须输出结构化 decision_log。  
5. **No hallucinated facts**：交通/开放时间/安全结论必须可核验。

---

## D) 专家角色提示词编排（精简版，按项目实际）

本仓库的专家角色提示词位于：`.claude/roles/` 与 `.claude/roles/rl-infra/`。  
为避免“角色过多导致协作噪音”，默认采用 **核心常驻 + 按需介入** 模式。

### 13.1 核心常驻（默认必须参与）

以下角色建议常驻参与需求、实现、评测、发布主链：

- `architect.md`
- `product-manager.md`
- `rl-infra/backend-infra-engineer.md`
- `rl-infra/rl-ml-platform-engineer.md`
- `rl-infra/evaluation-engineer.md`
- `rl-infra/pm-rl-product.md`
- `rl-infra/data-engineer-trajectory.md`

说明：上述角色覆盖“架构决策、研发交付、评测门禁、发布拍板、数据闭环”最小闭环。

### 13.2 可按需介入（可以不要常驻）

以下角色在触发条件出现时再拉入；**默认不进主链 R/A**：

- `rl-infra/ux-writer.md`  
  - 仅当“用户可见语义”变化时介入（风险提示、审批文案、解释结构）
- `rl-infra/domain-expert-network.md`  
  - 仅当高风险目的地/季节规则扩展、反例库补充时介入
- `rl-infra/llm-judge-rm-engineer.md`  
  - 仅当质量评分争议、reward 偏移、模型投机风险上升时介入
- `rag-engineer.md` / `rag-content-manager.md`  
  - 仅当检索质量、知识新鲜度成为瓶颈时介入
- `geographic-scientist.md` / `psychologist.md` / `data-engineer.md`  
  - 仅在对应专项问题出现时介入

### 13.3 可暂不启用（当前阶段可以不要）

若当前目标是 Week1-3 上线与发布稳定性，以下方向可暂不常驻投入：

- 深度体验优化（仅文案层优化，无用户语义变更）
- 高阶奖励模型蒸馏（RM 深度迭代）
- 大规模知识库扩写（非当前发布阻断项）

### 13.4 协作硬规则（防角色膨胀）

1. 发布主链（gate/canary/ramp/rollback/readiness）只允许核心常驻角色承担 R/A。  
2. 按需角色默认 I（Informed），触发条件成立后再升级为 C（Consulted）。  
3. 若某角色连续两个迭代无实质产出，自动降为按需角色。  
4. 一切角色编排以 `scripts/rl-infra/roll/RACI_WEEK1_3.md` 为发布执行基准。
