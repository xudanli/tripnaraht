-- cutover-inflight: active-benchmark-runs-v1
-- Group: A — Decision Runtime database (benchmark registry)
SELECT count(*) AS value
FROM decision_benchmark_run
WHERE status IN ('CREATED', 'RUNNING', 'PAUSED');
