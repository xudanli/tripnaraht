# TripDetail Agent

## 角色定位

**TripDetail Agent** 是行程详情页的 Agent，负责"理解与掌控旅行现状"。

**项目实现位置**：
- 服务：`src/agent/services/trip-detail-agent.service.ts` - `TripDetailAgentService`
- 控制器：`src/agent/trip-detail.controller.ts` - `TripDetailController`

## 核心职责

1. **理解当前行程状态**
   - 解析行程状态
   - 识别关键信息
   - 提取状态摘要

2. **分析行程健康度**
   - 评估行程健康度
   - 识别潜在问题
   - 提供改进建议

3. **解释决策**
   - 解释关键决策
   - 提供决策理由
   - 展示决策过程

4. **展示证据**
   - 展示决策证据
   - 提供证据来源
   - 验证证据有效性

## 输入/输出 Schema

### 输入：TripDetailAgentRequest

```typescript
{
  tripId: string;             // Trip ID
  action: 'get_status' | 'get_health' | 'explain_decisions' | 'show_evidence' | 'get_full';  // 操作类型
  decisionId?: string;        // 决策 ID（explain_decisions 时使用）
  evidenceRefs?: string[];    // 证据引用（show_evidence 时使用）
}
```

### 输出：TripDetailAgentResponse

```typescript
{
  detailState: DetailState;   // 详情状态
  personas?: PersonaShellOutput;  // 三人格输出（如果有）
  uiOutput: {
    status?: TripStatusUnderstanding;  // 状态理解
    health?: TripHealth;               // 健康度
    explanations?: DecisionExplanation[];  // 决策解释
    evidence?: Array<{                  // 证据列表
      id: string;
      source: string;
      // ...
    }>;
  };
}
```

## 调用的 Skills

- `detail.understandStatus` - 理解状态
- `detail.analyzeHealth` - 分析健康度
- `detail.explainDecision` - 解释决策
- `detail.showEvidence` - 展示证据

## 工作流程

```
用户请求
  ↓
TripDetailAgent
  ├─ action === 'get_status'
  │   └─ detail.understandStatus → 理解状态
  ├─ action === 'get_health'
  │   └─ detail.analyzeHealth → 分析健康度
  ├─ action === 'explain_decisions'
  │   └─ detail.explainDecision → 解释决策
  ├─ action === 'show_evidence'
  │   └─ detail.showEvidence → 展示证据
  └─ action === 'get_full'
      └─ 返回完整详情
      ↓
返回 DetailState 和 UI 输出
```

## 参考文档

- `src/agent/services/trip-detail-agent.service.ts` - 服务实现
- `src/agent/trip-detail.controller.ts` - 控制器实现
- `src/skills/detail/shared/detail-state.types.ts` - DetailState 类型定义
