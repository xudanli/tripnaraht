# RailPass 关键规则总结

本文档总结了 RailPass 模块实现的所有关键规则，每条规则都基于官方文档和实际使用经验。

## 1. Eurail vs Interrail：按居住地区分（不是按"想买哪个"）

**规则**：
- **Eurail**：面向居住在亚洲/非洲/美洲/大洋洲的旅客
- **Interrail**：面向欧洲国家居民

**实现**：
- `EligibilityEngineService.checkEligibility()` 根据用户的 `country of residence` 自动决定 Eurail / Interrail
- 这是 Agent 的第一步合规判断，不能由用户自行选择

**参考**：
- [Eurail Official](https://www.eurail.com)
- [Interrail Official](https://www.interrail.eu)

## 2. Interrail Global Pass 的"本国使用"只有 2 次机会（出境+入境）

**规则**：
- Interrail Global Pass 在"居住国"内的使用，通常只允许：
  - 1 个 outbound journey（离境）
  - 1 个 inbound journey（返程）
- **它们并不是额外送的天数，是占用你的 travel day**
- 同一天多次换乘仍算 1 travel day（outbound/inbound 各自允许多次换乘）

**实现**：
- `RailPassConstraintsService.checkHomeCountryRule()` - 检查 outbound/inbound 限制
- `RailPassRuleEngineService` - `HOME_COUNTRY_OUTBOUND_INBOUND_LIMIT` 规则

**注意**：这是最容易踩坑的点之一，用户以为"我在本国随便坐"，但规则不是这样。

**参考**：
- [Interrail Official Rules](https://www.interrail.eu/en/help/faq/pass-validity)

## 3. Travel Day（计日）是"00:00–23:59"的自然日，不是 24 小时滚动

**规则**：
- Travel Day 从 00:00 到 23:59，Pass 的有效期也按这种日界计算
- 不是 24 小时滚动制

**实现**：
- `TravelDayCalculationEngineService` - 使用 `departureDate`（自然日）进行计算
- 按日期分组 segments，每个自然日最多消耗 1 个 travel day

**参考**：
- [Eurail Official Rules](https://www.eurail.com/en/plan-your-trip/eurail-pass-conditions)

## 4. 夜车计日：不换乘可只算出发日；过午夜换乘要算 2 天

**规则**：
- 夜车若不在午夜后换乘：只需用出发那一天作为 travel day（1 天）
- 若午夜后有换乘：需要 2 个 travel day（出发日 + 到达日）
- **最后一个有效日（23:59 到期）不能用来乘坐会跨到次日的夜车**，因为 validity 到 23:59 就结束

**实现**：
- `TravelDayCalculationEngineService` - 根据 `crossesMidnight` 和 `hasMidnightTransfer` 判断
- `RailPassRuleEngineService` - `TRAVEL_DAY_MIDNIGHT_TRANSFER` 规则
- `RailPassConstraintsService.checkLastDayNightTrain()` - 最后一天夜车约束

**参考**：
- [Eurail Official Rules](https://www.eurail.com/en/plan-your-trip/eurail-pass-conditions)

## 5. 订座：很多车"没订座=不能上车"，而且 Eurostar 等存在 passholder 限额/桶

**规则**：
- 多数高速列车、以及所有夜车都需要（或强烈建议）订座
- 夜车订铺位更是硬性要求
- 订座不包含在 Pass 里，需要额外付费
- Eurostar 等热门线路存在 passholder seat 配额/票价桶机制，确实会出现"有车但 Pass 名额没了"的情况
- Eurostar 建议尽早订（会放出提前期，但会卖完）

**实现**：
- `ReservationDecisionEngineService.checkReservation()` - 判断订座需求
- `RailPassRuleEngineService` - `RESERVATION_REQUIRED` 和 `RESERVATION_QUOTA_RISK` 规则
- `ReservationChannelPolicyService` - 配置不同线路的订座渠道策略（如 Eurostar 建议提前 60 天）

**参考**：
- [Eurail Official Rules](https://www.eurail.com/en/plan-your-trip/eurail-pass-conditions)
- [Eurail Community - Eurostar](https://www.eurail.com/en/community)

## 6. One Country Pass：通常不能用于跨境段

**规则**：
- 一国通票本质上是"仅限该国网络/境内段"
- 跨境通常需要额外点对点票（或换 Global Pass）

**实现**：
- `PassCoverageCheckerService.checkCoverage()` - 检查 One Country Pass 的跨境限制
- 如果 `fromCountryCode !== toCountryCode`，返回 `NOT_COVERED`

**参考**：
- [Eurail Community](https://www.eurail.com/en/community)

## 7. Pass 一般只覆盖"火车"，不包含城市地铁/公交/电车（除少数合作折扣）

**规则**：
- Pass 一般只覆盖 trains（火车）
- 城市地铁/公交/有轨电车（trams/buses/metros）不包含
- 可能有少数合作折扣，但不保证

**实现**：
- `PassCoverageCheckerService.isCityTransport()` - 识别市内交通
- `PassCoverageCheckerService.generateCityTransportAlternatives()` - 生成替代方案（地铁/公交/步行/打车）

**参考**：
- Eurail 官方明确：只覆盖 trains，trams/buses/metros 不包含

## 规则实现位置

| 规则 | 实现服务 | 约束/规则 ID |
|------|---------|-------------|
| Eurail vs Interrail | `EligibilityEngineService` | - |
| 居住国使用限制 | `RailPassConstraintsService` | `C_home_country_outbound_inbound_limit` |
| Travel Day 自然日 | `TravelDayCalculationEngineService` | - |
| 夜车计日 | `TravelDayCalculationEngineService` | `C_travel_day_midnight_transfer` |
| 最后一天夜车 | `RailPassConstraintsService` | `C_last_day_night_train` |
| 订座强制要求 | `ReservationDecisionEngineService` | `C_reservation_required` |
| 订座配额风险 | `ReservationChannelPolicyService` | `R_quota_risk` |
| One Country 跨境限制 | `PassCoverageCheckerService` | `C_pass_coverage` |
| 市内交通不覆盖 | `PassCoverageCheckerService` | `C_pass_coverage` |

## 所有规则统一通过规则引擎评估

`RailPassRuleEngineService` 提供统一的规则评估接口，所有规则都遵循统一结构：
- **Condition**: 触发条件
- **Effect**: 对 schedule 的影响
- **Severity**: error/warning/info
- **Evidence**: 规则来源（给 decision-log 用）

可以通过 `POST /railpass/rules/evaluate` 评估所有规则。
