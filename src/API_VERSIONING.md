# API 版本管理规范

**版本**: 1.0.0  
**最后更新**: 2026-02-08  
**适用范围**: 所有 API 接口

---

## 📋 目录

- [版本号规则](#版本号规则)
- [版本管理策略](#版本管理策略)
- [版本迁移指南](#版本迁移指南)
- [版本发布流程](#版本发布流程)
- [版本兼容性](#版本兼容性)
- [废弃接口处理](#废弃接口处理)

---

## 🎯 版本号规则

### 语义化版本（Semantic Versioning）

API 版本遵循 [Semantic Versioning 2.0.0](https://semver.org/) 规范：

```
MAJOR.MINOR.PATCH
```

- **MAJOR** (主版本号): 不兼容的 API 变更
- **MINOR** (次版本号): 向后兼容的功能性新增
- **PATCH** (修订号): 向后兼容的问题修正

### 版本号示例

| 版本号 | 说明 | 示例 |
|--------|------|------|
| `v1.0.0` | 初始版本 | 首次发布的稳定版本 |
| `v1.1.0` | 新增功能 | 添加新接口，不破坏现有接口 |
| `v1.1.1` | 问题修复 | 修复 bug，不改变接口行为 |
| `v2.0.0` | 重大变更 | 不兼容的 API 变更 |

---

## 📡 版本管理策略

### 1. URL 路径版本控制（推荐）

**策略**: 在 URL 路径中包含版本号

**格式**: `/api/v{MAJOR}/{module}/{endpoint}`

**示例**:
```
/api/v1/agent/planning-assistant/chat
/api/v2/agent/planning-assistant/chat
```

**优点**:
- ✅ 清晰明确，易于理解
- ✅ 支持多版本共存
- ✅ 便于版本迁移

**缺点**:
- ⚠️ URL 路径较长

---

### 2. 请求头版本控制（备选）

**策略**: 通过 HTTP 请求头指定版本

**格式**: `Accept: application/vnd.tripnara.v{MAJOR}+json`

**示例**:
```http
GET /api/agent/planning-assistant/chat
Accept: application/vnd.tripnara.v1+json
```

**优点**:
- ✅ URL 路径简洁
- ✅ 符合 RESTful 规范

**缺点**:
- ⚠️ 不够直观
- ⚠️ 需要客户端显式指定

---

### 3. 查询参数版本控制（不推荐）

**策略**: 通过查询参数指定版本

**格式**: `/api/{module}/{endpoint}?version=v{MAJOR}`

**示例**:
```
/api/agent/planning-assistant/chat?version=v1
```

**缺点**:
- ❌ 容易被忽略
- ❌ 不利于缓存
- ❌ 不符合 RESTful 规范

---

## 🔄 版本迁移指南

### 迁移原则

1. **向后兼容**: 新版本应尽可能保持向后兼容
2. **渐进迁移**: 提供迁移期，支持多版本共存
3. **明确文档**: 提供详细的迁移指南和示例
4. **充分测试**: 确保迁移过程稳定可靠

---

### 迁移流程

#### 阶段1: 准备阶段（1-2周）

1. **发布新版本**
   - 部署新版本 API（如 `v2.0.0`）
   - 保持旧版本（如 `v1.0.0`）继续运行
   - 更新文档，说明新版本变更

2. **通知用户**
   - 发送迁移通知邮件
   - 在文档中标注旧版本废弃时间
   - 提供迁移指南和示例

#### 阶段2: 迁移期（4-8周）

1. **监控迁移进度**
   - 统计各版本使用量
   - 识别未迁移的用户
   - 提供技术支持

2. **逐步迁移**
   - 鼓励用户迁移到新版本
   - 提供迁移工具和脚本
   - 解答迁移问题

#### 阶段3: 废弃阶段（2-4周）

1. **废弃通知**
   - 提前 2 周发送废弃通知
   - 在 API 响应中添加废弃警告
   - 提供迁移截止日期

2. **停止服务**
   - 停止旧版本服务
   - 返回 410 Gone 状态码
   - 提供迁移指引

---

### 迁移示例

#### 从 v1.0.0 迁移到 v2.0.0

**变更说明**:
- `POST /api/v1/agent/planning-assistant/chat` → `POST /api/v2/agent/planning-assistant/chat`
- 请求参数变更：`tripId` → `sessionId`
- 响应格式变更：新增 `phase` 字段

**迁移步骤**:

```typescript
// 旧代码 (v1.0.0)
async function sendMessage(tripId: string, message: string) {
  const response = await fetch('/api/v1/agent/planning-assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId,
      message,
    }),
  });
  return response.json();
}

// 新代码 (v2.0.0)
async function sendMessage(sessionId: string, message: string) {
  // 1. 先创建会话（如果还没有）
  if (!sessionId) {
    const sessionRes = await fetch('/api/v2/agent/planning-assistant/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { sessionId: newSessionId } = await sessionRes.json();
    sessionId = newSessionId;
  }

  // 2. 发送消息
  const response = await fetch('/api/v2/agent/planning-assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message,
    }),
  });
  return response.json();
}
```

**迁移检查清单**:
- [ ] 更新 API 基础路径（`/api/v1/` → `/api/v2/`）
- [ ] 更新请求参数（`tripId` → `sessionId`）
- [ ] 添加会话创建逻辑
- [ ] 更新响应处理（处理 `phase` 字段）
- [ ] 更新错误处理
- [ ] 测试所有功能
- [ ] 更新文档

---

## 🚀 版本发布流程

### 1. 开发阶段

1. **创建功能分支**
   ```bash
   git checkout -b feature/api-v2-planning-assistant
   ```

2. **实现新版本**
   - 实现新版本接口
   - 编写单元测试
   - 更新文档

3. **代码审查**
   - 提交 Pull Request
   - 代码审查
   - 修改和完善

### 2. 测试阶段

1. **集成测试**
   - 运行自动化测试
   - 手动测试新版本接口
   - 测试版本兼容性

2. **性能测试**
   - 测试接口性能
   - 测试并发能力
   - 优化性能瓶颈

### 3. 发布阶段

1. **预发布**
   - 部署到预发布环境
   - 进行完整测试
   - 验证文档准确性

2. **正式发布**
   - 部署到生产环境
   - 监控服务状态
   - 发送发布通知

3. **后续维护**
   - 监控错误日志
   - 收集用户反馈
   - 修复问题

---

## 🔗 版本兼容性

### 兼容性矩阵

| 版本 | 兼容性 | 说明 |
|------|--------|------|
| **v1.0.0** | 稳定 | 初始版本，已稳定运行 |
| **v1.1.0** | 向后兼容 | 新增功能，不破坏现有接口 |
| **v2.0.0** | 不兼容 | 重大变更，需要迁移 |

### 兼容性规则

1. **主版本号变更（MAJOR）**
   - 不兼容的 API 变更
   - 需要客户端迁移
   - 提供迁移指南

2. **次版本号变更（MINOR）**
   - 向后兼容的功能新增
   - 客户端可选择使用新功能
   - 不影响现有功能

3. **修订号变更（PATCH）**
   - 问题修复和优化
   - 完全向后兼容
   - 建议更新到最新版本

---

## ⚠️ 废弃接口处理

### 废弃策略

1. **废弃通知**
   - 在文档中标注废弃状态
   - 在 API 响应中添加废弃警告头
   - 提供替代方案和迁移指南

2. **废弃警告头**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: true
Sunset: Sat, 31 Dec 2026 23:59:59 GMT
Link: <https://api.example.com/docs/v2/migration>; rel="deprecation"
```

3. **废弃时间表**

| 阶段 | 时间 | 说明 |
|------|------|------|
| **废弃通知** | T+0 | 标记为废弃，发送通知 |
| **迁移期** | T+4周 | 提供迁移支持 |
| **停止服务** | T+8周 | 停止服务，返回 410 Gone |

### 废弃接口示例

**废弃接口**: `POST /api/v1/agent/planning-assistant/chat`

**废弃原因**: 使用 `tripId` 参数，新版本改为 `sessionId`

**替代方案**: `POST /api/v2/agent/planning-assistant/chat`

**迁移指南**: [迁移文档链接]

**废弃时间**: 2026-04-01

**停止服务**: 2026-06-01

---

## 📊 版本使用统计

### 监控指标

- **版本使用量**: 统计各版本 API 调用量
- **迁移进度**: 跟踪用户迁移到新版本的进度
- **错误率**: 监控各版本的错误率
- **性能指标**: 对比各版本的性能

### 统计示例

```json
{
  "version": "v1.0.0",
  "usage": {
    "totalRequests": 100000,
    "uniqueUsers": 5000,
    "errorRate": 0.5,
    "avgResponseTime": 800
  },
  "status": "deprecated",
  "deprecationDate": "2026-02-01",
  "sunsetDate": "2026-04-01"
}
```

---

## 📝 版本变更日志

### v2.0.0 (2026-02-08)

**重大变更**:
- ✅ 规划助手接口重构，使用 `sessionId` 替代 `tripId`
- ✅ 新增会话管理接口
- ✅ 统一错误响应格式

**新增功能**:
- ✅ 快速推荐接口（无需会话）
- ✅ 用户偏好管理接口

**废弃功能**:
- ⚠️ `POST /api/v1/agent/planning-assistant/chat`（使用 `tripId`）

**迁移指南**: [查看迁移指南](#迁移示例)

---

### v1.1.0 (2026-01-15)

**新增功能**:
- ✅ 新增用户偏好接口
- ✅ 新增快速推荐接口

**改进**:
- ✅ 优化错误响应格式
- ✅ 提升接口性能

---

### v1.0.0 (2025-12-01)

**初始版本**:
- ✅ 规划助手核心功能
- ✅ 对话接口
- ✅ 推荐接口

---

## 🔗 相关文档

- [API 文档模板](./API_DOCUMENTATION_TEMPLATE.md)
- [API 错误码定义](./API_ERROR_CODES.md)
- [产品经理接口梳理](./API_PRODUCT_MANAGER_REVIEW.md)

---

## 📞 支持

**版本管理**: 后端架构团队  
**技术支持**: [联系方式]  
**最后更新**: 2026-02-08

---

**文档维护**: 后端架构团队  
**最后更新**: 2026-02-08  
**下次审查**: 2026-03-08
