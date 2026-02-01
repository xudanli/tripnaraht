# Chain-of-Work 引擎模块

**状态**：🚧 **技术预研阶段**

## 概述

Chain-of-Work 引擎是 TripNARA 的核心模块，通过在 AI 执行前输出"步骤草案"，显性化 Agent 的执行逻辑，实现 AI 决策过程的透明化和可控化。

## 核心功能

1. **步骤草案生成**：基于用户需求，使用 LLM 生成符合 CLAUDE_SM 状态机流程的步骤草案
2. **Skills 映射**：将步骤草案中的步骤映射到对应的 Skills
3. **Sub-Agents 映射**：将步骤草案中的步骤映射到对应的 Sub-Agents
4. **执行集成**：将步骤草案转换为可执行的工作流节点
5. **版本管理**：完整的版本管理和变更历史记录

## 模块结构

```
src/chain-of-work/
├── draft/                    # 步骤草案生成、验证、编辑
│   ├── draft-generator.service.ts
│   ├── draft-validator.service.ts
│   └── draft-editor.service.ts
├── mapping/                   # Skills 和 Sub-Agents 映射
│   ├── skill/
│   │   └── skill-mapping.service.ts
│   └── sub-agent/
│       └── sub-agent-mapping.service.ts
├── execution/                 # 执行计划生成和执行集成
│   ├── execution-plan-generator.service.ts
│   └── execution-integration.service.ts
├── version/                   # 版本管理
│   └── version.service.ts
├── interfaces/                # 接口定义
│   └── chain-of-work.interface.ts
├── dto/                       # DTO 定义
├── controllers/               # API 控制器
│   └── chain-of-work.controller.ts
├── services/                  # 核心服务
│   └── chain-of-work.service.ts
└── chain-of-work.module.ts    # 模块定义
```

## 技术预研状态

### ✅ 已完成

- [x] 模块结构创建
- [x] 接口定义（`chain-of-work.interface.ts`）
- [x] 步骤草案生成器（模板化版本）
- [x] Skills 映射服务（关键词匹配）
- [x] Sub-Agents 映射服务（硬编码规则）
- [x] 步骤草案验证器（基础验证）

### 🚧 进行中

- [ ] LLM 集成（调用 LLM Service 生成步骤草案）
- [ ] 执行计划生成器
- [ ] 执行集成服务
- [ ] 版本管理服务
- [ ] API 控制器

### 📋 待办

- [ ] 数据库 Schema（Prisma）
- [ ] 缓存机制（Redis）
- [ ] 单元测试
- [ ] 集成测试
- [ ] API 文档

## 使用示例

```typescript
// 生成步骤草案
const draft = await chainOfWorkService.generateDraft(request, {
  model: 'claude-3-5-sonnet',
  temperature: 0.7,
});

// 验证步骤草案
const validation = await chainOfWorkService.validateDraft(draft);

// 生成执行计划
const plan = await chainOfWorkService.generateExecutionPlan(draft);

// 执行规划
const result = await chainOfWorkService.executePlan(plan, request);
```

## 参考文档

- [技术预研报告](../docs/CHAIN_OF_WORK_TECHNICAL_RESEARCH.md)
- [评估报告](../docs/CHAIN_OF_WORK_TRIPNARA_ASSESSMENT.md)
- [开发计划](../docs/CHAIN_OF_WORK_IMPLEMENTATION_PLAN.md)