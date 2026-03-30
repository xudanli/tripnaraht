#!/usr/bin/env bash
set -euo pipefail

echo "[drill] start SRE drill"

echo "[drill] step1: verify strict no simulation"
./verify-staging-no-simulation.sh || {
  echo "[drill] failed at step1"
  exit 1
}

echo "[drill] step2: verify prod guardrails"
ENV_FILE=.env.prod ./verify-prod-guardrails.sh || {
  echo "[drill] failed at step2"
  exit 1
}

echo "[drill] step3: simulate canary rollout"
./canary-rollout.sh "v-drill" "5"

echo "[drill] step4: simulate canary rollback"
./canary-rollback.sh

echo "[drill] completed"
