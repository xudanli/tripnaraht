"""
ROLL Bridge Service: Python HTTP API 桥接服务

职责:
- 提供 HTTP API 接口供 TypeScript 调用
- 封装 Ray Worker 调用
- 管理 Worker 连接和负载均衡
"""
import os
import asyncio
import logging
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
import ray
import time
from config import (
    RAY_ADDRESS,
    RAY_NAMESPACE,
    ACTOR_WORKER_NUM,
    REWARD_WORKER_NUM,
    POLICY_WORKER_NUM,
    ACTOR_WORKER_CPU,
    ACTOR_WORKER_MEMORY,
    REWARD_WORKER_CPU,
    REWARD_WORKER_MEMORY,
    POLICY_WORKER_CPU,
    POLICY_WORKER_MEMORY,
    TRAINING_WORKER_CPU,
    TRAINING_WORKER_MEMORY,
    ACTOR_WORKER_GPU,
    REWARD_WORKER_GPU,
    POLICY_WORKER_GPU,
    TRAINING_WORKER_GPU,
    LOG_LEVEL,
)

logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)

# 初始化 Ray
try:
    ray.init(address=RAY_ADDRESS, namespace=RAY_NAMESPACE, ignore_reinit_error=True)
    logger.info(f"[Bridge] Ray 初始化成功: {RAY_ADDRESS}")
except Exception as e:
    logger.warning(f"[Bridge] Ray 初始化失败，使用本地模式: {e}")
    ray.init(ignore_reinit_error=True)

# 导入 Workers
from actor_worker import ActorWorker
from reward_worker import RewardWorker
from policy_worker import PolicyWorker
from training_pipeline import TrainingPipelineWorker

# FastAPI 应用
app = FastAPI(
    title="ROLL Bridge Service",
    description="TypeScript → Ray Workers 桥接服务",
    version="1.0.0",
)

# 导入监控模块
try:
    from monitoring import setup_monitoring, metrics_collector, integrate_ray_metrics
    monitoring_enabled = True
except ImportError:
    logger.warn("监控模块未安装，跳过监控设置")
    monitoring_enabled = False

# 导入追踪模块
try:
    from tracing import tracing, SpanContext
    tracing_enabled = True
except ImportError:
    logger.warn("追踪模块未安装，跳过追踪设置")
    tracing_enabled = False
    tracing = None

# 设置监控
if monitoring_enabled:
    setup_monitoring(app)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 追踪中间件
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

if tracing_enabled:
    @app.middleware("http")
    async def tracing_middleware(request: Request, call_next):
        """追踪中间件：提取和传播追踪上下文"""
        # 提取追踪上下文
        traceparent = request.headers.get("traceparent") or request.headers.get("Traceparent")
        parent_context = None
        
        if traceparent and tracing:
            parent_context = tracing.from_w3c_trace_context(traceparent)
        
        # 开始新的 Span
        span_context = tracing.start_span(
            f"http.{request.method.lower()}.{request.url.path}",
            parent_context,
            {
                "http.method": request.method,
                "http.url": str(request.url),
                "http.route": request.url.path,
            }
        ) if tracing else None
        
        try:
            # 处理请求
            response = await call_next(request)
            
            # 结束 Span（成功）
            if span_context:
                tracing.end_span(
                    span_context.span_id,
                    "ok",
                    None,
                    {
                        "http.status_code": response.status_code,
                    }
                )
            
            # 注入追踪上下文到响应头
            if span_context:
                traceparent_header = tracing.to_w3c_trace_context(span_context)
                response.headers["traceparent"] = traceparent_header
            
            return response
        except Exception as e:
            # 结束 Span（错误）
            if span_context:
                tracing.end_span(
                    span_context.span_id,
                    "error",
                    {"message": str(e)},
                )
            raise

# Worker 池管理
actor_workers: List[ray.ObjectRef] = []
reward_workers: List[ray.ObjectRef] = []
policy_workers: List[ray.ObjectRef] = []
training_workers: List[ray.ObjectRef] = []
current_actor_index = 0
current_reward_index = 0
current_policy_index = 0
current_training_index = 0


def get_next_policy_worker() -> ray.ObjectRef:
    """获取下一个 Policy-Worker (轮询负载均衡)"""
    global current_policy_index
    if not policy_workers:
        raise HTTPException(status_code=503, detail="No Policy-Workers available")
    worker = policy_workers[current_policy_index]
    current_policy_index = (current_policy_index + 1) % len(policy_workers)
    return worker


def get_training_worker() -> ray.ObjectRef:
    """获取 Training Pipeline Worker（通常只有一个）"""
    if not training_workers:
        raise HTTPException(status_code=503, detail="No Training-Workers available")
    return training_workers[0]  # 通常只有一个


def init_workers():
    """初始化 Worker 池（带资源配置）"""
    global actor_workers, reward_workers, policy_workers, training_workers
    
    logger.info("[Bridge] 初始化 Worker 池（带资源配置）...")
    
    # 创建 Actor-Workers（带资源配置）
    for i in range(ACTOR_WORKER_NUM):
        resources = {
            "num_cpus": ACTOR_WORKER_CPU,
            "memory": ACTOR_WORKER_MEMORY * 1024 * 1024,  # 转换为字节
        }
        if ACTOR_WORKER_GPU > 0:
            resources["num_gpus"] = ACTOR_WORKER_GPU
        
        worker = ActorWorker.options(**resources).remote(worker_id=f"actor-{i}")
        actor_workers.append(worker)
        logger.info(
            f"[Bridge] 创建 Actor-Worker-{i} (CPU={ACTOR_WORKER_CPU}, Memory={ACTOR_WORKER_MEMORY}MB, GPU={ACTOR_WORKER_GPU})"
        )
    
    # 创建 Reward-Workers（带资源配置）
    for i in range(REWARD_WORKER_NUM):
        resources = {
            "num_cpus": REWARD_WORKER_CPU,
            "memory": REWARD_WORKER_MEMORY * 1024 * 1024,
        }
        if REWARD_WORKER_GPU > 0:
            resources["num_gpus"] = REWARD_WORKER_GPU
        
        worker = RewardWorker.options(**resources).remote(worker_id=f"reward-{i}")
        reward_workers.append(worker)
        logger.info(
            f"[Bridge] 创建 Reward-Worker-{i} (CPU={REWARD_WORKER_CPU}, Memory={REWARD_WORKER_MEMORY}MB, GPU={REWARD_WORKER_GPU})"
        )
    
    # 创建 Policy-Workers（带资源配置）
    for i in range(POLICY_WORKER_NUM):
        resources = {
            "num_cpus": POLICY_WORKER_CPU,
            "memory": POLICY_WORKER_MEMORY * 1024 * 1024,
        }
        if POLICY_WORKER_GPU > 0:
            resources["num_gpus"] = POLICY_WORKER_GPU
        
        worker = PolicyWorker.options(**resources).remote(worker_id=f"policy-{i}")
        policy_workers.append(worker)
        logger.info(
            f"[Bridge] 创建 Policy-Worker-{i} (CPU={POLICY_WORKER_CPU}, Memory={POLICY_WORKER_MEMORY}MB, GPU={POLICY_WORKER_GPU})"
        )
    
    # 创建 Training Pipeline Workers（带资源配置）
    resources = {
        "num_cpus": TRAINING_WORKER_CPU,
        "memory": TRAINING_WORKER_MEMORY * 1024 * 1024,
    }
    if TRAINING_WORKER_GPU > 0:
        resources["num_gpus"] = TRAINING_WORKER_GPU
    
    training_worker = TrainingPipelineWorker.options(**resources).remote(worker_id="training-0")
    training_workers.append(training_worker)
    logger.info(
        f"[Bridge] 创建 TrainingPipeline-Worker-0 (CPU={TRAINING_WORKER_CPU}, Memory={TRAINING_WORKER_MEMORY}MB, GPU={TRAINING_WORKER_GPU})"
    )
    
    logger.info(
        f"[Bridge] Worker 池初始化完成: "
        f"{len(actor_workers)} actors, {len(reward_workers)} rewards, "
        f"{len(policy_workers)} policies, {len(training_workers)} training"
    )


def get_next_actor_worker() -> ray.ObjectRef:
    """获取下一个 Actor-Worker (轮询负载均衡)"""
    global current_actor_index
    if not actor_workers:
        raise HTTPException(status_code=503, detail="No Actor-Workers available")
    worker = actor_workers[current_actor_index]
    current_actor_index = (current_actor_index + 1) % len(actor_workers)
    return worker


def get_next_reward_worker() -> ray.ObjectRef:
    """获取下一个 Reward-Worker (轮询负载均衡)"""
    global current_reward_index
    if not reward_workers:
        raise HTTPException(status_code=503, detail="No Reward-Workers available")
    worker = reward_workers[current_reward_index]
    current_reward_index = (current_reward_index + 1) % len(reward_workers)
    return worker


# 启动时初始化 Workers
@app.on_event("startup")
async def startup_event():
    init_workers()


# Pydantic 模型
class ActorRequest(BaseModel):
    request_id: str
    user_request: str
    state: Optional[Dict[str, Any]] = {}
    action: str
    params: Dict[str, Any]
    timestamp: Optional[str] = None


class RewardRequest(BaseModel):
    trajectory_ref: Optional[str] = None  # Ray ObjectRef ID (序列化)
    trajectory: Optional[Dict[str, Any]] = None  # 直接传入轨迹数据
    reward_config: Optional[Dict[str, Any]] = None


class PolicyRequest(BaseModel):
    user_request: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    constraints: Optional[Dict[str, Any]] = {}
    preferences: Optional[Dict[str, Any]] = {}


class TrainingRequest(BaseModel):
    job_id: str
    model_type: str
    base_model: str
    training_data: List[Dict[str, Any]]
    hyperparameters: Optional[Dict[str, Any]] = {}


# API 端点
@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "ray_connected": ray.is_initialized(),
        "workers": {
            "actor": len(actor_workers),
            "reward": len(reward_workers),
            "policy": len(policy_workers),
            "training": len(training_workers),
        },
    }


@app.post("/api/actor/generate-trajectory")
async def generate_trajectory(request: ActorRequest, http_request: Request):
    """
    调用 Actor-Worker 生成轨迹
    """
    start_time = time.time()
    
    # 开始追踪 Span（Worker 调用）
    worker_span = None
    if tracing_enabled and tracing:
        # 从请求中提取追踪上下文（由中间件处理）
        worker_span = tracing.start_span(
            "actor.generate_trajectory",
            None,  # 中间件已经创建了 HTTP Span
            {
                "worker.type": "actor",
                "request_id": request.request_id,
            }
        )
    
    try:
        worker = get_next_actor_worker()
        
        # 构建请求
        ray_request = {
            "request_id": request.request_id,
            "user_request": request.user_request,
            "state": request.state or {},
            "action": request.action,
            "params": request.params,
            "timestamp": request.timestamp,
        }
        
        # 调用 Worker
        result = await worker.generate_trajectory.remote(ray_request)
        
        # 处理结果
        if isinstance(result, dict) and result.get("success"):
            # 序列化 Ray ObjectRef
            trajectory_ref = result.get("trajectory_ref")
            if trajectory_ref:
                # 将 ObjectRef 转换为可序列化的 ID
                result["trajectory_ref_id"] = str(trajectory_ref)
            
            # 记录指标
            if monitoring_enabled:
                latency = time.time() - start_time
                metrics_collector.record_request(
                    'actor',
                    '/api/actor/generate-trajectory',
                    'success',
                    latency
                )
            
            # 结束追踪 Span（成功）
            if worker_span:
                tracing.end_span(
                    worker_span.span_id,
                    "ok",
                    None,
                    {
                        "trajectory_id": result.get("trajectory_id"),
                    }
                )
            
            return {
                "success": True,
                "trajectory_id": result.get("trajectory_id"),
                "trajectory_ref_id": result.get("trajectory_ref_id"),
                "trajectory": result.get("trajectory"),
            }
        else:
            # 记录错误
            if monitoring_enabled:
                latency = time.time() - start_time
                metrics_collector.record_request(
                    'actor',
                    '/api/actor/generate-trajectory',
                    'error',
                    latency
                )
            
            # 结束追踪 Span（错误）
            if worker_span:
                tracing.end_span(
                    worker_span.span_id,
                    "error",
                    {"message": result.get("error", "Unknown error")},
                )
            
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Unknown error"),
            )
            
    except Exception as e:
        # 记录错误
        if monitoring_enabled:
            latency = time.time() - start_time
            metrics_collector.record_request(
                'actor',
                '/api/actor/generate-trajectory',
                'error',
                latency
            )
        
        # 结束追踪 Span（异常）
        if worker_span:
            tracing.end_span(
                worker_span.span_id,
                "error",
                {"message": str(e)},
            )
        
        logger.error(f"[Bridge] Actor-Worker 调用失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reward/compute")
async def compute_reward(request: RewardRequest):
    """
    调用 Reward-Worker 计算奖励
    """
    try:
        worker = get_next_reward_worker()
        
        # 处理轨迹数据
        trajectory_input = None
        if request.trajectory_ref:
            # TODO: 从 Ray Object Store 获取轨迹（需要 ObjectRef ID）
            # 当前简化处理：如果提供了 trajectory，直接使用
            raise HTTPException(
                status_code=501,
                detail="trajectory_ref 暂不支持，请使用 trajectory 字段",
            )
        elif request.trajectory:
            trajectory_input = request.trajectory
        else:
            raise HTTPException(
                status_code=400,
                detail="必须提供 trajectory_ref 或 trajectory",
            )
        
        # 调用 Worker
        result = await worker.compute_reward.remote(
            trajectory_input,
            request.reward_config,
        )
        
        if isinstance(result, dict) and result.get("success"):
            return {
                "success": True,
                "reward": result.get("reward"),
                "raw_reward": result.get("raw_reward"),
                "reward_breakdown": result.get("reward_breakdown"),
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Unknown error"),
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] Reward-Worker 调用失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/policy/predict")
async def predict_policy(request: PolicyRequest):
    """
    调用 Policy-Worker 进行策略推理
    """
    try:
        worker = get_next_policy_worker()
        
        # 构建状态
        state = {
            "user_request": request.user_request,
            "origin": request.origin,
            "destination": request.destination,
            "constraints": request.constraints or {},
            "preferences": request.preferences or {},
        }
        
        # 调用 Worker
        result = await worker.predict.remote(state)
        
        if isinstance(result, dict) and result.get("success"):
            return {
                "success": True,
                "action": result.get("action"),
                "confidence": result.get("confidence"),
                "reasoning": result.get("reasoning"),
                "adjusted_params": result.get("adjusted_params"),
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Unknown error"),
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] Policy-Worker 调用失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/training/start")
async def start_training(request: TrainingRequest):
    """
    启动训练任务
    """
    try:
        worker = get_training_worker()
        
        # 构建训练配置
        config = {
            "job_id": request.job_id,
            "model_type": request.model_type,
            "base_model": request.base_model,
            "training_data": request.training_data,
            "hyperparameters": request.hyperparameters or {},
        }
        
        # 调用 Worker
        result = await worker.start_training.remote(config)
        
        if isinstance(result, dict) and result.get("success"):
            return {
                "success": True,
                "ray_job_id": result.get("ray_job_id"),
                "mlflow_run_id": result.get("mlflow_run_id"),
                "status": result.get("status"),
                "backend": result.get("backend"),
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Unknown error"),
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] Training Pipeline 调用失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/training/status/{ray_job_id}")
async def get_training_status(ray_job_id: str):
    """
    获取训练任务状态
    """
    try:
        worker = get_training_worker()
        result = await worker.get_training_status.remote(ray_job_id)
        
        if isinstance(result, dict) and result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Unknown error"),
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 查询训练状态失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/training/cancel/{ray_job_id}")
async def cancel_training(ray_job_id: str):
    """
    取消训练任务
    """
    try:
        worker = get_training_worker()
        result = await worker.cancel_training.remote(ray_job_id)
        
        if isinstance(result, dict) and result.get("success"):
            return result
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Unknown error"),
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 取消训练任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/workers/status")
async def get_workers_status():
    """获取 Workers 状态"""
    status = {
        "actor_workers": [],
        "reward_workers": [],
        "policy_workers": [],
        "training_workers": [],
    }
    
    # 检查 Actor-Workers
    healthy_count = 0
    for i, worker in enumerate(actor_workers):
        try:
            health = await worker.health_check.remote()
            is_healthy = health.get("status") == "healthy"
            if is_healthy:
                healthy_count += 1
            
            status["actor_workers"].append({
                "id": i,
                "status": health.get("status", "unknown"),
            })
            
            # 更新监控指标
            if monitoring_enabled:
                metrics_collector.update_worker_health('actor', f'actor-{i}', is_healthy)
        except Exception as e:
            status["actor_workers"].append({
                "id": i,
                "status": "error",
                "error": str(e),
            })
            if monitoring_enabled:
                metrics_collector.update_worker_health('actor', f'actor-{i}', False)
    
    if monitoring_enabled:
        metrics_collector.update_active_workers('actor', healthy_count)
    
    # 检查 Reward-Workers
    healthy_count = 0
    for i, worker in enumerate(reward_workers):
        try:
            health = await worker.health_check.remote()
            is_healthy = health.get("status") == "healthy"
            if is_healthy:
                healthy_count += 1
            
            status["reward_workers"].append({
                "id": i,
                "status": health.get("status", "unknown"),
            })
            
            if monitoring_enabled:
                metrics_collector.update_worker_health('reward', f'reward-{i}', is_healthy)
        except Exception as e:
            status["reward_workers"].append({
                "id": i,
                "status": "error",
                "error": str(e),
            })
            if monitoring_enabled:
                metrics_collector.update_worker_health('reward', f'reward-{i}', False)
    
    if monitoring_enabled:
        metrics_collector.update_active_workers('reward', healthy_count)
    
    # 检查 Policy-Workers
    healthy_count = 0
    for i, worker in enumerate(policy_workers):
        try:
            health = await worker.health_check.remote()
            is_healthy = health.get("status") == "healthy"
            if is_healthy:
                healthy_count += 1
            
            status["policy_workers"].append({
                "id": i,
                "status": health.get("status", "unknown"),
            })
            
            if monitoring_enabled:
                metrics_collector.update_worker_health('policy', f'policy-{i}', is_healthy)
        except Exception as e:
            status["policy_workers"].append({
                "id": i,
                "status": "error",
                "error": str(e),
            })
            if monitoring_enabled:
                metrics_collector.update_worker_health('policy', f'policy-{i}', False)
    
    if monitoring_enabled:
        metrics_collector.update_active_workers('policy', healthy_count)
    
    # 检查 Training-Workers
    healthy_count = 0
    for i, worker in enumerate(training_workers):
        try:
            health = await worker.health_check.remote()
            is_healthy = health.get("status") == "healthy"
            if is_healthy:
                healthy_count += 1
            
            status["training_workers"].append({
                "id": i,
                "status": health.get("status", "unknown"),
            })
            
            if monitoring_enabled:
                metrics_collector.update_worker_health('training', f'training-{i}', is_healthy)
        except Exception as e:
            status["training_workers"].append({
                "id": i,
                "status": "error",
                "error": str(e),
            })
            if monitoring_enabled:
                metrics_collector.update_worker_health('training', f'training-{i}', False)
    
    if monitoring_enabled:
        metrics_collector.update_active_workers('training', healthy_count)
    
    return status


@app.get("/api/tracing/trace/{trace_id}")
async def get_trace(trace_id: str):
    """获取 Trace 摘要"""
    if not tracing_enabled or not tracing:
        raise HTTPException(status_code=503, detail="Tracing not enabled")
    
    summary = tracing.get_trace_summary(trace_id)
    return summary


@app.get("/api/metrics")
async def get_metrics():
    """获取监控指标"""
    if not monitoring_enabled:
        return {"error": "监控未启用"}
    
    summary = metrics_collector.get_summary()
    ray_metrics = integrate_ray_metrics()
    
    return {
        "bridge_service": summary,
        "ray_cluster": ray_metrics.get("ray_cluster", {}),
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("ROLL_BRIDGE_PORT", "8001"))
    host = os.getenv("ROLL_BRIDGE_HOST", "0.0.0.0")
    
    logger.info(f"[Bridge] 启动服务: http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
