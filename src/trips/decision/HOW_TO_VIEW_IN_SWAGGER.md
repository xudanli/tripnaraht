# 如何在 Swagger UI 中查看 Decision 接口

## ✅ 确认接口已注册

所有 9 个接口已经正确注册到 Swagger，可以通过以下方式验证：

```bash
# 检查 Swagger JSON
curl http://localhost:3000/api-json | grep -o '"/decision/[^"]*"'
```

应该能看到：
- `/decision/generate-plan`
- `/decision/repair-plan`
- `/decision/check-constraints`
- `/decision/explain-plan`
- `/decision/learn-from-logs`
- `/decision/evaluate-plan`
- `/decision/check-advanced-constraints`
- `/decision/monitoring/metrics`
- `/decision/monitoring/alerts`

---

## 🔍 在 Swagger UI 中查看

### 方法 1: 通过 Tag 查找（推荐）

1. **访问 Swagger UI**
   ```
   http://localhost:3000/api
   ```

2. **找到 Tags 列表**
   - 在页面顶部或左侧，找到 **Tags** 列表
   - 滚动查找 **`decision`** tag
   - 如果有很多 tags，可以使用浏览器搜索功能（Ctrl+F / Cmd+F）搜索 "decision"

3. **展开 decision tag**
   - 点击 **`decision`** tag
   - 应该能看到所有 9 个接口展开

4. **查看接口详情**
   - 点击接口名称（如 `POST /decision/generate-plan`）
   - 查看请求参数、响应格式等

---

### 方法 2: 使用浏览器搜索

1. **打开 Swagger UI**
   ```
   http://localhost:3000/api
   ```

2. **使用浏览器搜索**
   - 按 `Ctrl+F` (Windows/Linux) 或 `Cmd+F` (Mac)
   - 搜索 "decision"
   - 应该能找到所有 decision 相关的接口

---

### 方法 3: 直接访问接口路径

如果 Swagger UI 中看不到，可以直接测试接口：

```bash
# 测试生成计划接口
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
```

---

## 🐛 如果仍然看不到

### 1. 清除浏览器缓存

- **Chrome/Edge**: `Ctrl+Shift+Delete` → 清除缓存
- **Firefox**: `Ctrl+Shift+Delete` → 清除缓存
- 或者使用 **无痕模式** 打开 Swagger UI

### 2. 强制刷新页面

- **Windows/Linux**: `Ctrl+F5` 或 `Ctrl+Shift+R`
- **Mac**: `Cmd+Shift+R`

### 3. 重启服务器

```bash
# 停止服务器（Ctrl+C）
# 然后重新启动
npm run backend:dev
```

### 4. 检查服务器日志

确认服务器启动时没有错误：

```bash
# 查看是否有错误信息
npm run backend:dev
```

应该能看到类似这样的输出：
```
🚀 Application is running on: http://localhost:3000
📚 Swagger 文档: http://localhost:3000/api
```

---

## 📋 完整接口列表

| # | 接口路径 | 方法 | 说明 |
|---|---------|------|------|
| 1 | `/decision/generate-plan` | POST | 生成旅行计划 |
| 2 | `/decision/repair-plan` | POST | 修复旅行计划 |
| 3 | `/decision/check-constraints` | POST | 校验计划约束 |
| 4 | `/decision/explain-plan` | POST | 解释计划 |
| 5 | `/decision/learn-from-logs` | POST | 从日志中学习 |
| 6 | `/decision/evaluate-plan` | POST | 评估计划指标 |
| 7 | `/decision/check-advanced-constraints` | POST | 检查高级约束 |
| 8 | `/decision/monitoring/metrics` | GET | 获取监控指标 |
| 9 | `/decision/monitoring/alerts` | GET | 获取告警列表 |

---

## ✅ 验证步骤

1. **确认服务器运行**
   ```bash
   curl http://localhost:3000/api-json | grep decision
   ```

2. **确认接口存在**
   ```bash
   curl http://localhost:3000/api-json | grep -o '"/decision/[^"]*"'
   ```

3. **访问 Swagger UI**
   ```
   http://localhost:3000/api
   ```

4. **查找 decision tag**
   - 在 Tags 列表中查找
   - 或使用浏览器搜索功能

---

## 💡 提示

- 如果 Swagger UI 加载很慢，可能是接口太多，可以等待加载完成
- 某些浏览器扩展可能会影响 Swagger UI 的显示
- 如果使用代理，确保代理配置正确

---

## 📞 如果问题仍然存在

请检查：
1. 服务器是否正常运行
2. 模块是否正确导入（`DecisionModule` 应该在 `TripsModule` 中）
3. Controller 是否正确注册（`DecisionController` 应该在 `DecisionModule` 的 `controllers` 中）
4. 是否有编译错误

