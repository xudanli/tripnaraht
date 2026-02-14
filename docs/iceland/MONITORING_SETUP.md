# 冰岛世界模型 - 监控配置建议

> **版本**: v1.0
> **更新时间**: 2026-02-14
> **适用场景**: 生产环境监控和告警

---

## 📊 监控架构

### 推荐技术栈

```
应用层
  ├─ NestJS (结构化日志)
  └─ Prometheus Client (指标导出)
       ↓
监控层
  ├─ Prometheus (指标存储 + 告警)
  ├─ Grafana (可视化 Dashboard)
  └─ Alertmanager (告警路由)
       ↓
通知层
  ├─ Slack (即时通知)
  ├─ Email (重要告警)
  └─ PagerDuty (紧急事件)
```

---

## 🔧 Step 1: Prometheus 集成

### 1.1 安装 Prometheus Client

```bash
pnpm add @willsoto/nestjs-prometheus prom-client
```

### 1.2 配置 Prometheus Module

创建 `src/monitoring/prometheus.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrometheusModule as NestPrometheusModule } from '@willsoto/nestjs-prometheus';
import { makeCounterProvider, makeGaugeProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

// 自定义指标
export const METRICS = {
  // Gate 评估指标
  GATE_EVALUATIONS_TOTAL: 'tripnara_gate_evaluations_total',
  GATE_EVALUATION_DURATION: 'tripnara_gate_evaluation_duration_seconds',
  GATE_RESULTS: 'tripnara_gate_results_total',

  // 天气 API 指标
  WEATHER_API_CALLS_TOTAL: 'tripnara_weather_api_calls_total',
  WEATHER_API_DURATION: 'tripnara_weather_api_duration_seconds',
  WEATHER_CACHE_HITS: 'tripnara_weather_cache_hits_total',
  WEATHER_DATA_FRESHNESS: 'tripnara_weather_data_freshness_seconds',

  // F-Road API 指标
  FROAD_API_CALLS_TOTAL: 'tripnara_froad_api_calls_total',
  FROAD_API_DURATION: 'tripnara_froad_api_duration_seconds',
  FROAD_FALLBACK_USAGE: 'tripnara_froad_fallback_usage_total',

  // 数据库指标
  DB_QUERY_DURATION: 'tripnara_db_query_duration_seconds',
  DB_CONNECTION_POOL: 'tripnara_db_connection_pool_size',

  // Cron 任务指标
  CRON_EXECUTIONS_TOTAL: 'tripnara_cron_executions_total',
  CRON_DURATION: 'tripnara_cron_duration_seconds',
  CRON_FAILURES: 'tripnara_cron_failures_total',
};

@Module({
  imports: [
    NestPrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    // Gate 评估指标
    makeCounterProvider({
      name: METRICS.GATE_EVALUATIONS_TOTAL,
      help: 'Total number of gate evaluations',
      labelNames: ['result', 'has_iceland'],
    }),
    makeHistogramProvider({
      name: METRICS.GATE_EVALUATION_DURATION,
      help: 'Duration of gate evaluations in seconds',
      labelNames: ['result'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5],
    }),
    makeCounterProvider({
      name: METRICS.GATE_RESULTS,
      help: 'Gate evaluation results by type',
      labelNames: ['result'],
    }),

    // 天气 API 指标
    makeCounterProvider({
      name: METRICS.WEATHER_API_CALLS_TOTAL,
      help: 'Total weather API calls',
      labelNames: ['region', 'status'],
    }),
    makeHistogramProvider({
      name: METRICS.WEATHER_API_DURATION,
      help: 'Weather API call duration',
      labelNames: ['region'],
      buckets: [0.1, 0.5, 1, 2, 5],
    }),
    makeCounterProvider({
      name: METRICS.WEATHER_CACHE_HITS,
      help: 'Weather cache hits',
      labelNames: ['region', 'hit'],
    }),
    makeGaugeProvider({
      name: METRICS.WEATHER_DATA_FRESHNESS,
      help: 'Weather data age in seconds',
      labelNames: ['region'],
    }),

    // F-Road API 指标
    makeCounterProvider({
      name: METRICS.FROAD_API_CALLS_TOTAL,
      help: 'Total F-Road API calls',
      labelNames: ['road', 'status'],
    }),
    makeHistogramProvider({
      name: METRICS.FROAD_API_DURATION,
      help: 'F-Road API call duration',
      labelNames: ['road'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1],
    }),
    makeCounterProvider({
      name: METRICS.FROAD_FALLBACK_USAGE,
      help: 'F-Road fallback usage count',
      labelNames: ['road'],
    }),

    // Cron 任务指标
    makeCounterProvider({
      name: METRICS.CRON_EXECUTIONS_TOTAL,
      help: 'Total cron executions',
      labelNames: ['job', 'status'],
    }),
    makeHistogramProvider({
      name: METRICS.CRON_DURATION,
      help: 'Cron job duration in seconds',
      labelNames: ['job'],
      buckets: [1, 5, 10, 30, 60],
    }),
    makeCounterProvider({
      name: METRICS.CRON_FAILURES,
      help: 'Cron job failures',
      labelNames: ['job', 'error_type'],
    }),
  ],
  exports: [NestPrometheusModule],
})
export class PrometheusModule {}
```

### 1.3 在 AppModule 中注册

```typescript
// src/app.module.ts
import { PrometheusModule } from './monitoring/prometheus.module';

@Module({
  imports: [
    // ... 其他模块
    PrometheusModule,
  ],
})
export class AppModule {}
```

### 1.4 在服务中使用指标

示例: `IcelandWeatherRealtimeService`

```typescript
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';
import { METRICS } from '../../monitoring/prometheus.module';

@Injectable()
export class IcelandWeatherRealtimeService {
  constructor(
    @InjectMetric(METRICS.WEATHER_API_CALLS_TOTAL) private readonly apiCallsCounter: Counter<string>,
    @InjectMetric(METRICS.WEATHER_API_DURATION) private readonly apiDurationHistogram: Histogram<string>,
    @InjectMetric(METRICS.WEATHER_CACHE_HITS) private readonly cacheHitsCounter: Counter<string>,
    @InjectMetric(METRICS.WEATHER_DATA_FRESHNESS) private readonly dataFreshnessGauge: Gauge<string>,
  ) {}

  async getWeatherByLocation(lat: number, lng: number): Promise<WeatherForecast | null> {
    const startTime = Date.now();
    const region = this.getRegionKey(lat, lng);

    try {
      // 检查缓存
      const cached = await this.getCachedWeather(region);
      if (cached) {
        this.cacheHitsCounter.inc({ region, hit: 'true' });
        this.dataFreshnessGauge.set({ region }, (Date.now() - cached.createdAt.getTime()) / 1000);
        return cached;
      }

      this.cacheHitsCounter.inc({ region, hit: 'false' });

      // API 调用
      const weather = await this.fetchFromAPI(lat, lng);
      this.apiCallsCounter.inc({ region, status: 'success' });

      return weather;
    } catch (error) {
      this.apiCallsCounter.inc({ region, status: 'error' });
      throw error;
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      this.apiDurationHistogram.observe({ region }, duration);
    }
  }
}
```

### 1.5 暴露 Metrics 端点

Prometheus 模块会自动在 `/metrics` 端点暴露指标:

```bash
curl http://localhost:3000/metrics
```

---

## 📈 Step 2: Prometheus 服务器配置

### 2.1 安装 Prometheus

```bash
# Ubuntu/Debian
sudo apt-get install prometheus

# Docker (推荐)
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

### 2.2 配置 Prometheus

创建 `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

# Alertmanager 配置
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

# 告警规则文件
rule_files:
  - 'alerts.yml'

# 抓取配置
scrape_configs:
  # TripNARA 应用
  - job_name: 'tripnara-iceland'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  # PostgreSQL Exporter (可选)
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']

  # Node Exporter (系统指标)
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### 2.3 配置告警规则

创建 `alerts.yml`:

```yaml
groups:
  # 数据新鲜度告警
  - name: data_freshness
    interval: 5m
    rules:
      - alert: WeatherDataStale
        expr: tripnara_weather_data_freshness_seconds > 43200  # 12 小时
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Weather data is stale for region {{ $labels.region }}"
          description: "Weather data for {{ $labels.region }} is {{ $value }}s old (> 12 hours)"

      - alert: WeatherDataVeryStale
        expr: tripnara_weather_data_freshness_seconds > 86400  # 24 小时
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Weather data is very stale for region {{ $labels.region }}"
          description: "Weather data for {{ $labels.region }} is {{ $value }}s old (> 24 hours)"

  # API 错误率告警
  - name: api_errors
    interval: 1m
    rules:
      - alert: HighWeatherAPIErrorRate
        expr: |
          sum(rate(tripnara_weather_api_calls_total{status="error"}[5m]))
          /
          sum(rate(tripnara_weather_api_calls_total[5m]))
          > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High weather API error rate"
          description: "Weather API error rate is {{ $value | humanizePercentage }} (> 10%)"

      - alert: HighFRoadAPIErrorRate
        expr: |
          sum(rate(tripnara_froad_api_calls_total{status="error"}[5m]))
          /
          sum(rate(tripnara_froad_api_calls_total[5m]))
          > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High F-Road API error rate"
          description: "F-Road API error rate is {{ $value | humanizePercentage }} (> 20%)"

  # 性能告警
  - name: performance
    interval: 1m
    rules:
      - alert: SlowGateEvaluation
        expr: |
          histogram_quantile(0.95,
            rate(tripnara_gate_evaluation_duration_seconds_bucket[5m])
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow gate evaluations (P95 > 1s)"
          description: "95th percentile gate evaluation time is {{ $value }}s"

      - alert: VerySlowGateEvaluation
        expr: |
          histogram_quantile(0.95,
            rate(tripnara_gate_evaluation_duration_seconds_bucket[5m])
          ) > 3.0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Very slow gate evaluations (P95 > 3s)"
          description: "95th percentile gate evaluation time is {{ $value }}s"

  # Cron 任务告警
  - name: cron_jobs
    interval: 5m
    rules:
      - alert: CronJobFailure
        expr: increase(tripnara_cron_failures_total[10m]) > 0
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Cron job {{ $labels.job }} failed"
          description: "Cron job {{ $labels.job }} has failed {{ $value }} times in the last 10 minutes"

      - alert: CronJobNotRunning
        expr: |
          time() - max(tripnara_cron_executions_total) > 21600  # 6 小时
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Cron jobs not running"
          description: "No cron job executions in the last 6 hours"

  # 缓存性能告警
  - name: cache_performance
    interval: 5m
    rules:
      - alert: LowCacheHitRate
        expr: |
          sum(rate(tripnara_weather_cache_hits_total{hit="true"}[10m]))
          /
          sum(rate(tripnara_weather_cache_hits_total[10m]))
          < 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low weather cache hit rate"
          description: "Weather cache hit rate is {{ $value | humanizePercentage }} (< 80%)"
```

---

## 📊 Step 3: Grafana Dashboard

### 3.1 安装 Grafana

```bash
# Ubuntu/Debian
sudo apt-get install grafana

# Docker (推荐)
docker run -d \
  --name grafana \
  -p 3001:3000 \
  -v grafana-storage:/var/lib/grafana \
  grafana/grafana
```

访问: `http://localhost:3001` (默认 admin/admin)

### 3.2 添加 Prometheus 数据源

1. Settings → Data Sources → Add data source
2. 选择 "Prometheus"
3. URL: `http://prometheus:9090` (Docker) 或 `http://localhost:9090`
4. Save & Test

### 3.3 导入 Dashboard JSON

创建 `grafana-dashboard.json`:

```json
{
  "dashboard": {
    "title": "TripNARA Iceland World Model",
    "tags": ["tripnara", "iceland"],
    "timezone": "UTC",
    "panels": [
      {
        "title": "Gate Evaluations (Rate)",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
        "targets": [
          {
            "expr": "sum(rate(tripnara_gate_evaluations_total[5m])) by (result)",
            "legendFormat": "{{ result }}"
          }
        ]
      },
      {
        "title": "Gate Evaluation P95 Duration",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(tripnara_gate_evaluation_duration_seconds_bucket[5m]))",
            "legendFormat": "P95"
          }
        ]
      },
      {
        "title": "Weather Cache Hit Rate",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
        "targets": [
          {
            "expr": "sum(rate(tripnara_weather_cache_hits_total{hit=\"true\"}[5m])) / sum(rate(tripnara_weather_cache_hits_total[5m]))",
            "legendFormat": "Hit Rate"
          }
        ]
      },
      {
        "title": "Weather Data Freshness",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
        "targets": [
          {
            "expr": "tripnara_weather_data_freshness_seconds / 3600",
            "legendFormat": "{{ region }} (hours)"
          }
        ]
      },
      {
        "title": "API Error Rates",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 16 },
        "targets": [
          {
            "expr": "sum(rate(tripnara_weather_api_calls_total{status=\"error\"}[5m])) / sum(rate(tripnara_weather_api_calls_total[5m]))",
            "legendFormat": "Weather API"
          },
          {
            "expr": "sum(rate(tripnara_froad_api_calls_total{status=\"error\"}[5m])) / sum(rate(tripnara_froad_api_calls_total[5m]))",
            "legendFormat": "F-Road API"
          }
        ]
      },
      {
        "title": "Cron Job Executions",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 16 },
        "targets": [
          {
            "expr": "sum(rate(tripnara_cron_executions_total[10m])) by (job)",
            "legendFormat": "{{ job }}"
          }
        ]
      }
    ]
  }
}
```

导入:
1. Dashboards → Import
2. 上传 JSON 文件或粘贴内容
3. 选择 Prometheus 数据源
4. Import

---

## 🚨 Step 4: Alertmanager 配置

### 4.1 安装 Alertmanager

```bash
# Docker
docker run -d \
  --name alertmanager \
  -p 9093:9093 \
  -v $(pwd)/alertmanager.yml:/etc/alertmanager/alertmanager.yml \
  prom/alertmanager
```

### 4.2 配置 Alertmanager

创建 `alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

# 路由规则
route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack-notifications'
  routes:
    # 关键告警立即通知
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      repeat_interval: 1h

    # 警告级别使用 Slack
    - match:
        severity: warning
      receiver: 'slack-notifications'

# 接收器配置
receivers:
  # Slack 通知
  - name: 'slack-notifications'
    slack_configs:
      - channel: '#tripnara-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true

  # PagerDuty (关键告警)
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        description: '{{ .GroupLabels.alertname }}'

  # Email 通知
  - name: 'email-notifications'
    email_configs:
      - to: 'ops@your-company.com'
        from: 'alertmanager@your-company.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'your-email@gmail.com'
        auth_password: 'your-app-password'
        headers:
          Subject: '[TripNARA] {{ .GroupLabels.alertname }}'

# 抑制规则
inhibit_rules:
  # 如果有 critical 告警，抑制同组的 warning
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']
```

---

## 📋 Step 5: 日志聚合 (可选)

### 5.1 ELK Stack 配置

```yaml
# docker-compose.yml
version: '3.8'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.6.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - 9200:9200

  logstash:
    image: docker.elastic.co/logstash/logstash:8.6.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    ports:
      - 5044:5044

  kibana:
    image: docker.elastic.co/kibana/kibana:8.6.0
    ports:
      - 5601:5601
    depends_on:
      - elasticsearch
```

### 5.2 Logstash 配置

```
# logstash.conf
input {
  file {
    path => "/var/log/tripnara/*.log"
    start_position => "beginning"
    codec => json
  }
}

filter {
  # 解析 NestJS 日志
  if [message] =~ /^\[Nest\]/ {
    grok {
      match => { "message" => "\[Nest\] %{NUMBER:pid} - %{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} \[%{DATA:context}\] %{GREEDYDATA:log_message}" }
    }
  }

  # 提取 request_id
  if [log_message] =~ /request_id/ {
    grok {
      match => { "log_message" => "request_id=%{DATA:request_id}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "tripnara-logs-%{+YYYY.MM.dd}"
  }
}
```

---

## ✅ 监控检查清单

### 部署后验证

- [ ] **Prometheus 正在抓取指标** (`http://localhost:9090/targets`)
- [ ] **Grafana Dashboard 显示数据**
- [ ] **Alertmanager 可访问** (`http://localhost:9093`)
- [ ] **告警规则已加载** (Prometheus → Alerts)
- [ ] **测试告警发送** (触发一个测试告警)

### 关键指标验证

```bash
# 检查指标是否暴露
curl http://localhost:3000/metrics | grep tripnara_gate_evaluations_total

# 查询 Prometheus
curl 'http://localhost:9090/api/v1/query?query=tripnara_gate_evaluations_total'
```

---

## 📊 推荐监控指标

### 关键业务指标
1. **Gate 评估成功率**: `tripnara_gate_evaluations_total{result="ALLOW"}`
2. **平均评估时间**: `rate(tripnara_gate_evaluation_duration_seconds_sum[5m]) / rate(tripnara_gate_evaluation_duration_seconds_count[5m])`
3. **天气告警触发率**: `rate(tripnara_gate_results_total{result="BLOCK"}[5m])`

### 数据质量指标
1. **天气数据新鲜度**: `tripnara_weather_data_freshness_seconds`
2. **缓存命中率**: `rate(tripnara_weather_cache_hits_total{hit="true"}[5m])`
3. **API 成功率**: `1 - (rate(tripnara_weather_api_calls_total{status="error"}[5m]) / rate(tripnara_weather_api_calls_total[5m]))`

### 性能指标
1. **P95 Gate 延迟**: `histogram_quantile(0.95, rate(tripnara_gate_evaluation_duration_seconds_bucket[5m]))`
2. **P99 API 延迟**: `histogram_quantile(0.99, rate(tripnara_weather_api_duration_seconds_bucket[5m]))`

---

**最后更新**: 2026-02-14
**版本**: v1.0
