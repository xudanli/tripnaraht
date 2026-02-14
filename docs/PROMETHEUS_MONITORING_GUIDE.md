# TripNARA RAG Prometheus 监控指南

**版本**: v1.0
**创建日期**: 2026-01-25
**状态**: ✅ 生产就绪

---

## 📊 监控架构概览

```
┌────────────────────┐
│  TripNARA API      │
│  (Port 3000)       │
│                    │
│  GET /rag/metrics  │ ◄── Prometheus 抓取指标
└────────────────────┘
          │
          ▼
┌────────────────────┐
│   Prometheus       │
│   (Port 9090)      │ ◄── 存储时序数据
└────────────────────┘
          │
          ▼
┌────────────────────┐
│    Grafana         │
│   (Port 3001)      │ ◄── 可视化 Dashboard
└────────────────────┘
```

---

## 🚀 快速开始

### 1. 启动监控堆栈（Docker）

```bash
cd monitoring
docker-compose up -d
```

**服务地址**:
- Prometheus: [http://localhost:9090](http://localhost:9090)
- Grafana: [http://localhost:3001](http://localhost:3001) (admin/admin)

### 2. 启动 TripNARA 应用

```bash
npm run start:dev
```

### 3. 验证指标端点

```bash
# 查看 Prometheus 格式指标
curl http://localhost:3000/rag/metrics

# 查看人类可读统计
curl http://localhost:3000/rag/metrics/stats
```

### 4. 导入 Grafana Dashboard

1. 访问 [http://localhost:3001](http://localhost:3001)
2. 登录（admin/admin）
3. Dashboard 已自动加载：**TripNARA RAG Monitoring**

---

## 📈 监控指标详解

### 缓存指标 (Cache Metrics)

#### rag_cache_hits_total
- **类型**: Counter
- **标签**: cache_type (redis, memory, hybrid)
- **说明**: 缓存命中总次数
- **用途**: 计算命中率

#### rag_cache_misses_total
- **类型**: Counter
- **标签**: cache_type
- **说明**: 缓存未命中总次数

#### rag_cache_size
- **类型**: Gauge
- **标签**: cache_type
- **说明**: 当前缓存条目数量
- **告警阈值**: > 10000 (内存缓存过大)

#### rag_cache_operation_duration_ms
- **类型**: Histogram
- **标签**: cache_type, operation (get, set, del)
- **说明**: 缓存操作耗时（毫秒）
- **Buckets**: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
- **告警阈值**: P95 > 100ms

**查询示例**:
```promql
# 缓存命中率
rate(rag_cache_hits_total[5m]) / (rate(rag_cache_hits_total[5m]) + rate(rag_cache_misses_total[5m]))

# 缓存操作 P95 延迟
histogram_quantile(0.95, rate(rag_cache_operation_duration_ms_bucket[5m]))
```

---

### 重试指标 (Retry Metrics)

#### rag_retry_attempts_total
- **类型**: Counter
- **标签**: retry_type (api, db, generic)
- **说明**: 重试尝试总次数（所有尝试的累加）

#### rag_retry_success_total
- **类型**: Counter
- **标签**: retry_type
- **说明**: 重试最终成功次数

#### rag_retry_failure_total
- **类型**: Counter
- **标签**: retry_type
- **说明**: 重试最终失败次数（耗尽所有尝试）

#### rag_retry_attempts_count
- **类型**: Histogram
- **标签**: retry_type
- **说明**: 重试次数分布
- **Buckets**: [1, 2, 3, 4, 5, 10]
- **告警阈值**: 平均重试次数 > 3

**查询示例**:
```promql
# 重试成功率
rate(rag_retry_success_total[5m]) / (rate(rag_retry_success_total[5m]) + rate(rag_retry_failure_total[5m]))

# 平均重试次数
rate(rag_retry_attempts_total[5m]) / (rate(rag_retry_success_total[5m]) + rate(rag_retry_failure_total[5m]))
```

---

### 并行执行指标 (Parallel Execution Metrics)

#### rag_parallel_tasks_total
- **类型**: Counter
- **说明**: 并行任务总数

#### rag_parallel_task_success_total
- **类型**: Counter
- **说明**: 成功的并行任务数

#### rag_parallel_task_failure_total
- **类型**: Counter
- **说明**: 失败的并行任务数

#### rag_parallel_concurrency
- **类型**: Gauge
- **说明**: 当前并发任务数
- **告警阈值**: > 20 (并发度异常高)

#### rag_parallel_task_duration_ms
- **类型**: Histogram
- **说明**: 并行任务执行时间（毫秒）
- **Buckets**: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

**查询示例**:
```promql
# 并行任务成功率
rate(rag_parallel_task_success_total[5m]) / (rate(rag_parallel_task_success_total[5m]) + rate(rag_parallel_task_failure_total[5m]))

# 当前并发度
rag_parallel_concurrency
```

---

### API调用指标 (API Call Metrics)

#### rag_api_calls_total
- **类型**: Counter
- **标签**: api_type (weather, places, web_browse, other)
- **说明**: API调用总次数

#### rag_api_call_duration_ms
- **类型**: Histogram
- **标签**: api_type
- **说明**: API调用耗时（毫秒）
- **Buckets**: [100, 250, 500, 1000, 2000, 5000, 10000]
- **告警阈值**: P95 > 2000ms

#### rag_api_errors_total
- **类型**: Counter
- **标签**: api_type, error_type
- **说明**: API错误总次数

**查询示例**:
```promql
# API错误率
rate(rag_api_errors_total[5m]) / rate(rag_api_calls_total[5m])

# API P95 延迟
histogram_quantile(0.95, rate(rag_api_call_duration_ms_bucket[5m]))
```

---

### RAG查询指标 (RAG Query Metrics)

#### rag_query_total
- **类型**: Counter
- **标签**: category (WEATHER, POI_HOURS, RULES, etc.)
- **说明**: RAG查询总次数

#### rag_query_duration_ms
- **类型**: Histogram
- **标签**: category
- **说明**: RAG查询耗时（毫秒）
- **Buckets**: [50, 100, 250, 500, 1000, 2000, 5000]
- **告警阈值**: P95 > 500ms

#### rag_fallback_level_total
- **类型**: Counter
- **标签**: level (VECTOR_RAG, HYBRID_RAG, KEYWORD, WEB_BROWSE, GRACEFUL_FAILURE)
- **说明**: 各降级层级使用次数

**查询示例**:
```promql
# RAG查询 QPS
rate(rag_query_total[1m])

# 降级层级分布
rate(rag_fallback_level_total[5m])

# RAG查询 P95 延迟
histogram_quantile(0.95, rate(rag_query_duration_ms_bucket[5m]))
```

---

## 🚨 推荐告警规则

创建文件 `monitoring/alerts.yml`:

```yaml
groups:
  - name: rag_alerts
    interval: 30s
    rules:
      # 缓存命中率低
      - alert: LowCacheHitRate
        expr: |
          rate(rag_cache_hits_total[5m]) /
          (rate(rag_cache_hits_total[5m]) + rate(rag_cache_misses_total[5m])) < 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate is low ({{ $value | humanizePercentage }})"
          description: "Cache hit rate for {{ $labels.cache_type }} is below 50%"

      # API错误率高
      - alert: HighApiErrorRate
        expr: |
          rate(rag_api_errors_total[5m]) /
          rate(rag_api_calls_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API error rate is high ({{ $value | humanizePercentage }})"
          description: "{{ $labels.api_type }} API error rate is above 10%"

      # 重试失败率高
      - alert: HighRetryFailureRate
        expr: |
          rate(rag_retry_failure_total[5m]) /
          (rate(rag_retry_success_total[5m]) + rate(rag_retry_failure_total[5m])) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Retry failure rate is high"
          description: "{{ $labels.retry_type }} retry failure rate is above 20%"

      # RAG查询延迟高
      - alert: HighRagQueryLatency
        expr: |
          histogram_quantile(0.95, rate(rag_query_duration_ms_bucket[5m])) > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "RAG query P95 latency is high"
          description: "P95 latency is {{ $value }}ms (threshold: 500ms)"

      # 并发度异常高
      - alert: HighParallelConcurrency
        expr: rag_parallel_concurrency > 20
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Parallel concurrency is abnormally high"
          description: "Current concurrency: {{ $value }} (threshold: 20)"
```

---

## 📊 Grafana Dashboard 详解

Dashboard 包含以下面板：

### 第1行：缓存性能
- **Cache Hit Rate** - 各类型缓存命中率趋势
- **Cache Operations Rate** - 缓存操作速率（hits/misses per second）

### 第2行：缓存详情
- **Cache Size** - 缓存大小（条目数）
- **Cache Operation Duration (P95)** - 缓存操作延迟P95

### 第3行：重试性能
- **Retry Success Rate** - 重试成功率
- **Average Retry Attempts** - 平均重试次数

### 第4行：并行执行
- **Parallel Task Success Rate** - 并行任务成功率
- **Current Parallel Concurrency** - 当前并发度

### 第5行：API性能
- **API Call Duration (P50/P95/P99)** - API调用延迟分位数
- **API Error Rate** - API错误率

### 第6行：RAG查询
- **RAG Query Rate by Category** - 各类别查询速率
- **RAG Fallback Level Distribution** - 降级层级分布

### 第7行：RAG延迟
- **RAG Query Duration (P50/P95/P99)** - RAG查询延迟分位数

---

## 🔧 集成到代码

### 在服务中记录指标

```typescript
import { RagMetricsService } from './services/rag-metrics.service';

@Injectable()
export class YourService {
  constructor(private readonly metrics: RagMetricsService) {}

  async yourMethod() {
    const startTime = Date.now();

    try {
      // 你的业务逻辑
      const result = await someOperation();

      // 记录成功的API调用
      this.metrics.recordApiCall('weather', Date.now() - startTime, true);

      return result;
    } catch (error) {
      // 记录失败的API调用
      this.metrics.recordApiCall('weather', Date.now() - startTime, false, error.name);

      throw error;
    }
  }
}
```

### 示例：缓存操作监控

```typescript
async get(key: string) {
  const startTime = Date.now();

  const value = await this.cache.get(key);

  if (value) {
    this.metrics.recordCacheHit('redis');
  } else {
    this.metrics.recordCacheMiss('redis');
  }

  this.metrics.recordCacheOperation('redis', 'get', Date.now() - startTime);

  return value;
}
```

---

## 🧪 测试监控集成

```bash
# 运行监控测试脚本
npx tsx scripts/test-prometheus-metrics.ts

# 输出示例:
# Cache Stats: { hits: 2, misses: 1, hitRate: 0.6666666666666666 }
# Hit Rate: 66.67%
# ✅ Prometheus metrics integration working!
```

---

## 📦 生产环境部署

### 1. 修改 Prometheus 配置

编辑 `monitoring/prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'tripnara-rag'
    metrics_path: '/rag/metrics'
    static_configs:
      - targets: ['your-api-domain.com:443'] # 修改为生产域名
        labels:
          env: 'production'
```

### 2. 配置告警（可选）

启用 `monitoring/alerts.yml`，并配置 Alertmanager。

### 3. 安全加固

- 为 Grafana 设置强密码
- 启用 Prometheus 认证
- 配置 HTTPS

### 4. 数据持久化

Docker volumes 已配置：
- `prometheus-data` - Prometheus 时序数据
- `grafana-data` - Grafana dashboard 和配置

---

## 📚 相关文档

- [Prometheus 官方文档](https://prometheus.io/docs/)
- [Grafana 官方文档](https://grafana.com/docs/)
- [prom-client (Node.js)](https://github.com/siimon/prom-client)
- [Phase 5.2 性能优化文档](./RAG_PHASE5.2_PERFORMANCE_OPTIMIZATION.md)

---

## 🎯 性能目标

根据监控指标，我们的性能目标是：

| 指标 | 目标 | 告警阈值 |
|------|------|----------|
| **缓存命中率** | >= 70% | < 50% |
| **RAG查询P95延迟** | < 500ms | > 500ms |
| **API调用P95延迟** | < 2000ms | > 2000ms |
| **重试成功率** | >= 90% | < 80% |
| **并行任务成功率** | >= 95% | < 90% |
| **API错误率** | < 5% | > 10% |

---

**创建日期**: 2026-01-25
**维护者**: Claude Code
**版本**: v1.0
**状态**: ✅ 生产就绪
