# 规划智能体接口重新设计 - GitHub Issues 模板

**版本**: 1.0  
**创建日期**: 2026-02-08  
**用途**: 创建GitHub Issues，跟踪实施进度

---

## 📋 Issue模板

### Issue类型1: 基础设施任务

```markdown
## 任务: [阶段1] 实现任务服务

**优先级**: P0  
**预计时间**: 3天  
**负责人**: @backend-dev  
**关联文档**: [实施计划](./API_REDESIGN_IMPLEMENTATION_PLAN.md#11-任务服务实现3天)

### 任务描述

实现任务服务，支持异步任务管理。

### 任务清单

- [ ] 设计任务服务接口
- [ ] 实现任务创建、查询、取消、重试功能
- [ ] 实现任务状态管理
- [ ] 实现任务结果存储（Redis + Database）
- [ ] 编写单元测试

### 验收标准

- [ ] 任务服务接口已实现
- [ ] 单元测试覆盖率 > 80%
- [ ] 代码审查已通过

### 相关文件

- `src/agent/infra/task.service.ts`
- `src/agent/infra/task.interface.ts`
- `src/agent/infra/task.module.ts`

### 参考文档

- [实施计划](./API_REDESIGN_IMPLEMENTATION_PLAN.md)
- [实现指南](./API_REDESIGN_IMPLEMENTATION_GUIDE.md)
- [代码模板](./API_REDESIGN_CODE_TEMPLATES.md)
```

---

### Issue类型2: 接口实现任务

```markdown
## 任务: [阶段2] 实现推荐接口

**优先级**: P0  
**预计时间**: 2天  
**负责人**: @backend-dev + @ai-engineer  
**关联文档**: [实施计划](./API_REDESIGN_IMPLEMENTATION_PLAN.md#22-推荐接口2天)

### 任务描述

实现推荐接口，支持GET方法，支持自然语言参数。

### 任务清单

- [ ] 实现 `GET /v2/recommendations` 接口
- [ ] 支持自然语言参数（`?q=...`）
- [ ] 支持结构化参数（query parameters）
- [ ] 实现推荐结果缓存（5分钟）
- [ ] 集成推荐引擎服务
- [ ] 编写单元测试

### 验收标准

- [ ] 接口已实现并通过测试
- [ ] 支持自然语言参数
- [ ] 缓存正常工作
- [ ] 单元测试覆盖率 > 80%

### API设计

**接口**: `GET /api/agent/planning-assistant/v2/recommendations`

**参数**:
- `q` (可选): 自然语言描述
- `preferences[budget][total]` (可选): 预算
- `filters[countryCode]` (可选): 国家代码
- `limit` (可选): 返回数量，默认10

**响应**: [RecommendationsResponseDto](./API_REDESIGN_DTO_DEFINITIONS.md#推荐响应)

### 相关文件

- `src/agent/assistants/planning-assistant/controllers/planning-assistant-v2.controller.ts`
- `src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts`
- `src/agent/assistants/planning-assistant/dto/v2/recommendations-request.dto.ts`

### 参考文档

- [最终方案](./API_REDESIGN_FINAL.md)
- [DTO定义](./API_REDESIGN_DTO_DEFINITIONS.md)
- [错误处理](./API_REDESIGN_ERROR_HANDLING.md)
```

---

### Issue类型3: AI能力增强任务

```markdown
## 任务: [阶段3] 增强推荐算法

**优先级**: P1  
**预计时间**: 3天  
**负责人**: @ai-engineer  
**关联文档**: [实施计划](./API_REDESIGN_IMPLEMENTATION_PLAN.md#31-推荐算法增强3天)

### 任务描述

增强推荐算法，支持隐式偏好学习和上下文感知。

### 任务清单

- [ ] 实现隐式偏好学习
- [ ] 实现上下文感知推荐
- [ ] 实现多源数据融合（显式+隐式+协同过滤）
- [ ] 实现推荐解释生成
- [ ] 编写单元测试

### 验收标准

- [ ] 推荐算法已增强
- [ ] 支持隐式偏好学习
- [ ] 支持上下文感知
- [ ] 推荐解释已生成

### 相关文件

- `src/agent/assistants/shared/services/recommendation-engine.service.ts`
- `src/agent/assistants/shared/services/preference-learning.service.ts`
- `src/agent/assistants/shared/services/recommendation-explainer.service.ts`

### 参考文档

- [AI科学家评审](./API_REDESIGN_REVIEW_AI_SCIENTIST.md)
- [综合评审总结](./API_REDESIGN_REVIEW_SUMMARY.md)
```

---

## 📊 Issue列表（按阶段）

### 阶段1: 基础架构

- [ ] [阶段1] 实现任务服务 (3天)
- [ ] [阶段1] 集成消息队列 (2天)
- [ ] [阶段1] 集成Redis缓存 (2天)
- [ ] [阶段1] 实现错误处理和追踪 (2天)
- [ ] [阶段1] 配置API Gateway (1天)

### 阶段2: 核心接口实现

- [ ] [阶段2] 实现会话管理接口 (2天)
- [ ] [阶段2] 实现推荐接口 (2天)
- [ ] [阶段2] 实现方案生成接口 (3天)
- [ ] [阶段2] 实现方案对比接口 (1天)
- [ ] [阶段2] 实现方案优化和确认接口 (2天)
- [ ] [阶段2] 实现对话接口增强 (2天)
- [ ] [阶段2] 实现行程操作接口 (2天)

### 阶段3: AI能力增强

- [ ] [阶段3] 增强推荐算法 (3天)
- [ ] [阶段3] 增强方案生成AI能力 (3天)
- [ ] [阶段3] 优化意图识别 (2天)
- [ ] [阶段3] 实现智能路由 (2天)

### 阶段4: 性能优化

- [ ] [阶段4] 优化缓存策略 (2天)
- [ ] [阶段4] 配置限流策略 (1天)
- [ ] [阶段4] 优化数据库 (2天)

### 阶段5: 测试和文档

- [ ] [阶段5] 实现测试用例 (3天)
- [ ] [阶段5] 更新API文档 (2天)
- [ ] [阶段5] 更新前端对接文档 (2天)

### 阶段6: 灰度发布

- [ ] [阶段6] 内部测试 (3天)
- [ ] [阶段6] 小范围灰度 (3天)
- [ ] [阶段6] 扩大灰度 (3天)
- [ ] [阶段6] 全量发布 (1天)

---

## 🔗 快速创建Issue

### 使用GitHub CLI创建Issue

```bash
# 创建基础设施任务
gh issue create \
  --title "[阶段1] 实现任务服务" \
  --body-file API_REDESIGN_GITHUB_ISSUES.md \
  --label "enhancement,backend,P0" \
  --assignee @backend-dev

# 创建接口实现任务
gh issue create \
  --title "[阶段2] 实现推荐接口" \
  --body-file API_REDESIGN_GITHUB_ISSUES.md \
  --label "enhancement,backend,P0" \
  --assignee @backend-dev,@ai-engineer
```

---

**文档维护**: 项目经理  
**最后更新**: 2026-02-08
