#!/usr/bin/env bash
# Phase 2.2：调用 Python 跑 Golden Circle 校准样本（见 artifacts/poi-planning-calibration-readout-phase2.2.md）
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$DIR/run-poi-calibration-samples.py" "$@"
