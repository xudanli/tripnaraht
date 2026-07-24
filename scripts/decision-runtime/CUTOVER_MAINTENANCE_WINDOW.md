# Cutover 短维护窗口清单

进入 inflight 核对**之前**执行。读请求与只读监控可继续。

## 暂停的写入入口

| 入口 | 操作 |
|------|------|
| Effective Plan execute | 暂停新 execute / setEffective |
| authorize → execute | 暂停新 authorize 触发执行链 |
| rollback | 暂停新 rollback 发起 |
| materialize | 暂停 itinerary materialize |
| benchmark / smoke 写数据 | 停止 Calibration / Holdout / Shadow batch / Evidence materialize |

## 等待周期

1. 开启维护窗口并记录 `maintenanceWindowStartedAt`
2. 等待 **≥ 1 个最长任务处理周期**
3. 再跑 DB probe 与 5 分钟窗口查询

## 核对顺序

```bash
# 0. 分类 + reconcile（在维护窗口之前）
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-classify
npm run production-cutover:inflight-reconcile -- --dry-run
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-reconcile -- --apply

# 1. 维护窗口后 DB probe
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-db-probe
# 队列人工核对 → 编辑 inflight-overlay.json
CUTOVER_OPERATOR=<you> npm run production-cutover:inflight-clearance
```

## 不可 overlay 掩盖

`unresolvedPartialFailures` / `activeRollbacks` / `activeExecutions` / `activeWriteLeases` / `pendingQueueWriteJobs` 必须先真实归零。
