# 阴影部署与 Harness Shadow Grader

## 流量模型

```
[在线请求] ──► 生产主 Planner (V1 stable) ──► 用户可见输出
         └──► Harness Shadow Grader ──► DPO-Final LoRA（异步，不阻塞）
                    │
                    ▼
              聚合指标 → 晋升门控 → 可选晋升生产
```

## 触发链

1. `sft_then_dpo` pipeline `completed` + `production_adapter_path`
2. `FineTuneService.triggerShadowDeployIfReady` → `ShadowDeploymentWorkflowService.onFlywheelPipelineCompleted`
3. 注册阴影版本 `shadow-{taskId}`，尝试 vLLM `loadLoraAdapter`
4. 每次 `DecisionTrajectoryInterlocutor.finalize` → `HarnessShadowGraderService.scheduleGradeFromTrajectory`

## 环境变量

| 变量 | 说明 |
|------|------|
| `TRAINING_SHADOW_DEPLOY_ENABLED` | 训练完成后自动阴影注册 |
| `TRAINING_SHADOW_DEPLOY_AUTO_MONITOR` | 非阻塞启动时后台轮询 pipeline |
| `SHADOW_GRADER_ENABLED` | 在线 finalize 触发影子评测 |
| `SHADOW_PROMOTION_MIN_SAMPLES` | 默认 1000 |
| `SHADOW_PROMOTION_MIN_WIN_RATE` | 默认 0.52 |
| `SHADOW_PROMOTION_AUTO` | `1` 时门控通过后自动 `deployVersion` |

## API

- `GET /api/training/shadow/active`
- `GET /api/training/shadow/:shadowVersion/metrics`
- `GET /api/training/shadow/metrics/prometheus`
- `POST /api/training/shadow/:shadowVersion/promote?force=1`

## Prometheus 契约

```
tripnara_shadow_grader_samples{shadow_version="..."}
tripnara_shadow_grader_win_rate{shadow_version="..."}
tripnara_shadow_grader_safety_pass_rate{shadow_version="...",lane="production|shadow"}
tripnara_shadow_grader_promotion_ready{shadow_version="..."}
```

## 晋升条件（全部满足）

- 样本数 ≥ `SHADOW_PROMOTION_MIN_SAMPLES`
- 阴影胜率 ≥ `SHADOW_PROMOTION_MIN_WIN_RATE`
- 阴影 SAFETY_PASS 率 ≥ 生产
- 阴影平均 reward > 生产

手动晋升：`POST .../promote?force=1`

## 无人值守晋升 Cron

`ShadowPromotionCronService` — 每 30 分钟巡检（`@nestjs/schedule`）。

| 开关 | 作用 |
|------|------|
| `TRAINING_SHADOW_DEPLOY_AUTO_MONITOR=1` | 启用 Cron 巡检循环 |
| `SHADOW_PROMOTION_CRON_ENABLED` | 显式覆盖（`0` 关闭 Cron 但可保留 pipeline 监听） |
| `SHADOW_PROMOTION_AUTO=1` | 门控通过后自动 `promote()`；`0` 仅打 NOTICE + 标记 `PROMOTION_READY` |

防震荡：`promote()` 互斥锁 + 晋升后 `retireFromActiveInspection()`，下轮 Cron 不再扫描该版本。

Dashboard：`GET /api/training/shadow/:version/metrics` 返回 `{ metrics, gate }`，`gate.deferralSummary` 为白盒拒绝原因。
