# Skill: `itinerary.experience_curator` (Travel Experience Curator)

> **定位**：Decision OS「感性体验脑」—— 在 `adaptive_replan`（理性硬约束脑）产出可行骨架后，用转场美学、心流节奏与感官平衡把路线**润色成有电影感、照顾情绪价值的旅程**。

---

## 双脑协同

```
[INTAKE 改排意图]
        │
        ▼
┌─────────────────────────────┐
│ itinerary.adaptive_replan    │  理性脑：路况、营业时间、人格边界、疲劳
└──────────────┬──────────────┘
               │ 可行骨架
               ▼
┌─────────────────────────────┐
│ itinerary.experience_curator │  感性脑：黄金时刻、感官交替、转场留白、高潮余韵
└──────────────┬──────────────┘
               ▼
   itinerary_adjust_result（人情味草案卡片）
```

| 脑 | Skill | 回答 |
|----|-------|------|
| 理性 | `adaptive_replan` | 走得通吗？安全吗？符合人格边界吗？ |
| 感性 | **`experience_curator`** | 这么走**爽不爽**？有没有浪费晚霞？会不会审美疲劳？ |

---

## 体验度量衡（Experience Metrics）

| 指标 | 含义 |
|------|------|
| `rhythm_arc` | 启承转合波形 |
| `diversity` | 品类多样性 |
| `golden_hour_fit` | 日落/日出观景对齐度 |
| `sensory_balance` | 高/低能量感官交替 |
| `transition_cushion` | 车程心理缓冲与 Drive-by 留白 |
| `overall` | 综合体验分 |

---

## 四大编排美学

### ① 黄金时刻锚定（Golden Hour）
逆向对齐：先算日落窗 → 筛选观景 POI → 微调停留 ±20–30 分钟。

### ② 感官交替（Sensory De-escalation）
连续高震撼景观后，强制插入低能量人文/温泉/咖啡缓冲，或提前低能量 POI。

### ③ 电影感转场（Cinematic Transition）
长途车程插入「车窗观景点」与安静转场文案，服务隐私边界与车内疗愈。

### ④ 高潮-余韵（Rhythm Waveform）
`cinematic_climax` / `harmonic_flow` / `slow_burn` 三种 pacing 策略控制高潮位与傍晚余韵。

---

## 输入合同

`experience-curator.types.ts` → `ExperienceCuratorPayload`

`experiencePreferences` 可由奥德赛人格自动解构，亦可显式传入。

---

## 兼容

`itinerary.experience_align` 为**兼容别名**，内部委托 `experience_curator`。
