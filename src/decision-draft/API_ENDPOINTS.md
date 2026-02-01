# Decision Draft API 端点文档

**版本**: 1.0  
**日期**: 2026-01-30  
**状态**: 后端实现完成 ✅

---

## 📋 概述

本文档列出了 Decision Draft 系统的所有后端 API 端点。所有端点已实现并集成到服务层。

---

## 🎯 用户端 API（ToC/Expert 模式）

### 基础路径
```
/api/decision-draft
```

### 1. 获取决策草案
**端点**: `GET /api/decision-draft/:draftId`  
**说明**: 根据用户模式返回决策草案（ToC 模式只显示 Decision Steps，Expert 模式显示完整双层结构）  
**响应**: `DecisionDraft`（根据模式过滤 `step_draft` 和 `debug_info`）

### 2. 获取决策解释
**端点**: `GET /api/decision-draft/:draftId/explanation?mode=toc|expert|studio`  
**说明**: 根据模式返回决策解释（ToC 模式：轻解释，Expert 模式：完整解释）  
**响应**: `DecisionExplanation`

### 3. 获取决策步骤解释
**端点**: `GET /api/decision-draft/:draftId/step/:stepId/explanation`  
**说明**: 获取单个决策步骤的详细解释（包括 Step Drafts、证据链、决策日志、三人格评审）  
**响应**: `DecisionExplanation`

### 4. 编辑决策步骤
**端点**: `PUT /api/decision-draft/:draftId/step/:stepId`  
**说明**: 编辑单个决策步骤（接受/拒绝/修改）  
**请求体**: `EditDecisionStepDto`  
**响应**: `{ draft: DecisionDraft }`

### 5. 应用决策草案
**端点**: `POST /api/decision-draft/:draftId/apply`  
**说明**: 将已批准或修改的决策步骤应用到行程  
**响应**: 
```json
{
  "draft": "DecisionDraft",
  "applied": true,
  "applied_steps": ["d1", "d2"],
  "skipped_steps": [],
  "applied_at": "2026-01-30T10:00:00Z"
}
```

### 6. 获取版本列表
**端点**: `GET /api/decision-draft/:draftId/versions`  
**说明**: 获取决策草案的所有版本（只返回版本摘要）  
**响应**: `{ versions: Array<VersionSummary> }`

### 7. 获取版本详情
**端点**: `GET /api/decision-draft/:draftId/versions/:versionId`  
**说明**: 获取特定版本的决策草案（根据用户模式返回不同详细程度）  
**响应**: `DecisionDraftVersion`

### 8. 对比版本
**端点**: `GET /api/decision-draft/:draftId/versions/:versionId1/compare/:versionId2`  
**说明**: 对比两个版本的差异（决策步骤差异、Step Drafts 差异）  
**响应**: 
```json
{
  "version1": "DecisionDraftVersion",
  "version2": "DecisionDraftVersion",
  "diff": {
    "decision_steps_added": [],
    "decision_steps_removed": [],
    "decision_steps_modified": [],
    "step_drafts_added": [],
    "step_drafts_removed": [],
    "step_drafts_modified": []
  }
}
```

---

## 🔧 管理端 API（Expert/Studio 模式）

### 基础路径
```
/api/decision-draft/admin
```

### 1. 生成决策草案
**端点**: `POST /api/decision-draft/admin/generate`  
**说明**: 根据用户输入和旅行需求，生成决策草案（业务层 + 技术层）  
**请求体**: `GenerateDecisionDraftDto`  
**响应**: 
```json
{
  "draft": "DecisionDraft",
  "generation_time_ms": 1234
}
```

### 2. 编辑决策步骤
**端点**: `PUT /api/decision-draft/admin/:draftId/step/:stepId`  
**说明**: 编辑单个决策步骤（接受/拒绝/修改）  
**请求体**: `EditDecisionStepDto`  
**响应**: `{ draft: DecisionDraft }`

### 3. 批量编辑决策步骤
**端点**: `PUT /api/decision-draft/admin/:draftId/steps/batch`  
**说明**: 批量编辑多个决策步骤  
**请求体**: `BatchEditDecisionStepsDto`  
**响应**: `{ draft: DecisionDraft }`

### 4. 局部重算
**端点**: `POST /api/decision-draft/admin/:draftId/regenerate`  
**说明**: 根据用户的编辑操作，只重新生成受影响的决策步骤和步骤草案（非全量重生成）  
**请求体**: `PartialRegenerateDto`  
**响应**: 
```json
{
  "draft": "DecisionDraft",
  "regeneration_time_ms": 567
}
```

### 5. 重新排序决策步骤
**端点**: `PUT /api/decision-draft/admin/:draftId/steps/reorder`  
**说明**: 重新排序决策步骤  
**请求体**: `ReorderDecisionStepsDto`  
**响应**: `{ draft: DecisionDraft }`

### 6. 保存版本
**端点**: `POST /api/decision-draft/admin/:draftId/version`  
**说明**: 保存当前决策草案为版本  
**请求体**: `SaveVersionDto`  
**响应**: 
```json
{
  "version_id": "version-xxx",
  "version": "v1.0",
  "saved_at": "2026-01-30T10:00:00Z"
}
```

### 7. 回滚版本
**端点**: `POST /api/decision-draft/admin/:draftId/version/:versionId/rollback`  
**说明**: 回滚到指定版本  
**响应**: `{ version: DecisionDraftVersion }`

### 8. Fork 版本
**端点**: `POST /api/decision-draft/admin/:draftId/version/:versionId/fork`  
**说明**: 基于指定版本创建新分支（生成新的 workflow_id）  
**请求体**: `ForkVersionDto`  
**响应**: 
```json
{
  "version": "DecisionDraftVersion",
  "new_draft_id": "decision-xxx"
}
```

### 9. 获取统计信息
**端点**: `GET /api/decision-draft/admin/stats?workflow_id=xxx`  
**说明**: 获取决策草案的统计信息（总数、平均决策数、平均生成时间等）  
**响应**: 
```json
{
  "total_drafts": 100,
  "avg_decision_count": 6,
  "avg_generation_time_ms": 1234
}
```

### 10. 获取调试信息（Studio 模式）
**端点**: `GET /api/decision-draft/admin/:draftId/debug-info`  
**说明**: 获取决策草案的完整调试信息（LLM Calls、Skill Calls、性能指标、执行追踪等）  
**响应**: 
```json
{
  "draft_id": "decision-xxx",
  "debug_info": {
    "llm_calls": [],
    "skill_calls": [],
    "performance_metrics": {},
    "execution_trace": {}
  }
}
```

---

## 📝 DTO 定义

### GenerateDecisionDraftDto
```typescript
{
  user_input: string;
  trip_plan_request: TripPlanRequest;
  config?: DecisionDraftGenerationConfig;
}
```

### EditDecisionStepDto
```typescript
{
  operation: {
    decision_step_id: string;
    action: 'approve' | 'reject' | 'modify';
    modifications?: {
      title?: string;
      description?: string;
      outputs?: Array<{ name: string; value: any; confidence?: number }>;
      evidence_weights?: Record<string, number>;
    };
    reasoning?: string;
  };
}
```

### PartialRegenerateDto
```typescript
{
  config?: {
    regenerate_step_drafts?: boolean;
    regenerate_decision_steps?: boolean;
    preserve_approved_decisions?: boolean;
    original_user_input?: string;
    original_trip_plan_request?: TripPlanRequest;
  };
}
```

### SaveVersionDto
```typescript
{
  creator: string;
  description?: string;
  tags?: string[];
}
```

### ForkVersionDto
```typescript
{
  new_workflow_id: string;
  creator: string;
  description?: string;
}
```

---

## 🔐 认证

**当前状态**: 所有端点标记为 `@Public()`，临时开放测试  
**生产环境**: 应启用 `JwtAuthGuard` 和 `RolesGuard`

---

## 📚 参考

- `src/decision-draft/controllers/decision-draft.controller.ts` - 用户端 Controller
- `src/decision-draft/controllers/decision-draft-admin.controller.ts` - 管理端 Controller
- `src/decision-draft/dto/decision-draft.dto.ts` - DTO 定义
- `src/decision-draft/UX_AS_CONTRACT.md` - 用户交互协议
