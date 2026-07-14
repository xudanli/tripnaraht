# Selected Trip Sampling Policy（M4-RA-01）

在真实 tripId 到来前锁定选样标准，避免最后随便抓 10 条。

## 纳入条件

- 冰岛行程（`destination = IS`）
- 数据字段完整（通过 `lab:validate-selected-trip`）
- 至少包含一个可触发修复的问题
- 无真实支付或取消副作用
- 可人工复核
- 有稳定 Evidence 快照（导出副本）
- operation ∈ { SHIFT, SWAP, SHORTEN, REROUTE }

## 排除条件

- 仅 MOVE_DAY 可解
- booked 项需要取消
- 高风险道路需用户承担安全决策
- 数据缺失严重
- 依赖未接入的实时服务
- 涉及敏感个人信息（且无法脱敏）
- 不能安全回滚到 Neptune

## 样本分布（锁定 10 条）

| 类别 | 数量 |
|------|------|
| SHIFT | 2 |
| SWAP | 2 |
| SHORTEN | 2 |
| REROUTE | 2 |
| 拒绝 / 回落（负面） | 2 |

负面样例用于验证：白名单外、scope 外、Gateway BLOCK、fallback。

## 流程

1. Intake → validate  
2. 人工填 `expected-outcome.json`  
3. `assemble-selected-pilot` 显示 eligible / blocked  
4. 产品确认白名单后再写 `selected-trips.whitelist.json`  
