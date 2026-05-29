#!/usr/bin/env python3
"""LoRA checkpoint 导出与 pipeline 产物固化。"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

SFT_CHECKPOINT_ALIAS = "checkpoint-sft-final"
DPO_CHECKPOINT_ALIAS = "checkpoint-dpo-final"

ADAPTER_FILES = (
    "adapter_config.json",
    "adapter_model.safetensors",
    "adapter_model.bin",
    "README.md",
)


def _find_adapter_source_dir(source_dir: Path) -> Optional[Path]:
    """在训练输出目录中定位含 adapter_config.json 的目录。"""
    if (source_dir / "adapter_config.json").is_file():
        return source_dir
    for child in sorted(source_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if child.is_dir() and (child / "adapter_config.json").is_file():
            return child
    return None


def export_lora_checkpoint(
    source_dir: str | Path,
    dest_dir: str | Path,
    *,
    manifest_extra: Optional[Dict[str, Any]] = None,
) -> Path:
    """
    将 LoRA adapter 复制到稳定别名目录（如 checkpoint-sft-final）。
    """
    src_root = Path(source_dir).resolve()
    dst = Path(dest_dir).resolve()

    adapter_src = _find_adapter_source_dir(src_root)
    if adapter_src is None:
        raise FileNotFoundError(
            f"no adapter_config.json under training output: {src_root}",
        )

    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True, exist_ok=True)

    copied: list[str] = []
    for name in ADAPTER_FILES:
        src_file = adapter_src / name
        if src_file.is_file():
            shutil.copy2(src_file, dst / name)
            copied.append(name)

    if not (dst / "adapter_config.json").is_file():
        raise FileNotFoundError(f"adapter export failed: {dst}")

    manifest: Dict[str, Any] = {
        "schema": "tripnara.lora_checkpoint@v1",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_dir": str(adapter_src),
        "dest_dir": str(dst),
        "copied_files": copied,
    }
    if manifest_extra:
        manifest.update(manifest_extra)

    with open(dst / "pipeline_checkpoint_manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return dst


def read_adapter_base_model(adapter_dir: str | Path) -> str:
    cfg_path = Path(adapter_dir) / "adapter_config.json"
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    base = cfg.get("base_model_name_or_path")
    if not base:
        raise ValueError(f"base_model_name_or_path missing in {cfg_path}")
    return base
