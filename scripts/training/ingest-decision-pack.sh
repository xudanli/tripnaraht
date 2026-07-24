#!/usr/bin/env bash
# 将 Nest 导出的 decision-trajectory 训练包注册到 Python 训练服务。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DPO_PATH="${1:-}"
TRAIN_URL="${TRAIN_SERVICE_URL:-http://localhost:8000}"

if [[ -z "$DPO_PATH" ]]; then
  DPO_PATH="$(ls -t "$ROOT/data/training/decision-trajectories"/dpo_preferences_*.jsonl 2>/dev/null | head -1 || true)"
fi

if [[ -z "$DPO_PATH" || ! -f "$DPO_PATH" ]]; then
  echo "用法: $0 [dpo_preferences_*.jsonl]" >&2
  echo "或先运行 Nest ETL 导出到 data/training/decision-trajectories/" >&2
  exit 1
fi

CONTAINER_DPO="${TRAINING_PYTHON_PATH_MOUNT_TO:-/app/data/host-training/decision-trajectories}"
FROM="${TRAINING_PYTHON_PATH_MOUNT_FROM:-$ROOT/data/training/decision-trajectories}"
REL="$(realpath --relative-to="$FROM" "$(realpath "$DPO_PATH")" 2>/dev/null || basename "$DPO_PATH")"
BODY_DPO="$CONTAINER_DPO/$REL"

echo "Registering DPO pack: $BODY_DPO -> $TRAIN_URL"

curl -sf -X POST "$TRAIN_URL/datasets/register-decision-pack" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg dpo "$BODY_DPO" \
    '{dpo_jsonl_path: $dpo, dataset_dir: "/app/data"}')"

echo ""
echo "Done. Stable path: /app/data/tripnara_dpo_preferences.jsonl"
