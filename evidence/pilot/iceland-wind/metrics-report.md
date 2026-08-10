# Iceland Wind Causal Decision — Pilot Metrics

- Generated: 2026-07-30T09:59:56.918Z
- Suite OK: **PASS**
- Cases: 20

## Gate metrics

| Metric | Value |
| --- | --- |
| recommendedValidationPassRate | 1 |
| deadlineBeforeIrreparableRate | 1 |
| incompleteObsUnobservableRate | 1 |
| applyNotAutoConfirmRate | 1 |

## By archetype

| Archetype | Count | Pass |
| --- | --- | --- |
| WIND_NO_IMPACT | 3 | 3 |
| WIND_MINOR_DELAY_STILL_OK | 3 | 3 |
| FIX_BY_DEPART_EARLIER | 4 | 4 |
| FIX_BY_DROP_STOP | 3 | 3 |
| IRRECOVERABLE_REPLACE_OR_CANCEL | 3 | 3 |
| FORECAST_CHANGE_STALE_CONTEXT | 2 | 2 |
| INCOMPLETE_OBSERVATION | 2 | 2 |

## Cases

### wind_no_impact_1 ✓
- 有风但缓冲充足 #1
- wind 9 m/s
- miss≈26% · deadline 2026-07-17T10:46:00.000Z
- rec opt_reschedule_activity · recon PENDING · OPEN
- headline: south_coast 路段阵风预计较强（约 9 m/s）。

### wind_no_impact_2 ✓
- 有风但缓冲充足 #2
- wind 10 m/s
- miss≈19% · deadline 2026-07-17T10:41:00.000Z
- rec opt_reschedule_activity · recon PENDING · OPEN
- headline: south_coast 路段阵风预计较强（约 10 m/s）。

### wind_no_impact_3 ✓
- 有风但缓冲充足 #3
- wind 11 m/s
- miss≈12% · deadline 2026-07-17T10:37:00.000Z
- rec opt_reschedule_activity · recon PENDING · OPEN
- headline: south_coast 路段阵风预计较强（约 11 m/s）。

### wind_minor_ok_1 ✓
- 轻微延误仍可签到 #1
- wind 13 m/s
- miss≈90% · deadline 2026-07-17T11:25:00.000Z
- rec opt_reschedule_activity · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 13 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:05:00.000Z 到达

### wind_minor_ok_2 ✓
- 轻微延误仍可签到 #2
- wind 14 m/s
- miss≈90% · deadline 2026-07-17T11:25:00.000Z
- rec opt_reschedule_activity · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 14 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:05:00.000Z 到达

### wind_minor_ok_3 ✓
- 轻微延误仍可签到 #3
- wind 15 m/s
- miss≈90% · deadline 2026-07-17T11:25:00.000Z
- rec opt_reschedule_activity · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 15 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:05:00.000Z 到达

### fix_depart_earlier_1 ✓
- 提前出发可修复 #1
- wind 19 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_depart_40min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 19 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:18:00.000Z 到达

### fix_depart_earlier_2 ✓
- 提前出发可修复 #2
- wind 20 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_depart_40min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 20 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:18:00.000Z 到达

### fix_depart_earlier_3 ✓
- 提前出发可修复 #3
- wind 21 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_depart_40min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 21 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:18:00.000Z 到达

### fix_drop_stop_1 ✓
- 删除中途停靠可修复 #1
- wind 21 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_drop_stop_act_seljalandsfoss · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 21 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:12:00.000Z 到达

### fix_drop_stop_2 ✓
- 删除中途停靠可修复 #2
- wind 22 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_drop_stop_act_seljalandsfoss · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 22 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:12:00.000Z 到达

### fix_drop_stop_3 ✓
- 删除中途停靠可修复 #3
- wind 23 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_drop_stop_act_seljalandsfoss · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 23 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:12:00.000Z 到达

### irrecoverable_1 ✓
- 已不可挽回需替换/取消 #1
- wind 29 m/s
- miss≈90% · deadline 2026-07-17T12:15:00.000Z
- rec opt_depart_60min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 29 m/s）。
- status: 结果已确认。实际于 2026-07-17T16:05:00.000Z 到达

### irrecoverable_2 ✓
- 已不可挽回需替换/取消 #2
- wind 30 m/s
- miss≈90% · deadline 2026-07-17T12:15:00.000Z
- rec opt_depart_60min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 30 m/s）。
- status: 结果已确认。实际于 2026-07-17T16:05:00.000Z 到达

### irrecoverable_3 ✓
- 已不可挽回需替换/取消 #3
- wind 31 m/s
- miss≈90% · deadline 2026-07-17T12:15:00.000Z
- rec opt_depart_60min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 31 m/s）。
- status: 结果已确认。实际于 2026-07-17T16:05:00.000Z 到达

### forecast_stale_1 ✓
- 预报变化需失效重算 #1
- wind 20 m/s
- miss≈90% · deadline 2026-07-17T11:15:00.000Z
- rec opt_reschedule_activity · recon UNOBSERVABLE · AWAITING_OBSERVATION
- headline: south_coast 路段阵风预计较强（约 20 m/s）。（预报已更新，需重算）
- status: 方案已应用，等待实际到达或签到结果

### forecast_stale_2 ✓
- 预报变化需失效重算 #2
- wind 24 m/s
- miss≈90% · deadline 2026-07-17T11:05:00.000Z
- rec opt_depart_40min_earlier · recon UNOBSERVABLE · AWAITING_OBSERVATION
- headline: south_coast 路段阵风预计较强（约 24 m/s）。（预报已更新，需重算）
- status: 方案已应用，等待实际到达或签到结果

### incomplete_obs_1 ✓
- 观测不完整无法对账 #1
- wind 19 m/s
- miss≈90% · deadline 2026-07-17T11:15:00.000Z
- rec opt_drop_stop_act_seljalandsfoss · recon UNOBSERVABLE · AWAITING_OBSERVATION
- headline: south_coast 路段阵风预计较强（约 19 m/s）。
- status: 方案已应用，等待实际到达或签到结果

### incomplete_obs_2 ✓
- 观测不完整无法对账 #2
- wind 19 m/s
- miss≈90% · deadline 2026-07-17T11:15:00.000Z
- rec opt_drop_stop_act_seljalandsfoss · recon UNOBSERVABLE · AWAITING_OBSERVATION
- headline: south_coast 路段阵风预计较强（约 19 m/s）。
- status: 方案已应用，等待实际到达或签到结果

### showcase_high_roof_gust18_checkin ✓
- 高车身露营车阵风≥18 — 导航缓冲看似充足
- wind 18 m/s (gust 22) · highRoof
- miss≈90% · deadline 2026-07-17T11:45:00.000Z
- rec opt_depart_60min_earlier · recon CONFIRMED · RECONCILED
- headline: south_coast 路段阵风预计较强（约 18 m/s）。
- status: 结果已确认。实际于 2026-07-17T15:52:00.000Z 到达
