#!/usr/bin/env python3
"""
加载 Nest ETL 导出的 DPO JSONL（tripnara DPO preference 格式）。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence, Set

if TYPE_CHECKING:
    from datasets import Dataset

logger = logging.getLogger(__name__)

VALID_PAIR_TYPES = frozenset({"planner_obedience", "debate_narrator"})
VALID_REJECTED_SOURCES = frozenset({"true_topology", "violation_surrogate"})


def load_dpo_preference_rows(
    path: str | Path,
    *,
    pair_types: Optional[Sequence[str]] = None,
    rejected_sources: Optional[Sequence[str]] = None,
    max_samples: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    解析 dpo_preferences_*.jsonl → HuggingFace Dataset。

    每行字段：prompt, chosen, rejected, pair_type, rejected_source?, trajectory_id, request_id
    """
    file_path = Path(path)
    if not file_path.is_file():
        raise FileNotFoundError(f"DPO dataset not found: {file_path}")

    pair_filter: Optional[Set[str]] = (
        set(pair_types) if pair_types else None
    )
    if pair_filter:
        unknown = pair_filter - VALID_PAIR_TYPES
        if unknown:
            raise ValueError(f"invalid pair_types filter: {sorted(unknown)}")

    rejected_filter: Optional[Set[str]] = (
        set(rejected_sources) if rejected_sources else None
    )
    if rejected_filter:
        unknown = rejected_filter - VALID_REJECTED_SOURCES
        if unknown:
            raise ValueError(f"invalid rejected_sources filter: {sorted(unknown)}")

    rows: List[Dict[str, Any]] = []
    skipped = 0

    with open(file_path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"invalid JSON at {file_path}:{line_no}: {e}") from e

            pair_type = item.get("pair_type")
            if pair_type not in VALID_PAIR_TYPES:
                logger.warning(
                    "skip line %s: unknown pair_type %r", line_no, pair_type,
                )
                skipped += 1
                continue

            if pair_filter and pair_type not in pair_filter:
                skipped += 1
                continue

            rejected_source = item.get("rejected_source")
            if rejected_filter and rejected_source not in rejected_filter:
                skipped += 1
                continue

            prompt = item.get("prompt")
            chosen = item.get("chosen")
            rejected = item.get("rejected")
            if not all(isinstance(x, str) and x.strip() for x in (prompt, chosen, rejected)):
                logger.warning("skip line %s: empty prompt/chosen/rejected", line_no)
                skipped += 1
                continue

            rows.append({
                "prompt": prompt,
                "chosen": chosen,
                "rejected": rejected,
                "pair_type": pair_type,
                "rejected_source": rejected_source or "",
                "trajectory_id": item.get("trajectory_id", ""),
                "request_id": item.get("request_id", ""),
            })

            if max_samples and len(rows) >= max_samples:
                break

    if not rows:
        raise ValueError(
            f"no DPO samples loaded from {file_path} "
            f"(skipped={skipped}, filters pair={pair_filter} rejected={rejected_filter})",
        )

    logger.info(
        "Loaded %s DPO samples from %s (skipped=%s)",
        len(rows), file_path, skipped,
    )
    return rows


def load_dpo_preferences_jsonl(
    path: str | Path,
    *,
    pair_types: Optional[Sequence[str]] = None,
    rejected_sources: Optional[Sequence[str]] = None,
    max_samples: Optional[int] = None,
):
    """返回 HuggingFace Dataset（训练用）。"""
    from datasets import Dataset

    rows = load_dpo_preference_rows(
        path,
        pair_types=pair_types,
        rejected_sources=rejected_sources,
        max_samples=max_samples,
    )
    return Dataset.from_list(rows)


def summarize_dpo_dataset(dataset) -> Dict[str, Any]:
    """按 pair_type / rejected_source 汇总（用于 MLflow / 日志）。"""
    by_pair: Dict[str, int] = {}
    by_rejected: Dict[str, int] = {}
    if isinstance(dataset, list):
        rows = dataset
    elif hasattr(dataset, "__getitem__") and hasattr(dataset, "__len__"):
        rows = [dataset[i] for i in range(len(dataset))]
    else:
        rows = list(dataset)
    for row in rows:
        pt = row.get("pair_type") or "unknown"
        by_pair[pt] = by_pair.get(pt, 0) + 1
        rs = row.get("rejected_source") or ""
        if rs:
            by_rejected[rs] = by_rejected.get(rs, 0) + 1
    return {
        "total": len(rows),
        "by_pair_type": by_pair,
        "by_rejected_source": by_rejected,
    }
