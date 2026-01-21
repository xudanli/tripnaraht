"""
ROLL 配置
"""
import os
from typing import Optional

# Ray 配置
RAY_ADDRESS: str = os.getenv("RAY_ADDRESS", "ray://localhost:10001")
RAY_NAMESPACE: str = os.getenv("RAY_NAMESPACE", "tripnara-rl")

# Worker 配置
ACTOR_WORKER_NUM: int = int(os.getenv("ROLL_ACTOR_WORKER_NUM", "2"))
REWARD_WORKER_NUM: int = int(os.getenv("ROLL_REWARD_WORKER_NUM", "2"))
POLICY_WORKER_NUM: int = int(os.getenv("ROLL_POLICY_WORKER_NUM", "1"))

# Worker 资源配置
ACTOR_WORKER_CPU: float = float(os.getenv("ROLL_ACTOR_WORKER_CPU", "1.0"))
ACTOR_WORKER_MEMORY: int = int(os.getenv("ROLL_ACTOR_WORKER_MEMORY", "2048"))  # MB
REWARD_WORKER_CPU: float = float(os.getenv("ROLL_REWARD_WORKER_CPU", "1.0"))
REWARD_WORKER_MEMORY: int = int(os.getenv("ROLL_REWARD_WORKER_MEMORY", "2048"))  # MB
POLICY_WORKER_CPU: float = float(os.getenv("ROLL_POLICY_WORKER_CPU", "0.5"))
POLICY_WORKER_MEMORY: int = int(os.getenv("ROLL_POLICY_WORKER_MEMORY", "1024"))  # MB
TRAINING_WORKER_CPU: float = float(os.getenv("ROLL_TRAINING_WORKER_CPU", "2.0"))
TRAINING_WORKER_MEMORY: int = int(os.getenv("ROLL_TRAINING_WORKER_MEMORY", "4096"))  # MB

# GPU 配置（可选）
ACTOR_WORKER_GPU: int = int(os.getenv("ROLL_ACTOR_WORKER_GPU", "0"))
REWARD_WORKER_GPU: int = int(os.getenv("ROLL_REWARD_WORKER_GPU", "0"))
POLICY_WORKER_GPU: int = int(os.getenv("ROLL_POLICY_WORKER_GPU", "0"))
TRAINING_WORKER_GPU: int = int(os.getenv("ROLL_TRAINING_WORKER_GPU", "0"))

# 训练配置
TRAINING_BACKEND: str = os.getenv("ROLL_TRAINING_BACKEND", "megatron")  # megatron | deepspeed
INFERENCE_BACKEND: str = os.getenv("ROLL_INFERENCE_BACKEND", "vllm")  # vllm | sglang

# 模型配置
MODEL_PATH: Optional[str] = os.getenv("ROLL_MODEL_PATH")
MODEL_REGISTRY_URL: Optional[str] = os.getenv("MLFLOW_TRACKING_URI")

# 日志配置
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
