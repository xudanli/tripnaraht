# Decision Layer 快速参考

## 🚀 启动和访问

```bash
# 启动服务器
npm run backend:dev
# 或
npm run dev

# 访问 Swagger UI
http://localhost:3000/api
```

---

## 📋 所有功能对应的 Swagger 接口

### 在 Swagger UI 中查找

1. 访问 `http://localhost:3000/api`
2. 找到 **`decision`** tag（在页面顶部 Tags 列表中）
3. 展开后可以看到所有 9 个接口

---

## 🎯 功能到接口映射

### 核心功能（3个）

| 功能 | 接口路径 | 方法 | 说明 |
|------|---------|------|------|
| **生成计划** | `/decision/generate-plan` | POST | Abu + Dr.Dre 策略 |
| **修复计划** | `/decision/repair-plan` | POST | Neptune 策略 |
| **校验约束** | `/decision/check-constraints` | POST | 时间窗、连通性、预算、体力、天气 |

### 增强功能（6个）

| 功能 | 接口路径 | 方法 | 说明 |
|------|---------|------|------|
| **解释计划** | `/decision/explain-plan` | POST | 可解释性 UI 组件 |
| **从日志学习** | `/decision/learn-from-logs` | POST | 学习机制 |
| **评估计划** | `/decision/evaluate-plan` | POST | 指标体系 |
| **高级约束** | `/decision/check-advanced-constraints` | POST | 互斥组、依赖关系 |
| **监控指标** | `/decision/monitoring/metrics` | GET | 性能、质量、使用统计 |
| **告警列表** | `/decision/monitoring/alerts` | GET | 告警信息 |

---

## 🧪 快速测试

### 方法 1: Swagger UI（最简单）

1. 打开 `http://localhost:3000/api`
2. 找到 `decision` tag
3. 选择接口 → "Try it out" → 修改请求 → "Execute"

### 方法 2: curl

```bash
# 生成计划
curl -X POST http://localhost:3000/decision/generate-plan \
  -H "Content-Type: application/json" \
  -d '{"state": {...}}'

# 获取监控指标
curl http://localhost:3000/decision/monitoring/metrics
```

### 方法 3: 测试脚本

```bash
./src/trips/decision/scripts/test-decision-api.sh
```

---

## 📚 详细文档

- **API_ENDPOINTS.md** - 完整接口文档
- **SWAGGER_MAPPING.md** - 功能映射表
- **TESTING_GUIDE.md** - 测试指南
- **SWAGGER_INTERFACE_MAP.md** - 详细接口映射

---

## ✅ 状态

- ✅ 所有接口已配置 Swagger 文档
- ✅ 编译通过，无错误
- ✅ 依赖注入已修复
- ✅ 模块正确注册

**可以开始测试了！** 🎉

