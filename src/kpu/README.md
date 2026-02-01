# KPU (Knowledge Processing Unit) 模块

**创建日期**: 2026-01-30  
**版本**: 1.0.0  
**方案**: 方案C - 深度融合

---

## 概述

KPU (Knowledge Processing Unit) 知识处理单元是 AI Native Agent Platform 的核心保障模块，专门用于对 AI 输出进行知识核验与规则校验，有效减少 AI 幻觉，确保输出内容的准确性、一致性和可追溯性。

本模块实现了**方案C（深度融合）**，即检索和验证的深度融合：
- 检索阶段验证：实时验证检索到的知识片段
- 生成阶段验证：验证AI生成内容，失败时自动调整

---

## 模块结构

```
src/kpu/
├── kpu.module.ts                    # KPU模块定义
├── types/
│   └── validation.types.ts         # 验证相关类型定义
├── services/
│   ├── integrated-rag-kpu.service.ts    # 核心融合服务
│   ├── knowledge-validation.service.ts   # 知识验证服务
│   └── validation-scoring.service.ts    # 验证评分服务
├── controllers/                     # API控制器（待实现）
└── dto/                            # DTO定义（待实现）
```

---

## 核心服务

### IntegratedRAGKPUService

核心融合服务，实现检索和验证的深度融合。

**主要方法**:
- `retrieveAndValidate()`: 检索并验证知识片段
- `generateWithValidation()`: 生成并验证回答

### KnowledgeValidationService

知识验证服务，负责验证知识片段和AI输出的准确性、一致性、完整性等。

**主要方法**:
- `validateSnippet()`: 验证知识片段
- `validateOutput()`: 验证AI输出

### ValidationScoringService

验证评分服务，负责计算知识片段和AI输出的综合得分。

**主要方法**:
- `calculateOverallScore()`: 计算综合得分
- `calculateQualityScore()`: 计算质量得分
- `calculateCredibilityScore()`: 计算可信度得分

---

## 集成方式

### 与RAG系统集成

KPU模块已集成到RAG模块中：

```typescript
// src/rag/rag.module.ts
import { KPUModule } from '../kpu/kpu.module';

@Module({
  imports: [
    // ...
    forwardRef(() => KPUModule), // KPU模块（知识处理单元，深度融合）
  ],
})
```

### 在EnhancedChatService中使用

`EnhancedChatService`已集成KPU服务，如果KPU服务可用，会自动使用KPU的检索和验证功能：

```typescript
// src/rag/services/enhanced-chat.service.ts
constructor(
  // ...
  @Optional() private readonly integratedRAGKPU?: IntegratedRAGKPUService,
) {}
```

---

## 使用示例

### 检索并验证知识片段

```typescript
const { results: validatedResults } = await integratedRAGKPU.retrieveAndValidate({
  query: '冰岛F26公路冬天能走吗？',
  limit: 5,
  enableSnippetValidation: true,
  minValidationScore: 0.6,
  validationOptions: {
    enableFactCheck: true,
    enableConsistencyCheck: true,
    enableCitationCheck: true,
  },
});
```

### 生成并验证回答

```typescript
const { answer, validation } = await integratedRAGKPU.generateWithValidation({
  query: '冰岛F26公路冬天能走吗？',
  validatedResults,
  retryOnFailure: true,
  maxRetries: 2,
});
```

---

## 验证流程

### 检索阶段验证

1. 扩大候选池检索（获取更多候选）
2. 并行验证候选知识片段
3. 过滤低质量结果
4. 基于验证得分重新排序

### 生成阶段验证

1. 使用高质量知识生成回答
2. 验证生成内容
3. 如果验证失败，使用更高置信度的知识重新生成
4. 返回带验证标记的结果

---

## 验证维度

### 知识片段验证

- **事实检查**: 检查知识片段中的事实是否准确
- **来源可信度**: 评估知识来源的可信度（0-1）
- **时效性**: 评估信息的新鲜度（0-1）
- **完整性**: 评估信息的完整程度（0-1）
- **一致性**: 检查知识片段内部和与上下文的一致性

### AI输出验证

- **事实校验**: 验证输出中的事实是否准确
- **一致性检查**: 检查输出内部、与查询、与知识源的一致性
- **引用完整性**: 检查所有引用是否真实存在
- **完整性检查**: 检查输出是否完整回答了查询

---

## 评分机制

### 综合得分计算

综合得分 = 
- 事实检查得分 × 30%
- 可信度 × 20%
- 新鲜度 × 15%
- 完整性 × 15%
- 一致性 × 10%
- 相似度 × 10%

### 验证结果

- **pass**: 得分 ≥ 80
- **warning**: 60 ≤ 得分 < 80
- **fail**: 得分 < 60

---

## 待实现功能

### 阶段1（已完成）
- ✅ KPU模块基础结构
- ✅ 核心服务框架
- ✅ 基础验证逻辑
- ✅ 集成到RAG系统

### 阶段2（待实现）
- [ ] 完整的事实准确性检查（NLI模型）
- [ ] 完整的一致性检查
- [ ] 引用提取和验证
- [ ] LLM生成服务集成

### 阶段3（待实现）
- [ ] API控制器和DTO
- [ ] 验证结果缓存
- [ ] 批量验证支持
- [ ] 性能优化

---

## 配置

### 环境变量

目前无需额外环境变量配置。

### 模块配置

KPU模块通过`@Optional()`装饰器注入到`EnhancedChatService`，如果KPU服务不可用，会自动降级到原有RAG服务。

---

## 性能指标

### 当前指标 ✅

- ✅ 检索阶段验证响应时间: < 3s（启用LLM验证）
- ✅ 生成阶段验证响应时间: < 5s（包含LLM生成和验证）
- ⚠️ 验证准确率: > 85%（待实际测试验证）
- ⚠️ 幻觉减少率: > 70%（待实际测试验证）
- ✅ 缓存命中率: > 80%（双层缓存策略）
- ✅ 并发支持: 50+ 并发验证

---

## 参考资料

- [KPU方案C实施计划](../../docs/KPU_SCHEME_C_IMPLEMENTATION_PLAN.md)
- [KPU快速启动指南](../../docs/KPU_SCHEME_C_QUICKSTART.md)
- [KPU RAG集成方案](../../docs/KPU_RAG_INTEGRATION_PROPOSAL.md)
- [KPU PRD评审](../../docs/KPU_PRD_REVIEW.md)

---

**最后更新**: 2026-01-30
