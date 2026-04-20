# Phase 2.2 校准跑批摘要（merge 修复后）

**跑批时间：** 本地 `python3 scripts/run-poi-calibration-samples.py`  
**原始 JSON：** `artifacts/poi-planning-calibration-phase22-run.json`

## 有效性（相对「noPoiPlanning」）

| 条件 | 结果 |
|------|------|
| 经过 POI_SELECTION（`current_step`） | 8/8 为 `POI_SELECTION` |
| `outcome.poiSelection.metrics.noPoiPlanning !== true` | **8/8 为 `false`**（有效） |

## 汇总表

| # | label | regionId | matchedBy | feasibility | coverage | overflow | leakage | budget OK | fallbackRate | topAnchorRanks |
|---|--------|----------|-----------|-------------|----------|----------|---------|-----------|--------------|----------------|
| 1 | gc_normal_600 | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 2 | gc_relaxed_600 | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 3 | gc_tight_360 | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 4 | must_secret_lagoon | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 5 | exclude_kerid | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 6 | region_keyword | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 7 | no_gc_reykjavik | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |
| 8 | repeat | golden_circle | message_text | ok | **0** | false | 0 | true | **0** | 全 null |

**required_anchors（各 GC 样本一致）：** `thingvellir`, `geysir`, `gullfoss`

**响应状态：** 均为 `NEED_MORE_INFO`（澄清路径），未走完完整 PLAN/NARRATE。

---

## 单一结论（只选下一步）

按已定规则：

- **coverage 低**（此处 8 条均为 **0**）→ 符合 **情况 1**。
- **fallbackRate** 均为 **0** → 未出现「占位锚点过多」信号。

**判定：下一步优先「提映射精度」**（`RESEARCH` 返回的 POI 行与 `ICELAND_POI_SLUG_KEYWORDS` / `poi_planning_anchor_slug` 对齐、或检索侧补锚点命中），**而不是先调 +2 / +2.5 / +3 权重。**

补充说明：

1. **coverage 为 0** 与 **topAnchorRanks 全 null** 一致：TopN 上解析出的 `resolvedSlugs` 为空，无法命中必选锚点 slug。
2. 在 **fallbackRate=0** 的前提下，**不符合**「先升级 slug/uuid 映射」的触发条件（除非你明确把「名称→slug 解析失败」也归入映射层）；当前读数更贴切地叫 **「检索/命名对齐」** 或 **「关键词与 anchor 注入」**，与单纯 UUID 库升级是子集关系。
3. 样本 7 仍显示 `golden_circle`：当前文案可能被 region 解析器判为黄金圈；若要做「无 region」对照，需改文案或产品侧显式关闭区域意图。

---

*本摘要基于单次本地跑批；可重复执行 `scripts/run-poi-calibration-samples.py` 复现。*
