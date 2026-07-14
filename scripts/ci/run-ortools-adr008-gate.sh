#!/usr/bin/env bash
# ADR-008 OR-Tools Candidate Provider gate (non-authoritative).
# Exit 0 = Lab + unit OK. Never promotes authority.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOLVER_DIR="$ROOT/python/solver"
OUT_DIR="${ORTOOLS_LAB_OUT_DIR:-$ROOT/artifacts/ortools-adr008}"
REPEATS="${ORTOOLS_LAB_REPEATS:-5}"

mkdir -p "$OUT_DIR"

echo "==> OR-Tools ADR-008 gate (Lab Sign-off + pytest + Nest solver)"

if [[ ! -x "$SOLVER_DIR/.venv/bin/python" ]]; then
  echo "Creating python/solver .venv…"
  if command -v uv >/dev/null 2>&1; then
    uv venv "$SOLVER_DIR/.venv"
    UV_HTTP_TIMEOUT=300 uv pip install --python "$SOLVER_DIR/.venv/bin/python" \
      -r "$SOLVER_DIR/requirements.txt" -r "$SOLVER_DIR/requirements-dev.txt"
  else
    python3 -m venv "$SOLVER_DIR/.venv"
    "$SOLVER_DIR/.venv/bin/pip" install -q \
      -r "$SOLVER_DIR/requirements.txt" -r "$SOLVER_DIR/requirements-dev.txt"
  fi
fi

PY="$SOLVER_DIR/.venv/bin/python"
cd "$SOLVER_DIR"

echo "==> pytest (incl. S4.5 IR freeze)"
"$PY" -m pytest tests/ -q --tb=line

echo "==> lab_signoff (repeats=$REPEATS)"
"$PY" lab_signoff.py --repeats "$REPEATS" --out "$OUT_DIR/lab-signoff.json"
echo "Lab report: $OUT_DIR/lab-signoff.json"

cd "$ROOT"
echo "==> Nest decision-runtime/solver"
npm test -- --testPathPatterns='decision-runtime/solver|road-segment-unavailable-evaluate-ortools' --no-coverage

echo "==> OR-Tools ADR-008 gate PASS (authoritativePromotion remains false)"
