# Planning Gold Dataset — Collection Checklist（Iceland）

目标：**每族 10 条、合计 100+** 真实可 Replay 场景。  
当前 **六族 synthetic = 60/60 active**；下一步用真实运营包替换 provenance。

## 采集状态

| 族 | 目标 | Active | 下一批动作 |
|----|------|--------|------------|
| road_close | 10 | **10**（含 5× `staging_replay` + evidence pack） | 继续补齐 06–10 运营包；01–05 已升阶 |
| wind | 10 | **10** | 接 SafeTravel / 大风告警证据包 |
| blue_ice | 10 | **10** | 冰川导览取消 / 步道关闭 → 真实包 |
| parking_full | 10 | **10** | Blue Lagoon / 热门瀑布车位满 → 真实包 |
| hotel_change | 10+ | **15**（含 5× MOVE_DAY 多日） | 单日 proxy + `md_01…05`；sidecar 需 MOVE_DAY flag |
| reservation_delay | 10 | **10** | 固定预约迟到 / last-entry → 真实包 |

## 每条真实场景必须具备

1. **Evidence**：roadId / 事件时间 / source refs（可复现）  
2. **Base plan**：单日有序 POI（含 booked / 可选标记）  
3. **Travel matrix**：优先真实 travelFromPreviousDurationMin  
4. **Projection**：EDGE_FORBIDDEN / REPLACE_POOL / FIXED_START 从 Canonical 投影  
5. **标签**：`maxChangedActivities`（Repair 宜 2–4）、`stabilityRuns`（Lab≥20，M4≥100）  
6. **Provenance**：`real_ops` | `staging_replay` | `synthetic_template_v1`

## road_close

| ID | Op | 意图 | Provenance |
|----|-----|------|------------|
| 01 | REROUTE | F208 a1→a2 | `staging_replay` + evidence pack |
| 02 | SWAP | F208 a1→a2 | `staging_replay` + evidence pack |
| 03 | SHIFT | F208 + 时移 | `staging_replay` + evidence pack |
| 04 | REROUTE | F235 a3→a4 | `staging_replay` + evidence pack |
| 05 | REROUTE | 双禁边 | `staging_replay` + evidence pack |
| 06 | SWAP | 南岸 6 POI + locality | synthetic |
| 07 | REPLACE | Skaftafell REPLACE_POOL | synthetic |
| 08 | REPLACE | Seljalandsfoss REPLACE_POOL | synthetic |
| 09 | SWAP | Booked lunch pin | synthetic |
| 10 | SHORTEN | 日程过满 | synthetic |

## wind

| ID | Op | 意图 |
|----|-----|------|
| 01–10 | 同构 | 海岸/半岛大风 → EDGE_FORBIDDEN / REPLACE / SHIFT / SHORTEN |

生成器：`scripts/generate_wind_family.py`

## blue_ice

| ID | Op | 意图 |
|----|-----|------|
| 01–10 | 同构 | 冰川可达 / 导览取消 |

生成器：`scripts/generate_blue_ice_family.py`

## parking_full

| ID | Op | 意图 |
|----|-----|------|
| 01 | REROUTE | Blue Lagoon 排队接近禁 hop |
| 02 | SWAP | 同上 |
| 03 | SHIFT | 错峰推迟 TW |
| 04 | REROUTE | Skógafoss lot |
| 05 | REROUTE | 双 lot |
| 06 | SWAP | 南岸 6 POI |
| 07 | REPLACE | Blue Lagoon → Sky Lagoon |
| 08 | REPLACE | Seljalandsfoss → Gljúfrabúi |
| 09 | SWAP | Booked spa pin |
| 10 | SHORTEN | 高峰过满 |

## hotel_change（单日 proxy，非 MOVE_DAY）

| ID | Op | 意图 |
|----|-----|------|
| 01–06 | REROUTE/SWAP/SHIFT | 住宿锚变化 → 陈旧 hop 禁边 |
| 07–08 | REPLACE | 远点 → 新住宿近点 |
| 09 | SWAP | Booked breakfast pin |
| 10 | SHORTEN | 过满去远腿 |

## reservation_delay

| ID | Op | 意图 |
|----|-----|------|
| 01–06 | REROUTE/SWAP/SHIFT | 预约延后 / last-entry / 前后缓冲 |
| 07–08 | REPLACE | 迟到换短 alt |
| 09 | SWAP | Booked show pin |
| 10 | SHORTEN | 延后过满 |

生成器（后三族）：`scripts/generate_remaining_families.py`

## Replay

```bash
OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091 npm run lab:planning-gold -- --stability 5
# staging road_close only:
OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091 npm run lab:planning-gold -- --stability 5 --match road_close.0
npm run lab:authority-readiness
```

M4 前对 active 场景建议：`--stability 100`。
