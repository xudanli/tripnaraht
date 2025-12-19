MVP 切法：17 模块如何落到 3 个里程碑（可直接拿去排期）
Milestone A（P0：能创建→能排→能走）

Trips：1.1/1.3/1.4（手动创建 + 时间轴 + 下一站）

Places：2.1/2.2（关键词搜索 + 附近）

ItineraryItems：3.1/3.2（加入行程 + 调整时间）

Transport：5.1/5.3（多交通选项 + 鲁棒时间）

Optimization：4.1/4.4（单日优化 + 午餐/作息硬约束）

ScheduleAction：13.1/13.2（预览 + 应用）

交付定义：能产出“可执行 schedule”，且 violations/dropped_items 结构完整。

Milestone B（P1：好用、可信、可解释）

PlanningPolicy：6.1/6.2（稳健度 + 优化建议）

Optimization：4.3/4.5/4.6（必去想去、多时间窗、解释、松紧度控制）

LLM：14.1/14.2/14.4（NLU + 人性化转述 + 追问）

System：16.1/16.2（能力/提供商状态）

交付定义：解释链路完整（why / dropped / risk），并且“不可行”能说清楚。

Milestone C（P2：差异化护城河）

Decision：17.1~17.4（Abu/Dr.Dre/Neptune + 决策日志）

Trails：7.1/7.8/7.9（GPX + 追踪 + 报告）

Hotels/FlightPrices：8.3/9.3（红绿灯 + 预测线）

Vision/Voice：12.2/11.3（多模态入口）

交付定义：世界状态变化→可修复（Neptune），并能量化“计划稳定性”。