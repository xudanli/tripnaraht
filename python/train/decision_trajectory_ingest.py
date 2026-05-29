#!/usr/bin/env python3
"""
将 Nest 导出的 decision-trajectory 训练包安全注册到 Python 训练数据目录。

- 路径白名单校验（防目录穿越）
- 复制为稳定文件名，供 train_lora.py / train_dpo.py 读取
- 写出 manifest（pair_type / rejected_source 统计）
"""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence


DEFAULT_ALLOWED_ROOTS = (
    "/app/data",
    "/app/data/host-training",
    "/app/data/host-training/decision-trajectories",
)


@dataclass
class IngestResult:
    dpo_registered_path: str
    sft_train_registered_path: Optional[str] = None
    manifest_path: str = ""
    line_count: int = 0
    by_pair_type: Dict[str, int] = field(default_factory=dict)
    by_rejected_source: Dict[str, int] = field(default_factory=dict)
    source_paths: Dict[str, str] = field(default_factory=dict)


def _parse_allowed_roots(extra: Optional[Sequence[str]] = None) -> List[Path]:
    env_roots = os.environ.get("TRAINING_DATA_ALLOWED_ROOTS", "")
    roots: List[str] = list(DEFAULT_ALLOWED_ROOTS)
    if env_roots.strip():
        roots.extend(p.strip() for p in env_roots.split(",") if p.strip())
    if extra:
        roots.extend(extra)
    project_root = os.environ.get("TRIPNARA_PROJECT_ROOT", "").strip()
    if project_root:
        roots.append(project_root)
        roots.append(str(Path(project_root) / "data" / "training"))
    resolved: List[Path] = []
    for r in roots:
        try:
            resolved.append(Path(r).expanduser().resolve())
        except OSError:
            continue
    return resolved


def _is_under_root(path: Path, roots: Iterable[Path]) -> bool:
    for root in roots:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def resolve_safe_jsonl_path(
    raw_path: str,
    *,
    allowed_roots: Optional[Sequence[str]] = None,
) -> Path:
    """解析并校验 JSONL 路径必须在白名单根目录下。"""
    if not raw_path or not str(raw_path).strip():
        raise ValueError("empty dataset path")

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        cwd = Path(os.environ.get("TRIPNARA_PROJECT_ROOT", os.getcwd())).resolve()
        path = (cwd / path).resolve()
    else:
        path = path.resolve()

    if path.suffix.lower() != ".jsonl":
        raise ValueError(f"expected .jsonl file, got: {path}")

    if not path.is_file():
        raise FileNotFoundError(f"dataset file not found: {path}")

    roots = _parse_allowed_roots(allowed_roots)
    if roots and not _is_under_root(path, roots):
        raise PermissionError(
            f"path {path} is outside allowed roots: {[str(r) for r in roots]}",
        )

    return path


def _scan_dpo_jsonl(path: Path) -> tuple[int, Dict[str, int], Dict[str, int]]:
    count = 0
    by_pair: Dict[str, int] = {}
    by_rejected: Dict[str, int] = {}
    required = {"prompt", "chosen", "rejected", "pair_type"}

    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"invalid JSON at {path}:{line_no}: {e}") from e

            missing = required - set(row.keys())
            if missing:
                raise ValueError(
                    f"missing fields {sorted(missing)} at {path}:{line_no}",
                )

            pair_type = str(row["pair_type"])
            if pair_type not in ("planner_obedience", "debate_narrator"):
                raise ValueError(
                    f"unknown pair_type {pair_type!r} at {path}:{line_no}",
                )

            count += 1
            by_pair[pair_type] = by_pair.get(pair_type, 0) + 1

            src = row.get("rejected_source")
            if src:
                by_rejected[str(src)] = by_rejected.get(str(src), 0) + 1

    return count, by_pair, by_rejected


def register_decision_trajectory_pack(
    *,
    dpo_jsonl_path: str,
    dataset_dir: str | Path = "/app/data",
    sft_sharegpt_jsonl_path: Optional[str] = None,
    sft_alpaca_jsonl_path: Optional[str] = None,
    allowed_roots: Optional[Sequence[str]] = None,
    dpo_register_name: str = "tripnara_dpo_preferences",
    sft_register_name: str = "tripnara_decision",
) -> IngestResult:
    """
    复制 DPO / SFT JSONL 到 dataset_dir，返回稳定路径与 manifest。
    """
    out_dir = Path(dataset_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    dpo_src = resolve_safe_jsonl_path(dpo_jsonl_path, allowed_roots=allowed_roots)
    line_count, by_pair, by_rejected = _scan_dpo_jsonl(dpo_src)

    dpo_dst = out_dir / f"{dpo_register_name}.jsonl"
    shutil.copy2(dpo_src, dpo_dst)

    sft_dst: Optional[Path] = None
    source_paths: Dict[str, str] = {"dpo": str(dpo_src)}

    if sft_sharegpt_jsonl_path:
        sft_src = resolve_safe_jsonl_path(
            sft_sharegpt_jsonl_path, allowed_roots=allowed_roots,
        )
        sft_dst = out_dir / f"{sft_register_name}_train.jsonl"
        shutil.copy2(sft_src, sft_dst)
        source_paths["sft_sharegpt"] = str(sft_src)
    elif sft_alpaca_jsonl_path:
        sft_src = resolve_safe_jsonl_path(
            sft_alpaca_jsonl_path, allowed_roots=allowed_roots,
        )
        sft_dst = out_dir / f"{sft_register_name}_train.jsonl"
        shutil.copy2(sft_src, sft_dst)
        source_paths["sft_alpaca"] = str(sft_src)

    manifest: Dict[str, Any] = {
        "schema": "tripnara.decision_trajectory_ingest@v1",
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "dpo_path": str(dpo_dst),
        "sft_train_path": str(sft_dst) if sft_dst else None,
        "line_count": line_count,
        "by_pair_type": by_pair,
        "by_rejected_source": by_rejected,
        "source_paths": source_paths,
    }
    manifest_path = out_dir / f"{dpo_register_name}_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return IngestResult(
        dpo_registered_path=str(dpo_dst),
        sft_train_registered_path=str(sft_dst) if sft_dst else None,
        manifest_path=str(manifest_path),
        line_count=line_count,
        by_pair_type=by_pair,
        by_rejected_source=by_rejected,
        source_paths=source_paths,
    )
