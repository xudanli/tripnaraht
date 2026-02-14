# TripNARA RAG 快速参考手册

**版本**: v1.0
**更新**: 2026-01-25

---

## 🚀 核心端点速查

### RAG检索
```bash
POST /rag/retrieve
```
```json
{
  "query": "你的问题",
  "category": "WEATHER|POI_HOURS|RULES|GENERAL"
}
```

### Gate评估
```bash
POST /rag/gate/evaluate
```
```json
{
  "request": {
    "origin": "起点",
    "destination": "终点",
    "startDate": "2026-01-25"
  }
}
```

### 监控指标
```bash
GET /rag/metrics        # Prometheus格式
GET /rag/metrics/stats  # 人类可读
```

---

## 📊 降级层级

| Level | 名称 | 延迟 | 使用场景 |
|-------|------|------|----------|
| 1️⃣ | VECTOR_RAG | ~50ms | 常规问题 |
| 2️⃣ | HYBRID_RAG | ~100ms | 复杂查询 |
| 3️⃣ | KEYWORD_SEARCH | ~150ms | 简单关键词 |
| 4️⃣ | WEB_BROWSE | ~2000ms | 实时信息 |
| 5️⃣ | GRACEFUL_FAILURE | ~10ms | 无法回答 |

---

## 🎯 Gate决策结果

| 结果 | 含义 | 行动 |
|------|------|------|
| ✅ ALLOW | 允许 | 直接执行 |
| ⚠️ ADJUST_REQUIRED | 需调整 | 应用调整建议 |
| 🚫 BLOCK | 阻止 | 提供替代方案 |
| ❓ NEED_USER_CONFIRM | 需确认 | 显示风险等待确认 |

---

## 🔧 常用工具调用

### 天气查询
```bash
POST /rag/tools/weather
```
```json
{"location": "Reykjavik, Iceland"}
```

### POI详情
```bash
POST /rag/tools/places
```
```json
{"query": "Blue Lagoon Iceland"}
```

### 网页浏览
```bash
POST /rag/tools/browse
```
```json
{
  "url": "https://example.com",
  "query": "查找内容"
}
```

---

## 📈 监控指标速查

### 关键指标

| 指标 | PromQL | 目标 |
|------|--------|------|
| **缓存命中率** | `rate(rag_cache_hits_total[5m]) / (rate(rag_cache_hits_total[5m]) + rate(rag_cache_misses_total[5m]))` | >= 70% |
| **RAG查询P95** | `histogram_quantile(0.95, rate(rag_query_duration_ms_bucket[5m]))` | < 500ms |
| **API错误率** | `rate(rag_api_errors_total[5m]) / rate(rag_api_calls_total[5m])` | < 5% |

---

## 🐛 常见错误处理

| 错误码 | 原因 | 解决方案 |
|--------|------|----------|
| `RAG_NO_RESULTS` | 未找到结果 | 已自动降级 |
| `RAG_TIMEOUT` | 超时 | 重试 |
| `GATE_BLOCK` | Gate阻止 | 查看alternatives |
| `RATE_LIMIT_EXCEEDED` | 请求过多 | 等待retryAfter秒 |

---

## 💻 代码示例

### TypeScript
```typescript
import axios from 'axios';

const result = await axios.post('http://localhost:3000/rag/retrieve', {
  query: '冰岛蓝湖温泉现在开门吗',
  category: 'POI_HOURS'
});

console.log(result.data.fallbackLevel); // VECTOR_RAG
console.log(result.data.chunks[0].content);
```

### cURL
```bash
curl -X POST http://localhost:3000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"冰岛天气","category":"WEATHER"}'
```

### Python
```python
import requests

response = requests.post('http://localhost:3000/rag/retrieve', json={
    'query': '冰岛蓝湖温泉现在开门吗',
    'category': 'POI_HOURS'
})

data = response.json()
print(f"Fallback Level: {data['data']['fallbackLevel']}")
print(f"Confidence: {data['data']['confidence']}")
```

---

## 🎨 响应结构速查

### 成功响应
```json
{
  "success": true,
  "data": {
    "chunks": [...],
    "fallbackLevel": "VECTOR_RAG",
    "confidence": 0.92
  }
}
```

### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "RAG_NO_RESULTS",
    "message": "...",
    "details": {...}
  }
}
```

---

## 📱 测试命令

```bash
# 健康检查
curl http://localhost:3000/health

# 监控指标
curl http://localhost:3000/rag/metrics/stats

# RAG检索
curl -X POST http://localhost:3000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
```

---

## 📚 完整文档

- [完整API文档](./RAG_API_REFERENCE.md) - 所有端点详解
- [监控指南](./PROMETHEUS_MONITORING_GUIDE.md) - Prometheus配置
- [架构总览](../README_RAG_ARCHITECTURE.md) - 系统架构

---

**快速开始**: [README_RAG_ARCHITECTURE.md](../README_RAG_ARCHITECTURE.md)
**问题反馈**: GitHub Issues
