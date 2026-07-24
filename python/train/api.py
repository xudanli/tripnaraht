#!/usr/bin/env python3
"""
TripNARA 训练服务 API

提供 RESTful API 用于：
- 启动/停止/监控训练任务
- 管理训练数据
- 查询训练状态和指标
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from enum import Enum

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import mlflow
import redis.asyncio as redis

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="TripNARA Training Service",
    description="LoRA 微调训练服务 API",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis 连接
redis_client: Optional[redis.Redis] = None


# ============================================
# 数据模型
# ============================================

class TrainingStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TrainingConfig(BaseModel):
    """训练配置"""
    model_name: str = Field(default="Qwen/Qwen2.5-7B-Instruct", description="基座模型")
    lora_rank: int = Field(default=64, ge=8, le=256, description="LoRA rank")
    lora_alpha: int = Field(default=128, ge=16, le=512, description="LoRA alpha")
    learning_rate: float = Field(default=2e-4, ge=1e-6, le=1e-2, description="学习率")
    num_epochs: int = Field(default=3, ge=1, le=10, description="训练轮数")
    batch_size: int = Field(default=2, ge=1, le=16, description="批次大小")
    dataset_name: str = Field(default="tripnara_decision", description="数据集名称")
    training_stage: str = Field(
        default="sft",
        description="sft | dpo | sft_then_dpo",
    )
    dpo_dataset_path: Optional[str] = Field(
        default=None,
        description="DPO JSONL（Nest decision_trajectories 导出）",
    )
    sft_dataset_path: Optional[str] = Field(
        default=None,
        description="SFT repair JSONL（可选，覆盖 dataset_name 文件）",
    )
    dpo_pair_types: Optional[List[str]] = Field(
        default=None,
        description="planner_obedience | debate_narrator",
    )
    dpo_rejected_sources: Optional[List[str]] = Field(
        default=None,
        description="true_topology | violation_surrogate",
    )
    sft_num_epochs: Optional[int] = Field(default=None, ge=1, le=20)
    dpo_num_epochs: Optional[int] = Field(default=None, ge=1, le=20)
    sft_learning_rate: Optional[float] = Field(default=None, ge=1e-6, le=1e-2)
    dpo_learning_rate: Optional[float] = Field(default=None, ge=1e-6, le=1e-2)


class TrainingRequest(BaseModel):
    """训练请求"""
    task_id: str = Field(description="任务 ID")
    config: TrainingConfig = Field(default_factory=TrainingConfig)
    resume_from_checkpoint: Optional[str] = Field(default=None)


class TrainingTask(BaseModel):
    """训练任务"""
    task_id: str
    status: TrainingStatus
    config: TrainingConfig
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float = 0.0
    current_epoch: int = 0
    current_step: int = 0
    total_steps: int = 0
    loss: Optional[float] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    pipeline_stage: Optional[str] = None
    checkpoint_sft_final: Optional[str] = None
    production_adapter_path: Optional[str] = None


class RegisterDecisionPackRequest(BaseModel):
    """注册 Nest 导出的 decision-trajectory 训练包"""
    dpo_jsonl_path: str
    sft_sharegpt_jsonl_path: Optional[str] = None
    sft_alpaca_jsonl_path: Optional[str] = None
    dataset_dir: Optional[str] = Field(
        default=None,
        description="默认 /app/data 或 TRAINING_DATASET_DIR",
    )


class RegisterDecisionPackResponse(BaseModel):
    dpo_registered_path: str
    sft_train_registered_path: Optional[str] = None
    manifest_path: str
    line_count: int
    by_pair_type: Dict[str, int]
    by_rejected_source: Dict[str, int]


class DatasetInfo(BaseModel):
    """数据集信息"""
    name: str
    path: str
    train_samples: int
    eval_samples: int
    created_at: datetime
    format: str
    size_mb: float


# ============================================
# 全局状态
# ============================================

training_tasks: Dict[str, TrainingTask] = {}
current_training_process: Optional[asyncio.subprocess.Process] = None


# ============================================
# 生命周期
# ============================================

@app.on_event("startup")
async def startup():
    """启动时初始化"""
    global redis_client
    
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    redis_client = redis.from_url(redis_url, decode_responses=True)
    
    # 测试连接
    try:
        await redis_client.ping()
        logger.info(f"Connected to Redis: {redis_url}")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}")
        redis_client = None
    
    # 设置 MLflow
    mlflow_uri = os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000")
    mlflow.set_tracking_uri(mlflow_uri)
    logger.info(f"MLflow tracking URI: {mlflow_uri}")


@app.on_event("shutdown")
async def shutdown():
    """关闭时清理"""
    global redis_client
    if redis_client:
        await redis_client.close()


# ============================================
# API 端点
# ============================================

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "redis": redis_client is not None,
        "gpu_available": torch_cuda_available(),
    }


@app.get("/gpu/info")
async def gpu_info():
    """GPU 信息"""
    try:
        import torch
        if torch.cuda.is_available():
            return {
                "available": True,
                "device_count": torch.cuda.device_count(),
                "devices": [
                    {
                        "index": i,
                        "name": torch.cuda.get_device_name(i),
                        "memory_total": torch.cuda.get_device_properties(i).total_memory,
                        "memory_allocated": torch.cuda.memory_allocated(i),
                        "memory_reserved": torch.cuda.memory_reserved(i),
                    }
                    for i in range(torch.cuda.device_count())
                ]
            }
        else:
            return {"available": False, "reason": "CUDA not available"}
    except ImportError:
        return {"available": False, "reason": "PyTorch not installed"}


@app.post("/training/pipeline/sft-then-dpo")
async def start_sft_then_dpo_pipeline(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
):
    """
    显式启动 sft_then_dpo 两阶段串联（SFT Chain-of-Repair → DPO 真拓扑偏好）。
    """
    req = request.model_copy(deep=True)
    req.config.training_stage = "sft_then_dpo"
    return await start_training(req, background_tasks)


@app.post("/training/start")
async def start_training(request: TrainingRequest, background_tasks: BackgroundTasks):
    """启动训练任务"""
    task_id = request.task_id
    
    # 检查是否已存在
    if task_id in training_tasks:
        existing = training_tasks[task_id]
        if existing.status == TrainingStatus.RUNNING:
            raise HTTPException(status_code=400, detail=f"Task {task_id} is already running")
    
    # 创建任务
    task = TrainingTask(
        task_id=task_id,
        status=TrainingStatus.PENDING,
        config=request.config,
        created_at=datetime.now(),
    )
    training_tasks[task_id] = task
    
    # 后台启动训练
    background_tasks.add_task(run_training_task, task, request.resume_from_checkpoint)
    
    return {"task_id": task_id, "status": "pending", "message": "Training task queued"}


@app.get("/training/{task_id}")
async def get_training_status(task_id: str):
    """获取训练状态"""
    if task_id not in training_tasks:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    return training_tasks[task_id]


@app.get("/training")
async def list_training_tasks():
    """列出所有训练任务"""
    return list(training_tasks.values())


@app.post("/training/{task_id}/cancel")
async def cancel_training(task_id: str):
    """取消训练任务"""
    global current_training_process
    
    if task_id not in training_tasks:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    task = training_tasks[task_id]
    
    if task.status != TrainingStatus.RUNNING:
        raise HTTPException(status_code=400, detail=f"Task {task_id} is not running")
    
    # 终止进程
    if current_training_process and current_training_process.returncode is None:
        current_training_process.terminate()
        await current_training_process.wait()
    
    task.status = TrainingStatus.CANCELLED
    task.completed_at = datetime.now()
    
    return {"task_id": task_id, "status": "cancelled"}


@app.get("/datasets")
async def list_datasets():
    """列出可用数据集"""
    data_dir = Path("/app/data")
    datasets = []
    
    if data_dir.exists():
        for file in data_dir.glob("*.jsonl"):
            stat = file.stat()
            # 统计行数
            with open(file, 'r') as f:
                line_count = sum(1 for _ in f)
            
            datasets.append(DatasetInfo(
                name=file.stem,
                path=str(file),
                train_samples=line_count,
                eval_samples=0,
                created_at=datetime.fromtimestamp(stat.st_ctime),
                format="jsonl",
                size_mb=stat.st_size / (1024 * 1024),
            ))
    
    return datasets


@app.post("/datasets/register-decision-pack", response_model=RegisterDecisionPackResponse)
async def register_decision_pack(request: RegisterDecisionPackRequest):
    """
    将 TypeScript ETL 写出的 dpo_preferences_*.jsonl 安全复制到训练数据目录。
    """
    from decision_trajectory_ingest import register_decision_trajectory_pack

    dataset_dir = request.dataset_dir or os.environ.get(
        "TRAINING_DATASET_DIR", "/app/data",
    )
    try:
        result = register_decision_trajectory_pack(
            dpo_jsonl_path=request.dpo_jsonl_path,
            sft_sharegpt_jsonl_path=request.sft_sharegpt_jsonl_path,
            sft_alpaca_jsonl_path=request.sft_alpaca_jsonl_path,
            dataset_dir=dataset_dir,
        )
    except (FileNotFoundError, PermissionError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return RegisterDecisionPackResponse(
        dpo_registered_path=result.dpo_registered_path,
        sft_train_registered_path=result.sft_train_registered_path,
        manifest_path=result.manifest_path,
        line_count=result.line_count,
        by_pair_type=result.by_pair_type,
        by_rejected_source=result.by_rejected_source,
    )


@app.post("/datasets/upload")
async def upload_dataset(name: str, data: List[Dict[str, Any]]):
    """上传数据集"""
    data_dir = Path("/app/data")
    data_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = data_dir / f"{name}_train.jsonl"
    
    with open(file_path, 'w', encoding='utf-8') as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + '\n')
    
    return {
        "name": name,
        "path": str(file_path),
        "samples": len(data),
    }


@app.get("/models")
async def list_models():
    """列出已训练的模型"""
    outputs_dir = Path("/app/outputs")
    models = []
    
    if outputs_dir.exists():
        for model_dir in outputs_dir.iterdir():
            if model_dir.is_dir() and (model_dir / "adapter_config.json").exists():
                # 读取配置
                with open(model_dir / "adapter_config.json", 'r') as f:
                    config = json.load(f)
                
                models.append({
                    "name": model_dir.name,
                    "path": str(model_dir),
                    "base_model": config.get("base_model_name_or_path"),
                    "lora_rank": config.get("r"),
                    "created_at": datetime.fromtimestamp(model_dir.stat().st_ctime).isoformat(),
                })
    
    return models


@app.get("/mlflow/experiments")
async def list_mlflow_experiments():
    """列出 MLflow 实验"""
    try:
        experiments = mlflow.search_experiments()
        return [
            {
                "experiment_id": exp.experiment_id,
                "name": exp.name,
                "artifact_location": exp.artifact_location,
                "lifecycle_stage": exp.lifecycle_stage,
            }
            for exp in experiments
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/mlflow/runs/{experiment_id}")
async def list_mlflow_runs(experiment_id: str):
    """列出 MLflow 运行"""
    try:
        runs = mlflow.search_runs(experiment_ids=[experiment_id])
        return runs.to_dict(orient='records')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# 辅助函数
# ============================================

def torch_cuda_available() -> bool:
    """检查 CUDA 是否可用"""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def _task_config_to_pipeline_dict(task: TrainingTask, dataset_dir: str) -> Dict[str, Any]:
    """将 API TrainingConfig 转为 pipeline_runner 使用的扁平配置。"""
    cfg = task.config
    out: Dict[str, Any] = {
        "model_name": cfg.model_name,
        "lora_rank": cfg.lora_rank,
        "lora_alpha": cfg.lora_alpha,
        "learning_rate": cfg.learning_rate,
        "num_epochs": cfg.num_epochs,
        "batch_size": cfg.batch_size,
        "dataset_name": cfg.dataset_name,
        "dataset_dir": dataset_dir,
        "sft_dataset_path": cfg.sft_dataset_path,
        "dpo_dataset_path": cfg.dpo_dataset_path,
        "dpo_pair_types": cfg.dpo_pair_types,
        "dpo_rejected_sources": cfg.dpo_rejected_sources,
    }
    if cfg.sft_num_epochs is not None:
        out["sft_num_epochs"] = cfg.sft_num_epochs
    if cfg.dpo_num_epochs is not None:
        out["dpo_num_epochs"] = cfg.dpo_num_epochs
    if cfg.sft_learning_rate is not None:
        out["sft_learning_rate"] = cfg.sft_learning_rate
    if cfg.dpo_learning_rate is not None:
        out["dpo_learning_rate"] = cfg.dpo_learning_rate
    return out


def _apply_pipeline_metrics(task: TrainingTask, metrics_update: Dict[str, Any]) -> None:
    task.metrics.update(metrics_update)
    stage = metrics_update.get("pipeline_stage")
    if stage:
        task.pipeline_stage = stage
    if metrics_update.get("checkpoint_sft_final"):
        task.checkpoint_sft_final = metrics_update["checkpoint_sft_final"]
    if metrics_update.get("production_adapter_path"):
        task.production_adapter_path = metrics_update["production_adapter_path"]


async def run_training_task(task: TrainingTask, resume_from_checkpoint: Optional[str] = None):
    """运行训练任务（后台）"""
    global current_training_process
    
    try:
        task.status = TrainingStatus.RUNNING
        task.started_at = datetime.now()
        
        stage = (task.config.training_stage or "sft").lower()
        dataset_dir = os.environ.get("TRAINING_DATASET_DIR", "/app/data")

        if stage == "sft_then_dpo":
            from pipeline_runner import run_sft_then_dpo_pipeline

            if not task.config.sft_dataset_path:
                raise ValueError(
                    "sft_then_dpo requires sft_dataset_path (Chain-of-Repair JSONL)",
                )
            if not task.config.dpo_dataset_path:
                raise ValueError("sft_then_dpo requires dpo_dataset_path")

            _apply_pipeline_metrics(task, {"pipeline_stage": "sft_running", "pipeline_mode": "sft_then_dpo"})

            def on_stage_change(stage_name: str, payload: Dict[str, Any]) -> None:
                _apply_pipeline_metrics(task, payload)
                if stage_name == "sft_running":
                    task.progress = 10.0
                elif stage_name == "sft_completed":
                    task.progress = 50.0
                elif stage_name == "dpo_running":
                    task.progress = 55.0
                elif stage_name == "completed":
                    task.progress = 100.0

            result = await run_sft_then_dpo_pipeline(
                task.task_id,
                _task_config_to_pipeline_dict(task, dataset_dir),
                on_stage_change=on_stage_change,
            )
            _apply_pipeline_metrics(task, result)
            task.status = TrainingStatus.COMPLETED
            task.progress = 100.0
            return

        # 单阶段：SFT 或 DPO
        config_path = Path("/tmp") / f"train_config_{task.task_id}.yaml"
        config_dict = {
            "model_name_or_path": task.config.model_name,
            "lora_rank": task.config.lora_rank,
            "lora_alpha": task.config.lora_alpha,
            "learning_rate": task.config.learning_rate,
            "num_train_epochs": task.config.num_epochs,
            "per_device_train_batch_size": task.config.batch_size,
            "dataset": task.config.dataset_name,
            "dataset_dir": dataset_dir,
            "output_dir": f"/app/outputs/{task.task_id}",
            "logging_dir": f"/app/logs/{task.task_id}",
            "stage": stage,
        }

        if task.config.dpo_dataset_path:
            config_dict["dpo_jsonl_path"] = task.config.dpo_dataset_path
        if task.config.sft_dataset_path:
            config_dict["sft_jsonl_path"] = task.config.sft_dataset_path
        if task.config.dpo_pair_types:
            config_dict["dpo_pair_types"] = task.config.dpo_pair_types
        if task.config.dpo_rejected_sources:
            config_dict["dpo_rejected_sources"] = task.config.dpo_rejected_sources

        import yaml
        with open(config_path, "w") as f:
            yaml.dump(config_dict, f)

        if stage == "dpo":
            cmd = ["python", "train_dpo.py", "--config", str(config_path)]
        else:
            cmd = ["python", "train_lora.py", "--config", str(config_path)]
        if resume_from_checkpoint:
            cmd.extend(["--resume_from_checkpoint", resume_from_checkpoint])

        logger.info("Starting training: %s", " ".join(cmd))

        current_training_process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd="/app/train",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        async for line in current_training_process.stdout:
            line_str = line.decode().strip()
            logger.info("[Training] %s", line_str)

        await current_training_process.wait()

        if current_training_process.returncode == 0:
            task.status = TrainingStatus.COMPLETED
            task.progress = 100.0
        else:
            task.status = TrainingStatus.FAILED
            task.error = (
                f"Training process exited with code {current_training_process.returncode}"
            )

    except Exception as e:
        logger.error("Training failed: %s", e)
        task.status = TrainingStatus.FAILED
        task.error = str(e)
        _apply_pipeline_metrics(task, {"pipeline_stage": "failed", "error": str(e)})

    finally:
        task.completed_at = datetime.now()
        current_training_process = None

        if redis_client:
            try:
                await redis_client.hset(
                    f"training:task:{task.task_id}",
                    mapping={
                        "status": task.status.value,
                        "pipeline_stage": task.pipeline_stage or "",
                        "checkpoint_sft_final": task.checkpoint_sft_final or "",
                        "production_adapter_path": task.production_adapter_path or "",
                        "completed_at": task.completed_at.isoformat() if task.completed_at else "",
                        "error": task.error or "",
                    },
                )
            except Exception as e:
                logger.warning("Failed to save task state to Redis: %s", e)


# ============================================
# 主入口
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
