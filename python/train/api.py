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


async def run_training_task(task: TrainingTask, resume_from_checkpoint: Optional[str] = None):
    """运行训练任务（后台）"""
    global current_training_process
    
    try:
        task.status = TrainingStatus.RUNNING
        task.started_at = datetime.now()
        
        # 生成配置文件
        config_path = Path("/tmp") / f"train_config_{task.task_id}.yaml"
        config_dict = {
            "model_name_or_path": task.config.model_name,
            "lora_rank": task.config.lora_rank,
            "lora_alpha": task.config.lora_alpha,
            "learning_rate": task.config.learning_rate,
            "num_train_epochs": task.config.num_epochs,
            "per_device_train_batch_size": task.config.batch_size,
            "dataset": task.config.dataset_name,
            "output_dir": f"/app/outputs/{task.task_id}",
            "logging_dir": f"/app/logs/{task.task_id}",
        }
        
        import yaml
        with open(config_path, 'w') as f:
            yaml.dump(config_dict, f)
        
        # 构建命令
        cmd = ["python", "train_lora.py", "--config", str(config_path)]
        if resume_from_checkpoint:
            cmd.extend(["--resume_from_checkpoint", resume_from_checkpoint])
        
        logger.info(f"Starting training: {' '.join(cmd)}")
        
        # 启动训练进程
        current_training_process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd="/app/train",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        
        # 读取输出并更新状态
        async for line in current_training_process.stdout:
            line_str = line.decode().strip()
            logger.info(f"[Training] {line_str}")
            
            # 解析进度（简单实现）
            if "Epoch" in line_str:
                # 尝试解析 epoch 信息
                pass
            if "loss" in line_str.lower():
                # 尝试解析 loss
                pass
        
        # 等待完成
        await current_training_process.wait()
        
        if current_training_process.returncode == 0:
            task.status = TrainingStatus.COMPLETED
            task.progress = 100.0
        else:
            task.status = TrainingStatus.FAILED
            task.error = f"Training process exited with code {current_training_process.returncode}"
        
    except Exception as e:
        logger.error(f"Training failed: {e}")
        task.status = TrainingStatus.FAILED
        task.error = str(e)
    
    finally:
        task.completed_at = datetime.now()
        current_training_process = None
        
        # 保存状态到 Redis
        if redis_client:
            try:
                await redis_client.hset(
                    f"training:task:{task.task_id}",
                    mapping={
                        "status": task.status.value,
                        "completed_at": task.completed_at.isoformat() if task.completed_at else "",
                        "error": task.error or "",
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to save task state to Redis: {e}")


# ============================================
# 主入口
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
