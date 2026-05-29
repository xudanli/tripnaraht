#!/usr/bin/env python3
"""
sft_then_dpo 两阶段串联：SFT（Chain-of-Repair）→ checkpoint-sft-final → DPO（真拓扑偏好）。
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import yaml

from checkpoint_utils import (
    DPO_CHECKPOINT_ALIAS,
    SFT_CHECKPOINT_ALIAS,
    export_lora_checkpoint,
    read_adapter_base_model,
)

logger = logging.getLogger(__name__)


async def _run_train_subprocess(
    script: str,
    config_path: Path,
    cwd: str = "/app/train",
) -> int:
    cmd = ["python", script, "--config", str(config_path)]
    logger.info("Pipeline subprocess: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    assert proc.stdout is not None
    async for line in proc.stdout:
        logger.info("[Pipeline] %s", line.decode().rstrip())
    return await proc.wait()


def _write_yaml(path: Path, config: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True)


def build_sft_config(
    *,
    task_id: str,
    base_config: Dict[str, Any],
    pipeline_root: Path,
    dataset_dir: str,
) -> Dict[str, Any]:
    sft_out = pipeline_root / "sft"
    return {
        "model_name_or_path": base_config["model_name"],
        "lora_rank": base_config.get("lora_rank", 64),
        "lora_alpha": base_config.get("lora_alpha", 128),
        "lora_dropout": base_config.get("lora_dropout", 0.05),
        "learning_rate": base_config.get(
            "sft_learning_rate", base_config.get("learning_rate", 1.5e-4),
        ),
        "num_train_epochs": base_config.get(
            "sft_num_epochs", base_config.get("num_epochs", 3),
        ),
        "per_device_train_batch_size": base_config.get("batch_size", 2),
        "gradient_accumulation_steps": base_config.get("gradient_accumulation_steps", 8),
        "dataset_dir": dataset_dir,
        "dataset": base_config.get("dataset_name", "tripnara_decision"),
        "sft_jsonl_path": base_config.get("sft_dataset_path"),
        "output_dir": str(sft_out),
        "logging_dir": f"/app/logs/{task_id}/sft",
        "stage": "sft",
        "bf16": base_config.get("bf16", True),
        "quantization_bit": base_config.get("quantization_bit", 4),
        "cutoff_len": base_config.get("cutoff_len", 6144),
        "checkpoint_export_name": SFT_CHECKPOINT_ALIAS,
        "pipeline_root": str(pipeline_root),
    }


def build_dpo_config(
    *,
    task_id: str,
    base_config: Dict[str, Any],
    pipeline_root: Path,
    sft_checkpoint: Path,
    dataset_dir: str,
) -> Dict[str, Any]:
    dpo_out = pipeline_root / "dpo"
    base_model = read_adapter_base_model(sft_checkpoint)
    return {
        "base_model_name_or_path": base_model,
        "model_name_or_path": str(sft_checkpoint),
        "sft_adapter_path": str(sft_checkpoint),
        "continue_sft_adapter": True,
        "lora_rank": base_config.get("lora_rank", 64),
        "lora_alpha": base_config.get("lora_alpha", 128),
        "learning_rate": base_config.get(
            "dpo_learning_rate", base_config.get("dpo_lr", 5e-6),
        ),
        "num_train_epochs": base_config.get(
            "dpo_num_epochs", base_config.get("dpo_epochs", 2),
        ),
        "per_device_train_batch_size": base_config.get("dpo_batch_size", 1),
        "gradient_accumulation_steps": base_config.get("gradient_accumulation_steps", 8),
        "dataset_dir": dataset_dir,
        "dpo_jsonl_path": base_config.get("dpo_dataset_path"),
        "dpo_pair_types": base_config.get("dpo_pair_types"),
        "dpo_rejected_sources": base_config.get("dpo_rejected_sources"),
        "output_dir": str(dpo_out),
        "logging_dir": f"/app/logs/{task_id}/dpo",
        "stage": "dpo",
        "dpo_beta": base_config.get("dpo_beta", 0.1),
        "bf16": base_config.get("bf16", True),
        "quantization_bit": base_config.get("quantization_bit", 4),
        "cutoff_len": base_config.get("cutoff_len", 4096),
        "checkpoint_export_name": DPO_CHECKPOINT_ALIAS,
        "pipeline_root": str(pipeline_root),
    }


async def run_sft_then_dpo_pipeline(
    task_id: str,
    config_dict: Dict[str, Any],
    *,
    on_stage_change: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """
    执行完整两阶段 pipeline，返回产物路径字典。
    on_stage_change(stage: str, metrics: dict) 供 API 更新任务状态。
    """
    pipeline_root = Path(f"/app/outputs/{task_id}")
    pipeline_root.mkdir(parents=True, exist_ok=True)
    dataset_dir = config_dict.get("dataset_dir", "/app/data")
    tmp = Path("/tmp") / f"pipeline_{task_id}"

    def _notify(stage: str, **extra: Any) -> None:
        payload = {"pipeline_stage": stage, **extra}
        if on_stage_change:
            on_stage_change(stage, payload)

    # ---------- Stage 1: SFT ----------
    _notify("sft_running")
    sft_cfg_path = tmp / "sft.yaml"
    sft_config = build_sft_config(
        task_id=task_id,
        base_config=config_dict,
        pipeline_root=pipeline_root,
        dataset_dir=dataset_dir,
    )
    _write_yaml(sft_cfg_path, sft_config)

    if not sft_config.get("sft_jsonl_path"):
        raise ValueError(
            "sft_then_dpo requires sft_dataset_path (Chain-of-Repair JSONL)",
        )

    rc = await _run_train_subprocess("train_lora.py", sft_cfg_path)
    if rc != 0:
        raise RuntimeError(f"SFT stage failed with exit code {rc}")

    sft_checkpoint = pipeline_root / SFT_CHECKPOINT_ALIAS
    if not sft_checkpoint.is_dir():
        export_lora_checkpoint(
            sft_config["output_dir"],
            sft_checkpoint,
            manifest_extra={"stage": "sft", "task_id": task_id},
        )

    _notify(
        "sft_completed",
        checkpoint_sft_final=str(sft_checkpoint),
    )

    # ---------- Stage 2: DPO ----------
    _notify("dpo_running", checkpoint_sft_final=str(sft_checkpoint))
    dpo_cfg_path = tmp / "dpo.yaml"
    dpo_config = build_dpo_config(
        task_id=task_id,
        base_config=config_dict,
        pipeline_root=pipeline_root,
        sft_checkpoint=sft_checkpoint,
        dataset_dir=dataset_dir,
    )
    _write_yaml(dpo_cfg_path, dpo_config)

    if not dpo_config.get("dpo_jsonl_path"):
        raise ValueError("sft_then_dpo requires dpo_dataset_path")

    rc = await _run_train_subprocess("train_dpo.py", dpo_cfg_path)
    if rc != 0:
        raise RuntimeError(f"DPO stage failed with exit code {rc}")

    dpo_checkpoint = pipeline_root / DPO_CHECKPOINT_ALIAS
    if not dpo_checkpoint.is_dir():
        export_lora_checkpoint(
            dpo_config["output_dir"],
            dpo_checkpoint,
            manifest_extra={
                "stage": "dpo",
                "task_id": task_id,
                "sft_checkpoint": str(sft_checkpoint),
            },
        )

    result = {
        "pipeline_stage": "completed",
        "checkpoint_sft_final": str(sft_checkpoint),
        "checkpoint_dpo_final": str(dpo_checkpoint),
        "production_adapter_path": str(dpo_checkpoint),
        "pipeline_root": str(pipeline_root),
    }
    _notify("completed", **result)
    return result
