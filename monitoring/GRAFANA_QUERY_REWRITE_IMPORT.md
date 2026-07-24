# Query Rewrite v1.1 Grafana Dashboard 导入

测试/预发环境有真实流量后，导入 `query-rewrite-v1.1-dashboard.json` 观察改写层健康度。

## 导入步骤

1. 登录 Grafana → **Dashboards** → **New** → **Import**
2. 上传文件：`monitoring/grafana/query-rewrite-v1.1-dashboard.json`
3. 选择 Prometheus 数据源（与 Tripnara 应用 metrics 同一实例）
4. 保存后 UID 应为 `tripnara-query-rewrite-v11`

## 重点面板（本周盯这三项）

| 面板 | PromQL 含义 | 健康预期 |
|---|---|---|
| **redis_exact 分流** | `stage1_source=rules` 且 `entity_resolution_source=redis_exact` 占比 | 别名热路径越高，Stage1 LLM Token 越省 |
| **分场景零结果率** | `tripnara_query_rewrite_zero_result_total / total` by `scene` | Hotel / POI / RAG 改写后零结果率趋向 < 15% |
| **P95 延迟** | `histogram_quantile(0.95, tripnara_query_rewrite_duration_ms_bucket)` | 横切面 P95 不应明显拖慢决策主链 |

## 配套告警

`monitoring/prometheus-alerts.yml` 中 `tripnara_query_rewrite_v1_1` 规则组：

- `QueryRewriteHighRuleFallbackRate` — 规则降级过高
- `QueryRewriteHighZeroResultRate` — 某 scene 零结果率过高

Alertmanager 路由需在测试环境确认已加载该 rules 文件。

## 环境变量（RAG 灰度）

```env
QUERY_REWRITE_RAG_EXPANSION_ENABLED=1
QDRANT_URL=http://<向量服务器>:6333
VECTOR_ER_SCORE_THRESHOLD=0.72
```

开启后 Agent Lightweight QA / CGUS RAG evidence 检索会走 `useQueryExpansion: true`。
