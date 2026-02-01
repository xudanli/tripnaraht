# Decision Draft 用户交互协议（UX as Contract）

**版本**: 1.0  
**日期**: 2026-01-30  
**状态**: P1 实现

---

## 📋 概述

本文档定义了 Decision Draft 系统的用户交互协议，确保 UI 行为与系统行为的一致性（UX as Contract 原则）。

## 🎯 核心原则

1. **状态驱动**：UI 状态完全由后端状态驱动，不允许前端状态与后端不一致
2. **操作可追溯**：所有用户操作都记录到 `user_feedback` 和 `decision_log`
3. **版本化**：每次修改都创建新版本，支持对比和回滚
4. **可解释性**：每个决策步骤都提供完整的解释（证据、推理、三人格评审）

---

## 🔄 UI 状态机

### 决策步骤状态流转

```
pending → reviewing → approved/rejected/modified → applied
   ↑                                              ↓
   └─────────────────── (重新生成) ──────────────┘
```

### 状态定义

| 状态 | 说明 | UI 表现 | 可执行操作 |
|------|------|---------|-----------|
| `pending` | 初始状态，等待用户审查 | 显示为"待审查" | `approve`, `reject`, `modify`, `view_explanation` |
| `reviewing` | 用户正在审查（展开详情） | 显示为"审查中"，展开详情面板 | `approve`, `reject`, `modify`, `close` |
| `approved` | 用户已批准 | 显示为"已批准"（绿色） | `modify`, `view_explanation`, `compare` |
| `rejected` | 用户已拒绝 | 显示为"已拒绝"（红色） | `regenerate`, `modify`, `view_explanation` |
| `modified` | 用户已修改 | 显示为"已修改"（黄色） | `approve`, `reject`, `regenerate`, `view_explanation` |
| `applied` | 已应用到行程 | 显示为"已应用"（蓝色） | `view_explanation`, `rollback`, `compare` |

### 状态转换规则

```typescript
// 状态转换映射
const stateTransitions: Record<DecisionStepStatus, DecisionStepStatus[]> = {
  'pending': ['reviewing', 'approved', 'rejected', 'modified'],
  'reviewing': ['approved', 'rejected', 'modified', 'pending'],
  'approved': ['modified', 'applied'],
  'rejected': ['regenerate', 'modified'],
  'modified': ['approved', 'rejected', 'applied'],
  'applied': ['rollback'], // 回滚后变为 'approved'
};
```

---

## 🎮 用户交互动作

### 1. 查看决策草案

**动作**: `view_draft`  
**端点**: `GET /api/decision-draft/:draftId`  
**UI 表现**: 显示决策草案列表（ToC 模式只显示 Decision Steps）

**响应格式**:
```json
{
  "draft_id": "decision-xxx",
  "plan_id": "plan-xxx",
  "plan_version": 1,
  "decision_steps": [
    {
      "id": "d1",
      "title": "判断是否需要租车",
      "status": "pending",
      "confidence": 0.87,
      "type": "transport-decision"
    }
  ],
  "metadata": {
    "decision_count": 6,
    "created_at": "2026-01-30T10:00:00Z"
  }
}
```

### 2. 查看决策解释

**动作**: `view_explanation`  
**端点**: `GET /api/decision-draft/:draftId/step/:stepId/explanation`  
**UI 表现**: 展开详情面板，显示：
- 决策步骤详情
- 关联的 Step Drafts（Expert 模式）
- 证据链（Evidence Drawer）
- 决策日志
- 三人格评审（如果有）

**响应格式**:
```json
{
  "decision_step": { /* DecisionStep */ },
  "step_drafts": [ /* TripNARAStepDraft[] */ ],
  "evidence_chain": [ /* EvidenceRef[] */ ],
  "decision_log": [ /* DecisionLogEntry[] */ ],
  "three_guardians_review": {
    "abu": { "verdict": "ALLOW", "evidence": [] },
    "dr_dre": { "verdict": "ALLOW", "evidence": [] },
    "neptune": { "verdict": "ADJUST", "evidence": [] }
  }
}
```

### 3. 批准决策步骤

**动作**: `approve`  
**端点**: `PUT /api/decision-draft/:draftId/step/:stepId`  
**请求体**:
```json
{
  "action": "approve",
  "reasoning": "同意此决策"
}
```

**系统行为**:
1. 更新 `DecisionStep.status = 'approved'`
2. 记录 `user_feedback`
3. 写入 `decision_log`
4. 返回更新后的决策草案

**UI 表现**: 步骤状态变为"已批准"（绿色），显示批准时间

### 4. 拒绝决策步骤

**动作**: `reject`  
**端点**: `PUT /api/decision-draft/:draftId/step/:stepId`  
**请求体**:
```json
{
  "action": "reject",
  "reasoning": "不同意此决策，因为..."
}
```

**系统行为**:
1. 更新 `DecisionStep.status = 'rejected'`
2. 记录 `user_feedback`
3. 写入 `decision_log`
4. 提示用户是否需要重新生成

**UI 表现**: 步骤状态变为"已拒绝"（红色），显示拒绝原因，提供"重新生成"按钮

### 5. 修改决策步骤

**动作**: `modify`  
**端点**: `PUT /api/decision-draft/:draftId/step/:stepId`  
**请求体**:
```json
{
  "action": "modify",
  "modifications": {
    "title": "修改后的标题",
    "description": "修改后的描述",
    "outputs": [
      {
        "name": "是否租车",
        "value": "是",
        "confidence": 0.9
      }
    ],
    "evidence_weights": {
      "evidence-1": 0.8,
      "evidence-2": 0.6
    }
  },
  "reasoning": "修改原因"
}
```

**系统行为**:
1. 更新 `DecisionStep` 的相应字段
2. 更新 `DecisionStep.status = 'modified'`
3. 记录 `user_feedback`
4. 写入 `decision_log`
5. 如果修改了 `outputs` 或 `evidence_weights`，提示是否需要局部重算

**UI 表现**: 步骤状态变为"已修改"（黄色），显示修改内容，提供"应用修改"按钮

### 6. 局部重生成

**动作**: `regenerate`  
**端点**: `POST /api/decision-draft/:draftId/regenerate`  
**请求体**:
```json
{
  "step_ids": ["d1", "d2"], // 可选：指定要重生成的步骤，不指定则重生成所有 rejected/modified
  "config": {
    "regenerate_step_drafts": true,
    "regenerate_decision_steps": true,
    "preserve_approved_decisions": true
  }
}
```

**系统行为**:
1. 识别需要重生成的步骤（rejected 或 modified）
2. 保留已批准的步骤（如果 `preserve_approved_decisions = true`）
3. 重新生成受影响的 Decision Steps
4. 重新生成关联的 Step Drafts（如果 `regenerate_step_drafts = true`）
5. 创建新版本（`plan_version++`）
6. 返回更新后的决策草案

**UI 表现**: 显示"正在重新生成..."，完成后刷新决策草案列表

### 7. 应用决策草案

**动作**: `apply`  
**端点**: `POST /api/decision-draft/:draftId/apply`  
**系统行为**:
1. 验证所有决策步骤都已批准或修改
2. 将 Decision Steps 应用到 `OrchestratorState.itinerary`
3. 更新 `DecisionStep.status = 'applied'`
4. 写入 `decision_log`
5. 返回应用结果

**UI 表现**: 显示"已应用到行程"，提供"查看行程"链接

### 8. 对比版本

**动作**: `compare`  
**端点**: `GET /api/decision-draft/:draftId/compare?version1=1&version2=2`  
**系统行为**:
1. 加载两个版本的决策草案
2. 计算差异（新增、删除、修改的决策步骤）
3. 返回对比结果

**UI 表现**: 并排显示两个版本，高亮差异

### 9. 回滚版本

**动作**: `rollback`  
**端点**: `POST /api/decision-draft/:draftId/rollback?target_version=1`  
**系统行为**:
1. 加载目标版本的决策草案
2. 创建新版本（基于目标版本）
3. 更新 `DecisionStep.status = 'approved'`（从 `applied` 回滚）
4. 返回回滚后的决策草案

**UI 表现**: 显示"已回滚到版本 X"，刷新决策草案列表

---

## 📱 UI 组件规范

### 决策步骤卡片（ToC 模式）

```typescript
interface DecisionStepCard {
  // 显示信息
  title: string;
  description: string;
  status: DecisionStepStatus;
  confidence: number; // 0-1，显示为百分比
  type: DecisionType; // 显示为标签
  
  // 操作按钮
  actions: {
    view: boolean; // 查看详情
    approve: boolean; // 批准（status === 'pending' | 'modified'）
    reject: boolean; // 拒绝（status === 'pending' | 'modified'）
    modify: boolean; // 修改（status === 'pending' | 'approved'）
    regenerate: boolean; // 重新生成（status === 'rejected'）
  };
  
  // 状态指示器
  indicators: {
    hasEvidence: boolean; // 有证据
    hasGuardianReview: boolean; // 有三人格评审
    hasUserFeedback: boolean; // 有用户反馈
  };
}
```

### 详情面板（Expert 模式）

```typescript
interface DecisionStepDetailPanel {
  // 基本信息
  step: DecisionStep;
  
  // 标签页
  tabs: {
    overview: boolean; // 概览
    evidence: boolean; // 证据链
    stepDrafts: boolean; // Step Drafts（Expert 模式）
    decisionLog: boolean; // 决策日志
    guardianReview: boolean; // 三人格评审
  };
  
  // 操作区域
  actions: {
    approve: boolean;
    reject: boolean;
    modify: boolean;
    regenerate: boolean;
  };
}
```

---

## 🔗 API 端点规范

### ToC 模式端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/decision-draft/generate` | POST | 生成决策草案 |
| `/api/decision-draft/:draftId` | GET | 查看决策草案（只显示 Decision Steps） |
| `/api/decision-draft/:draftId/step/:stepId` | PUT | 编辑决策步骤（approve/reject/modify） |
| `/api/decision-draft/:draftId/step/:stepId/explanation` | GET | 查看决策解释 |
| `/api/decision-draft/:draftId/apply` | POST | 应用决策草案 |

### Expert/Studio 模式端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/decision-draft/:draftId` | GET | 查看完整决策草案（包含 Step Drafts） |
| `/api/decision-draft/:draftId/regenerate` | POST | 局部重生成 |
| `/api/decision-draft/:draftId/compare` | GET | 对比版本 |
| `/api/decision-draft/:draftId/rollback` | POST | 回滚版本 |

---

## 🎨 UI 状态与系统行为映射

### 状态同步规则

1. **前端状态必须从后端获取**：不允许前端维护独立的状态
2. **操作后立即刷新**：每次用户操作后，前端必须重新获取状态
3. **乐观更新**：可以先更新 UI，但必须等待后端确认

### 错误处理

| 错误类型 | HTTP 状态码 | UI 表现 |
|----------|------------|---------|
| 决策步骤不存在 | 404 | 显示错误提示，刷新列表 |
| 状态转换无效 | 400 | 显示错误提示，禁用无效操作按钮 |
| 权限不足 | 403 | 显示权限错误，隐藏操作按钮 |
| 服务器错误 | 500 | 显示错误提示，提供重试按钮 |

---

## 📝 实现检查清单

### P1 完成项 ✅

- [x] 定义 UI 状态机
- [x] 定义用户交互动作
- [x] 定义 API 端点规范
- [x] 定义 UI 组件规范
- [x] 定义状态同步规则

### P1 待实现项 ⏳

- [ ] 实现前端状态管理（React/Vue 组件）
- [ ] 实现 API 端点（Controller）
- [ ] 实现状态转换验证
- [ ] 实现版本对比功能
- [ ] 实现回滚功能

---

## 📚 参考

- `src/decision-draft/interfaces/decision-draft.interface.ts` - 接口定义
- `src/decision-draft/services/decision-draft-editor.service.ts` - 编辑服务
- `src/decision-draft/controllers/decision-draft.controller.ts` - API 控制器
