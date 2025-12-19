# Decision Layer 测试指南

## 🚀 快速开始

### 1. 启动服务器

```bash
npm run start:dev
# 或
npm run backend:dev
```

服务器启动后：
- API 地址: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api`

---

## 📋 Swagger 接口列表

访问 `http://localhost:3000/api`，在 `decision` tag 下可以看到所有接口：

### 核心功能接口

1. **POST /decision/generate-plan** - 生成旅行计划
2. **POST /decision/repair-plan** - 修复旅行计划
3. **POST /decision/check-constraints** - 校验计划约束

### 增强功能接口

4. **POST /decision/explain-plan** - 解释计划（可解释性）
5. **POST /decision/learn-from-logs** - 从日志中学习
6. **POST /decision/evaluate-plan** - 评估计划指标
7. **POST /decision/check-advanced-constraints** - 检查高级约束
8. **GET /decision/monitoring/metrics** - 获取监控指标
9. **GET /decision/monitoring/alerts** - 获取告警列表

---

## 🧪 测试方法

### 方法 1: 使用 Swagger UI（推荐）

1. 打开浏览器访问 `http://localhost:3000/api`
2. 找到 `decision` tag 并展开
3. 选择要测试的接口（如 `POST /decision/generate-plan`）
4. 点击 "Try it out"
5. 修改请求体（使用示例数据或自定义）
6. 点击 "Execute"
7. 查看响应结果

### 方法 2: 使用测试脚本

```bash
# 运行测试脚本
./src/trips/decision/scripts/test-decision-api.sh
```

### 方法 3: 使用 curl

```bash
# 生成计划
curl -X POST http://localhost:3000/decision/generate-plan \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "context": {
        "destination": "IS",
        "startDate": "2026-01-02",
        "durationDays": 1,
        "preferences": {
          "intents": { "nature": 0.8 },
          "pace": "moderate",
          "riskTolerance": "medium"
        }
      },
      "candidatesByDate": {},
      "signals": {
        "lastUpdatedAt": "2026-01-01T00:00:00.000Z"
      }
    }
  }'

# 获取监控指标
curl http://localhost:3000/decision/monitoring/metrics
```

### 方法 4: 使用 Postman/Insomnia

1. 导入 Swagger JSON: `http://localhost:3000/api-json`
2. 选择 `decision` tag
3. 测试各个接口

---

## 📊 功能到接口的映射

| 功能 | 接口 | 说明 |
|------|------|------|
| **Abu 策略** | `POST /decision/generate-plan` | 保核心体验，砍边角 |
| **Dr.Dre 策略** | `POST /decision/generate-plan` | 带约束的日程排序 |
| **Neptune 策略** | `POST /decision/repair-plan` | 最小改动修复 |
| **约束校验** | `POST /decision/check-constraints` | 时间窗、连通性、预算、体力、天气 |
| **可解释性** | `POST /decision/explain-plan` | 生成计划解释 |
| **学习机制** | `POST /decision/learn-from-logs` | 从日志中学习 |
| **评估框架** | `POST /decision/evaluate-plan` | 计算计划指标 |
| **高级约束** | `POST /decision/check-advanced-constraints` | 互斥组、依赖关系 |
| **监控指标** | `GET /decision/monitoring/metrics` | 性能、质量、使用统计 |
| **告警** | `GET /decision/monitoring/alerts` | 告警列表 |

---

## 🔍 验证步骤

### 1. 验证 Swagger 文档

访问 `http://localhost:3000/api`，确认：
- ✅ 能看到 `decision` tag
- ✅ 能看到所有 9 个接口
- ✅ 每个接口都有详细描述
- ✅ 请求/响应示例正确

### 2. 测试核心功能

```bash
# 1. 生成计划
curl -X POST http://localhost:3000/decision/generate-plan \
  -H "Content-Type: application/json" \
  -d @test-data/generate-plan.json

# 2. 校验约束
curl -X POST http://localhost:3000/decision/check-constraints \
  -H "Content-Type: application/json" \
  -d @test-data/check-constraints.json

# 3. 修复计划
curl -X POST http://localhost:3000/decision/repair-plan \
  -H "Content-Type: application/json" \
  -d @test-data/repair-plan.json
```

### 3. 测试增强功能

```bash
# 1. 解释计划
curl -X POST http://localhost:3000/decision/explain-plan \
  -H "Content-Type: application/json" \
  -d @test-data/explain-plan.json

# 2. 获取监控指标
curl http://localhost:3000/decision/monitoring/metrics

# 3. 获取告警
curl http://localhost:3000/decision/monitoring/alerts
```

---

## 📝 测试数据示例

### 生成计划请求示例

```json
{
  "state": {
    "context": {
      "destination": "IS",
      "startDate": "2026-01-02",
      "durationDays": 7,
      "preferences": {
        "intents": {
          "nature": 0.8,
          "culture": 0.4
        },
        "pace": "moderate",
        "riskTolerance": "medium"
      },
      "budget": {
        "amount": 50000,
        "currency": "CNY"
      }
    },
    "candidatesByDate": {
      "2026-01-02": []
    },
    "signals": {
      "lastUpdatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

---

## ✅ 预期结果

### 成功响应格式

```json
{
  "success": true,
  "data": {
    // 具体数据
  }
}
```

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误信息"
  }
}
```

---

## 🐛 常见问题

### 1. 接口返回 404

**原因**: 模块未正确注册

**解决**: 确认 `DecisionModule` 已导入到 `TripsModule`，且 `TripsModule` 已导入到 `AppModule`

### 2. 接口返回 500

**原因**: 服务依赖未正确注入

**解决**: 检查 `DecisionModule` 的 providers 列表，确认所有服务都已注册

### 3. Swagger 中看不到接口

**原因**: Controller 未注册或 tag 未配置

**解决**: 
- 确认 `DecisionController` 在 `DecisionModule` 的 `controllers` 数组中
- 确认 `main.ts` 中已添加 `decision` tag

---

## 📚 相关文档

- **API 接口文档**: `API_ENDPOINTS.md`
- **Swagger 映射**: `SWAGGER_MAPPING.md`
- **README**: `README.md`
- **实现总结**: `IMPLEMENTATION_SUMMARY.md`

