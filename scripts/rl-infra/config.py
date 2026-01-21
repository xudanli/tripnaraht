"""
RL Infrastructure Configuration

共享配置，供所有Python服务使用
"""

import os
from typing import Optional
from pydantic import BaseSettings


class Settings(BaseSettings):
    """服务配置"""
    
    # 服务端口
    TRAINING_SERVICE_PORT: int = 8001
    POLICY_SERVICE_PORT: int = 8002
    LLM_JUDGE_SERVICE_PORT: int = 8003
    
    # TypeScript后端URL
    BACKEND_URL: str = "http://localhost:3000"
    
    # MLflow配置
    MLFLOW_TRACKING_URI: str = os.getenv("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db")
    MLFLOW_ARTIFACT_ROOT: str = os.getenv("MLFLOW_ARTIFACT_ROOT", "./mlruns")
    MLFLOW_EXPERIMENT_NAME: str = "tripnara-rl"
    
    # Ray配置
    RAY_ADDRESS: str = os.getenv("RAY_ADDRESS", "local")
    RAY_NUM_CPUS: int = int(os.getenv("RAY_NUM_CPUS", "4"))
    RAY_NUM_GPUS: int = int(os.getenv("RAY_NUM_GPUS", "0"))
    
    # Model配置
    MODEL_DIR: str = os.getenv("MODEL_DIR", "./models")
    BASELINE_MODEL_VERSION: str = "v0.9.0"
    CURRENT_MODEL_VERSION: str = "v1.0.0"
    
    # LLM配置
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "anthropic")  # anthropic or openai
    LLM_MODEL: str = os.getenv("LLM_MODEL", "claude-3-haiku-20240307")
    
    # 数据库配置
    DATABASE_URL: Optional[str] = os.getenv("DATABASE_URL")
    
    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局设置实例
settings = Settings()
