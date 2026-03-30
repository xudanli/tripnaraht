# Live Proof Usage

This package provides minimum implementation for "real-traffic proof":

- live traffic summary generation
- A/B uplift evaluation
- workflow artifact output

## Files

- `generate-live-traffic-summary.sh`
- `evaluate-ab-uplift.sh`
- `evaluate-ab-uplift-stratified.sh`
- `check-sample-coverage.sh`
- `.github/workflows/roll-live-proof.yml`

## Run Locally

```bash
cd scripts/rl-infra/roll
./generate-live-traffic-summary.sh sample-events.jsonl live-traffic-summary.json
./evaluate-ab-uplift.sh sample-control-metrics.json sample-treatment-metrics.json ab-uplift-evaluation.json
./evaluate-ab-uplift-stratified.sh sample-control-segments.json sample-treatment-segments.json ab-uplift-stratified.json
./check-sample-coverage.sh sample-events.jsonl sample-coverage.json
```

## Run in GitHub Actions

Trigger workflow: `ROLL Live Proof`

Inputs:

- `events_artifact_path`
- `control_metrics_path`
- `treatment_metrics_path`

Outputs:

- `live-traffic-summary.json`
- `ab-uplift-evaluation.json`
- `ab-uplift-stratified.json` (optional if stratified inputs provided)
- `sample-coverage.json`

## Integrate with Prod Ramp Gate

`roll-prod-ramp-gate.yml` supports optional proof inputs:

- `live_traffic_summary_path`
- `ab_uplift_evaluation_path`
- `sample_coverage_path`
- `ab_uplift_stratified_path`

Behavior:

- If both paths are provided, workflow runs `verify-ramp-with-proof.sh`
- Ramp rule:
  - target traffic >= 30% requires `PROMOTE`
  - target traffic < 30% allows `CONTINUE`/`PROMOTE`, blocks `REJECT`
- Threshold gate also requires `contract_violation_rate` input in `roll-prod-ramp-gate.yml`
- If `sample_coverage_path` is provided, minimum segment coverage (`user/budget/destination`) must be >= 0.67
- If `ab_uplift_stratified_path` is provided:
  - target traffic >= 30% requires stratified decision `PROMOTE`
  - target traffic < 30% blocks stratified decision `REJECT`

## Decision Rule

`evaluate-ab-uplift.sh` uses:

- `PROMOTE` if >=2 metrics are positive + statistically significant
- `REJECT` if any key metric regresses
- otherwise `CONTINUE`
