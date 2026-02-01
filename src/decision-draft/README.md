# Decision Draft Module

**Decision-First Agent Engine** - 决策优先的旅行规划系统

---

## 🚀 快速开始

### 测试 API 接口

#### 1. 启动服务器

```bash
npm run dev
```

#### 2. 运行 HTTP API 测试

```bash
npm run test:decision-draft:api:http
```

这将测试所有 18 个 API 端点（8 个用户端 + 10 个管理端）。

#### 3. 查看测试结果

测试脚本会输出：
- ✅ 成功的测试（绿色）
- ❌ 失败的测试（红色）
- 📊 测试总结（成功率、耗时）

---

## 📚 文档

- [API 接口文档](../../docs/DECISION_DRAFT_API.md)
- [前端需求描述](../../docs/DECISION_DRAFT_FRONTEND_REQUIREMENTS.md)
- [API 测试指南](../../docs/DECISION_DRAFT_API_TEST_GUIDE.md)
- [用户交互协议](./UX_AS_CONTRACT.md)

---

## 🧪 测试脚本

### HTTP API 测试
```bash
npm run test:decision-draft:api:http
```
测试所有 HTTP 端点，包括完整的用户流程。

### 服务层测试
```bash
npm run test:decision-draft:api
```
测试服务层功能（不通过 HTTP），适合单元测试。

---

## 📖 API 端点

### 用户端（8 个）
- `GET /api/decision-draft/:draftId` - 获取决策草案
- `GET /api/decision-draft/:draftId/explanation` - 获取决策解释
- `GET /api/decision-draft/:draftId/step/:stepId/explanation` - 获取步骤解释
- `PUT /api/decision-draft/:draftId/step/:stepId` - 编辑决策步骤
- `POST /api/decision-draft/:draftId/apply` - 应用决策草案
- `GET /api/decision-draft/:draftId/versions` - 获取版本列表
- `GET /api/decision-draft/:draftId/versions/:versionId` - 获取版本详情
- `GET /api/decision-draft/:draftId/versions/:versionId1/compare/:versionId2` - 对比版本

### 管理端（10 个）
- `POST /api/decision-draft/admin/generate` - 生成决策草案
- `PUT /api/decision-draft/admin/:draftId/step/:stepId` - 编辑决策步骤
- `PUT /api/decision-draft/admin/:draftId/steps/batch` - 批量编辑
- `POST /api/decision-draft/admin/:draftId/regenerate` - 局部重算
- `PUT /api/decision-draft/admin/:draftId/steps/reorder` - 重新排序
- `POST /api/decision-draft/admin/:draftId/version` - 保存版本
- `POST /api/decision-draft/admin/:draftId/version/:versionId/rollback` - 回滚版本
- `POST /api/decision-draft/admin/:draftId/version/:versionId/fork` - Fork 版本
- `GET /api/decision-draft/admin/stats` - 获取统计信息
- `GET /api/decision-draft/admin/:draftId/debug-info` - 获取调试信息

---

## 🔧 开发

### 模块结构

```
src/decision-draft/
├── controllers/          # API 控制器
│   ├── decision-draft.controller.ts        # 用户端
│   └── decision-draft-admin.controller.ts  # 管理端
├── services/            # 业务逻辑
│   ├── decision-draft-generator.service.ts      # 生成服务
│   ├── decision-draft-editor.service.ts         # 编辑服务
│   ├── decision-draft-observability.service.ts  # 可观测性服务
│   ├── decision-draft-version.service.ts        # 版本管理服务
│   └── decision-explanation.service.ts          # 解释服务
├── storage/             # 存储层
│   └── decision-draft-storage.service.ts
├── interfaces/          # 接口定义
│   └── decision-draft.interface.ts
├── dto/                 # DTO 定义
│   └── decision-draft.dto.ts
└── mapping/             # 映射规则
    └── decision-type-to-step-draft.mapper.ts
```

---

## 📝 示例

### 生成决策草案

```typescript
POST /api/decision-draft/admin/generate
{
  "user_input": "我想去冰岛旅行7天",
  "trip_plan_request": {
    "request_id": "req-123",
    "origin": "Beijing",
    "destination": "Iceland",
    "days": 7
  },
  "config": {
    "user_mode": "toc"
  }
}
```

### 编辑决策步骤

```typescript
PUT /api/decision-draft/{draftId}/step/{stepId}
{
  "operation": {
    "decision_step_id": "{stepId}",
    "action": "approve",
    "reasoning": "同意此决策"
  }
}
```

---

## 🔗 相关模块

- `src/chain-of-work/` - Chain-of-Work 引擎（Step Drafts）
- `src/agent/` - Agent 编排器（状态机集成）
- `src/llm/` - LLM 服务

---

## 📊 状态

- ✅ P0: 完成（统一格式、集成状态机）
- ✅ P1: 后端完成（Trace、Metrics、用户交互协议、部分重生成）
- ⏳ P2: 前端待实现
