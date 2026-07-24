# Itinerary Day Editor AI Policy（日期级编排顾问）

**pageId:** `ITINERARY_DAY_EDITOR`  
**pageMode:** `ITINERARY_DAY_EDITOR`  
**insightScope:** `ITINERARY_DAY`（须带 `viewport.selectedDayIndex` 或 `DAY` ref）  
**contract:** `itinerary_day_editor@1.1`

## 定位

回答：**这一天排得怎么样，哪里没排好，下一步改什么？**

不是系统说明助手，不介绍「字段在哪里改」。

## 当天状态

| status | 判断 | 卡片标题示例 |
|--------|------|----------------|
| `INCOMPLETE` | 关键活动/路线未排（如只有住宿） | Day 4 规划不完整 |
| `BLOCKED` | 硬冲突 / 不可完成 | 当天不可行 |
| `TIGHT` | 可完成但缓冲/转场过紧 | 缓冲偏紧 |
| `OPTIMIZABLE` | 可执行但有长空档/顺序/待预订 | 可优化编排 |
| `READY` | 完整合理 → **SILENT** | — |

优先级：**硬冲突 > 规划缺失 > 时间窗与驾驶 > 空档与顺序 > 预订 > 系统数据过期**。  
「规则超 N 天未核验」等只能作次级证据，不得占主卡。

## 流程

```text
ClientPageState（pageMode + insightScope + selectedDay）
  → ItineraryDayEditorPageContextBuilder
      当日活动 / 空档 / 预订 / 住宿锚点
      + validateScope(day)（过滤系统维护类主因）
      + 必要时 plan-proposal 修复预览
  → selectItineraryDayEditorInsight（按 DayPlanStatus）
  → Narrative（编排顾问提示词）
  → NaraPageInsight（actions 由 Insight 返回，非固定三按钮）
```

## 允许动作（示例）

- `GENERATE_DAY_DRAFT` / `FILL_GAP` — 补全当天  
- `CONFIRM_BOOKING` / `OPEN_LODGING` — 预订与住宿  
- `PREVIEW_REORDER` / `ADD_BUFFER` — 已验证 proposal  
- `OPEN_CONFLICT` — 硬冲突详情  

## 文案

- 标题直接表达状态（前端勿再套「Copilot 建议：」空话）  
- `summary` ≤ 45 → `advisorCopy.body`  
- `suggestion` ≤ 20 → `advisorCopy.advice`  
- 合计 ≤ 65 汉字；必须点名时间/活动/住宿  

## 验收

1. 只有住宿 → `INCOMPLETE`，建议生成当天草案  
2. 有空档 + 多项待预订 → 先确认预订，再补活动（非「去活动详情改字段」）  
3. 景点已确认、住宿未订 → 指向确认住宿  
4. READY → SILENT  
5. 系统规则过期不得盖过空档/预订建议  

前端：按钮只渲染 `insight.actions[]`；切日必须重传 `selectedDayIndex` / `selectedDayId`。
