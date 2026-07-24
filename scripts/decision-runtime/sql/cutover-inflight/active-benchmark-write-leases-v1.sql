-- cutover-inflight: active-benchmark-write-leases-v1
-- Group: A — unexpired benchmark instance write leases
SELECT count(*) AS value
FROM decision_benchmark_instance_execution
WHERE locked_by IS NOT NULL
  AND lease_expires_at > NOW();
