# 上下文工程专利可追溯性映射

**专利**：一种基于最小有效上下文的智能决策信息生成方法、系统及装置  
**依据**：PATENT_SPECIFICATION_CONTEXT_ENGINEERING.md、PATENT_CLAIMS_CONTEXT_ENGINEERING.md  
**更新**：2026-02-18

---

## 一、权利要求与实现对照

| 权利要求 | 专利要求 | 实现位置 | 状态 |
|----------|----------|----------|------|
| **权1** | 方法：接收请求→获取候选→选择→压缩→组织→注入模型 | `ContextEngineerService.build()` | ✅ |
| **权2.1** | 上下文构建模块 | `ContextBuilderService`、`ContextEngineerService.buildRawBlocks` | ✅ |
| **权2.2** | 上下文选择模块 | `DynamicContextSelectorService` | ✅ |
| **权2.3** | 上下文排序模块 | `ContextRankerService` | ✅ |
| **权2.4** | 上下文压缩模块 | `ContextCompressorService` | ✅ |
| **权2.5** | Token 预算管理模块 | `ContextBudgetManagerService` | ✅ |
| **权2.6** | 上下文缓存模块 | `ContextCacheService` | ✅ |
| **权4** | 选择方式：规则匹配、向量相似度、任务类型映射 | `DynamicContextSelectorService`：规则+任务类型+词重叠语义（可扩展 Embedding） | ✅ |
| **权5** | 压缩策略：aggressive、balanced、conservative | `ContextCompressorService.compress(strategy)` | ✅ |
| **权6** | 填充比例 50%–70% | `CONTEXT_FILL_RATIO = 0.6`（token-budget.constants.ts） | ✅ |
| **权7** | 按决策阶段/代理差异化预算 | `ContextBudgetManagerService.getBudget(phase, agent)` | ✅ |
| **权8** | 块结构：key、type、text、priority、visibility、provenance、estimatedTokens | `ContextBlock`（context-package.types.ts） | ✅ |
| **权9** | 核心/知识/执行上下文 | BlockType 映射（见下表） | ✅ |
| **权11** | 多级缓存（内存+分布式） | L1 内存 + L2 Redis（ContextCacheService） | ✅ |
| **权12** | 任务目标：决策阶段、代理、用户查询、任务类型 | `ContextPackageOptions.phase/agent/userQuery` | ✅ |

---

## 二、BlockType 与专利结构层级映射（权9）

| 专利层级 | BlockType 枚举 |
|----------|----------------|
| **核心上下文**（世界模型摘要、用户约束、计划摘要） | `WORLD_MODEL`、`CONSTRAINTS`、`PLAN_SUMMARY` |
| **知识上下文**（签证、道路规则、安全信息） | `COUNTRY_VISA`、`COUNTRY_ROAD_RULES`、`COUNTRY_SAFETY`、`COUNTRY_WEATHER`、`ABU_RULES`、`DRDRE_RULES`、`NEPTUNE_RULES` |
| **执行上下文**（决策日志、拒绝日志、计划片段） | `DECISION_LOG`、`REJECTION_LOG`、`PLAN_DAY`、`PLAN_SEGMENT` |

---

## 三、方法步骤与代码流程（权1）

| 步骤 | 专利描述 | 实现 |
|------|----------|------|
| 步骤1 | 接收决策请求，提取任务目标 | `ContextPackageOptions`（tripId、phase、agent、userQuery） |
| 步骤2 | 从多数据源获取候选上下文 | `buildRawBlocks` → countryPack.getBlocks、plan.selectSlices、RAG 等 |
| 步骤3 | 基于任务目标确定目标子集 | `DynamicContextSelectorService.select()` |
| 步骤4 | 压缩处理 | `ContextRankerService.rank()` → `ContextCompressorService.compress()` |
| 步骤5 | 组织为最小有效上下文包 | `ContextEngineerService.build()` 输出 `ContextPackage` |
| 步骤6 | 注入人工智能模型 | 调用方（Planner、Narrator 等）使用 `package.blocks` |

---

## 四、Kernel 集成（决策引擎专利）

| 要求 | 实现 |
|------|------|
| 决策内核通过上下文适配器调用 | `ContextEngineAdapterService` |
| CONTEXT_BUILD 阶段构建上下文 | `DecisionKernelService` → `getContextPackage` |
| 决策阶段感知 | `phase`、`agent` 参数传入 `build()` |

---

## 五、核心文件索引

| 模块 | 文件路径 |
|------|----------|
| 构建器 | `services/context-builder.service.ts` |
| 选择器 | `services/dynamic-context-selector.service.ts` |
| 排序器 | `services/context-ranker.service.ts` |
| 压缩器 | `services/context-compressor.service.ts` |
| 预算管理 | `services/context-budget-manager.service.ts` |
| 缓存 | `services/context-cache.service.ts` |
| 主流程 | `services/context-engineer.service.ts` |
| 类型 | `types/context-package.types.ts` |
| 常量 | `constants/token-budget.constants.ts` |
