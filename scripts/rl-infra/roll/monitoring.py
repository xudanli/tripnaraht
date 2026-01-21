"""
ROLL 监控和观测模块

职责:
- 收集 Workers 指标
- 集成 Ray Dashboard
- 统一 metrics/tracing
"""
import time
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from collections import defaultdict
import ray
from fastapi import FastAPI
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from prometheus_client.openmetrics.exposition import CONTENT_TYPE_LATEST

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus 指标
request_count = Counter(
    'roll_requests_total',
    'Total requests',
    ['worker_type', 'endpoint', 'status']
)

request_latency = Histogram(
    'roll_request_latency_seconds',
    'Request latency',
    ['worker_type', 'endpoint']
)

worker_health = Gauge(
    'roll_worker_health',
    'Worker health status',
    ['worker_type', 'worker_id']
)

active_workers = Gauge(
    'roll_active_workers',
    'Number of active workers',
    ['worker_type']
)


class RollMetricsCollector:
    """
    ROLL 指标收集器
    """
    
    def __init__(self):
        self.metrics = {
            'requests': defaultdict(int),
            'latencies': defaultdict(list),
            'errors': defaultdict(int),
            'worker_status': defaultdict(dict),
        }
        self.start_time = time.time()
    
    def record_request(
        self,
        worker_type: str,
        endpoint: str,
        status: str,
        latency: float
    ):
        """记录请求指标"""
        request_count.labels(
            worker_type=worker_type,
            endpoint=endpoint,
            status=status
        ).inc()
        
        request_latency.labels(
            worker_type=worker_type,
            endpoint=endpoint
        ).observe(latency)
        
        # 内部指标
        key = f"{worker_type}:{endpoint}"
        self.metrics['requests'][key] += 1
        self.metrics['latencies'][key].append(latency)
        if status != 'success':
            self.metrics['errors'][key] += 1
    
    def update_worker_health(
        self,
        worker_type: str,
        worker_id: str,
        is_healthy: bool
    ):
        """更新 Worker 健康状态"""
        worker_health.labels(
            worker_type=worker_type,
            worker_id=worker_id
        ).set(1 if is_healthy else 0)
        
        self.metrics['worker_status'][worker_type][worker_id] = {
            'healthy': is_healthy,
            'timestamp': datetime.now().isoformat()
        }
    
    def update_active_workers(
        self,
        worker_type: str,
        count: int
    ):
        """更新活跃 Workers 数量"""
        active_workers.labels(worker_type=worker_type).set(count)
    
    def get_summary(self) -> Dict[str, Any]:
        """获取指标摘要"""
        uptime = time.time() - self.start_time
        
        # 计算平均延迟
        avg_latencies = {}
        for key, latencies in self.metrics['latencies'].items():
            if latencies:
                avg_latencies[key] = sum(latencies) / len(latencies)
        
        # 计算错误率
        error_rates = {}
        for key in self.metrics['requests']:
            total = self.metrics['requests'][key]
            errors = self.metrics['errors'].get(key, 0)
            error_rates[key] = errors / total if total > 0 else 0
        
        return {
            'uptime_seconds': uptime,
            'total_requests': sum(self.metrics['requests'].values()),
            'average_latencies': avg_latencies,
            'error_rates': error_rates,
            'worker_status': dict(self.metrics['worker_status']),
        }


# 全局指标收集器
metrics_collector = RollMetricsCollector()


def setup_monitoring(app: FastAPI):
    """
    设置监控中间件
    """
    
    @app.middleware("http")
    async def metrics_middleware(request, call_next):
        """指标收集中间件"""
        start_time = time.time()
        
        # 提取 Worker 类型和端点
        path = request.url.path
        worker_type = 'unknown'
        endpoint = path
        
        if '/api/actor/' in path:
            worker_type = 'actor'
        elif '/api/reward/' in path:
            worker_type = 'reward'
        elif '/api/policy/' in path:
            worker_type = 'policy'
        elif '/api/training/' in path:
            worker_type = 'training'
        
        # 处理请求
        try:
            response = await call_next(request)
            status = 'success' if response.status_code < 400 else 'error'
        except Exception as e:
            status = 'error'
            raise
        finally:
            latency = time.time() - start_time
            metrics_collector.record_request(
                worker_type=worker_type,
                endpoint=endpoint,
                status=status,
                latency=latency
            )
        
        return response
    
    @app.get("/metrics")
    async def metrics_endpoint():
        """Prometheus 指标端点"""
        from fastapi.responses import Response
        return Response(
            content=generate_latest(),
            media_type=CONTENT_TYPE_LATEST
        )
    
    @app.get("/api/metrics/summary")
    async def metrics_summary():
        """指标摘要端点"""
        return metrics_collector.get_summary()


def get_ray_dashboard_url() -> str:
    """获取 Ray Dashboard URL"""
    try:
        # 从 Ray 获取 Dashboard 地址
        dashboard_url = ray.get_runtime_context().dashboard_url
        return dashboard_url or "http://localhost:8265"
    except:
        return "http://localhost:8265"


def integrate_ray_metrics() -> Dict[str, Any]:
    """
    集成 Ray 指标
    """
    try:
        # 获取 Ray 集群信息
        nodes = ray.nodes()
        cluster_resources = ray.cluster_resources()
        available_resources = ray.available_resources()
        
        return {
            'ray_cluster': {
                'nodes': len(nodes),
                'total_resources': cluster_resources,
                'available_resources': available_resources,
                'dashboard_url': get_ray_dashboard_url(),
            }
        }
    except Exception as e:
        logger.warning(f"无法获取 Ray 指标: {e}")
        return {
            'ray_cluster': {
                'error': str(e)
            }
        }


if __name__ == "__main__":
    # 测试监控模块
    collector = RollMetricsCollector()
    
    # 模拟请求
    collector.record_request('actor', '/api/actor/generate-trajectory', 'success', 0.1)
    collector.record_request('reward', '/api/reward/compute', 'success', 0.05)
    collector.record_request('policy', '/api/policy/predict', 'error', 0.2)
    
    # 更新 Worker 状态
    collector.update_worker_health('actor', 'actor-0', True)
    collector.update_worker_health('actor', 'actor-1', True)
    collector.update_active_workers('actor', 2)
    
    # 获取摘要
    summary = collector.get_summary()
    print("指标摘要:")
    import json
    print(json.dumps(summary, indent=2))
