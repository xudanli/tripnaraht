# Prompts 目录说明

## 📁 目录结构

本目录统一管理 TripNARA 系统中的所有提示词（Prompts）文件。

```
prompts/
├── agents/                    # 系统 Agent（运行时使用）
│   ├── README.md              # 系统 Agent 说明
│   ├── Planner.md             # Planner Agent
│   ├── Gatekeeper.md          # Gatekeeper Agent（Abu）
│   ├── CoreDecision.md        # CoreDecision Agent（Dr.Dre）
│   ├── LocalInsight.md        # LocalInsight Agent（Neptune）
│   ├── Compliance.md          # Compliance Agent
│   └── Narrator.md            # Narrator Agent
└── README.md                  # 本说明文档

注意：辅助角色（产品经理、架构师、工程师等）已移动到 `.claude/roles/`
```

---

## 📂 目录说明

### `system/` - 系统级提示词

**用途**：被代码动态加载的系统提示词，用于定义 Agent 的核心行为和规则。

**特点**：
- 被 `TripNaraSystemPromptService` 等服务加载
- 影响整个系统的 Agent 行为
- 通常包含系统级规则、约束、世界观定义

**文件**：
- `TRIPNARA_SYSTEM_PROMPT.md` - TripNARA 主系统提示词（定义 Agent 人格、世界观、决策宪法）
- `SKILLS.md` - Skills 相关提示词（用于 Planner Agent）

**代码引用**：
- `src/agent/services/tripnara-system-prompt.service.ts` → `docs/TRIPNARA_SYSTEM_PROMPT.md`（可迁移到 `prompts/system/`）
- `src/agent/plan-execute/planner.service.ts` → `docs/SKILLS.md`（可迁移到 `prompts/system/`）

---

### `agents/` - 系统 Agent

**用途**：系统运行时使用的 Agent，是系统架构的一部分。

**特点**：
- 是系统架构的一部分
- 在运行时被调用
- 有具体的实现代码（`src/agent/services/sub-agents/`）
- 映射到三人格系统（Abu、Dr.Dre、Neptune）

**文件**：
- `README.md` - 系统 Agent 说明
- `Planner.md` - Planner Agent（任务拆解、缺口清单识别）
- `Gatekeeper.md` - Gatekeeper Agent（安全与现实守门，Abu）
- `CoreDecision.md` - CoreDecision Agent（节奏与体感，Dr.Dre）
- `LocalInsight.md` - LocalInsight Agent（空间结构修复，Neptune）
- `Compliance.md` - Compliance Agent（合规检查）
- `Narrator.md` - Narrator Agent（结果润色、故事层文案）

**注意**：
- 辅助角色（产品经理、架构师、工程师等）已移动到 `.claude/roles/`
- 辅助角色输出的方案、总结报告等应存储在 `.claude/改动资料/`，请参考 `.claude/roles/README.md`。

---

### `orchestration/` - 编排提示词

**用途**：编排系统相关的提示词，定义如何选择和编排 Skills。

**特点**：
- 用于 Claude Orchestrator 等编排服务
- 定义 Skills 选择规则、执行顺序等
- 可能包含在代码中（如 `claude-orchestration-prompts.ts`）

**文件**：
- `claude-orchestration.md` - Claude 编排提示词（待从代码中提取）

---

## 🔄 迁移指南

### 从根目录迁移

如果提示词文件在项目根目录，建议迁移到对应目录：

```bash
# 产品经理提示词（已迁移）
mv PRODUCT_MANAGER_SYSTEM_PROMPT.md .claude/roles/product-manager.md
```

### 从代码中提取

如果提示词在代码中（如 `.ts` 文件），建议提取到独立的 `.md` 文件：

1. 从代码中提取提示词内容
2. 保存到 `prompts/orchestration/` 或 `prompts/system/`
3. 更新代码，从文件加载而不是硬编码

---

## 📝 添加新提示词

### 步骤

1. **确定分类**
   - 系统 Agent（运行时使用）？→ `prompts/agents/`
   - 辅助角色（开发协作工具）？→ `.claude/roles/`

2. **创建文件**
   - 使用清晰的命名：`kebab-case.md`
   - 包含必要的元信息（角色、用途、版本等）

3. **更新代码引用**（如果需要）
   - 如果代码需要加载该提示词，更新路径引用

4. **更新本文档**
   - 在对应目录说明中添加新文件

---

## 🔗 相关文档

- [系统 Agent 说明](agents/README.md) - 系统 Agent 详细说明
- [辅助角色说明](../.claude/roles/README.md) - 辅助角色详细说明
- [文件组织说明](../docs/FILE_ORGANIZATION.md) - 文件组织结构
- [Agent 组织说明](../docs/AGENT_ORGANIZATION.md) - Agent 组织说明
- [Skills 分类文档](../docs/SKILLS_CLASSIFICATION.md) - 区分内部技能和用户技能
- [Agent 调用顺序文档](../docs/AGENT_CALL_SEQUENCE.md) - Agent 调用流程

---

## 📋 文件清单

### system/
- [ ] `TRIPNARA_SYSTEM_PROMPT.md` - 待创建或迁移
- [ ] `SKILLS.md` - 待创建或迁移

### agents/（系统 Agent）
- [x] `README.md` - ✅ 系统 Agent 说明
- [x] `Planner.md` - ✅ Planner Agent
- [x] `Gatekeeper.md` - ✅ Gatekeeper Agent
- [x] `CoreDecision.md` - ✅ CoreDecision Agent
- [x] `LocalInsight.md` - ✅ LocalInsight Agent
- [x] `Compliance.md` - ✅ Compliance Agent
- [x] `Narrator.md` - ✅ Narrator Agent

**注意**：辅助角色文件已移动到 `.claude/roles/`，请参考 `.claude/roles/README.md`

### orchestration/
- [ ] `claude-orchestration.md` - 待从代码中提取

---

**最后更新**：2024-12-19  
**维护者**：开发团队
