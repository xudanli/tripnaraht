# 体能画像接口（iOS 对接）

> 目标 UI：个人中心 / 入职引导「体能评估」、行程后反馈校准  
> 实现：`FitnessAssessmentController`（`src/trips/decision/controllers/fitness-assessment.controller.ts`）  
> Base：`/api/v1/fitness`  
> 鉴权：`Authorization: Bearer <token>`（问卷 GET 可公开）  
> 更新：2026-07-16

**不要与下列能力混淆：**

| 能力 | 路径 | 说明 |
|------|------|------|
| **体能画像（本文）** | `/api/v1/fitness/*` | 问卷 → HumanCapability 模型 → 等级 / 建议日爬升 / 日距离 |
| 决策风格画像 | `/api/trips/:tripId/decision-profiling/*` | Travel Style / Money DNA，见 `DECISION_PROFILING_API.md` |
| 成员入职偏好 | `/api/trips/:tripId/member-onboarding-profiles` | 含 `pacePreference` / `maxDailyWalkKm` 等软偏好，**不是**完整体能模型 |
| 规划团队状态 | `/api/mobile/trips/:tripId/planning/team-status` | 未完成体能相关确认时可能显示「体力需求未确认」文案 |

---

## 1. iOS 推荐流程

```
① GET  /api/v1/fitness/profile          → hasProfile? 
        ↓ 无画像
② GET  /api/v1/fitness/questionnaire?locale=zh
③ POST /api/v1/fitness/questionnaire/submit
④ GET  /api/v1/fitness/profile          → 展示画像卡片
        ↓ 行程结束后（可选）
⑤ POST /api/v1/fitness/feedback
⑥ POST /api/v1/fitness/calibrate        → 可选手动校准
```

| 场景 | 调用 |
|------|------|
| 进入体能页 / 个人中心 | `GET .../profile` |
| 展示问卷（可预拉） | `GET .../questionnaire` |
| 用户提交 4 题 | `POST .../questionnaire/submit` |
| 行程结束反馈（1 个 emoji） | `POST .../feedback` |
| 主动校准 | `POST .../calibrate` |
| 反馈历史统计 | `GET .../feedback/stats` |

---

## 2. 接口一览（P0 for iOS）

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| GET | `/api/v1/fitness/questionnaire` | 可选（Public） | 题库 + 选项文案 |
| POST | `/api/v1/fitness/questionnaire/submit` | 必填 | 提交答案 → 生成画像 |
| GET | `/api/v1/fitness/profile` | 必填 | 当前用户体能画像 |
| GET | `/api/v1/fitness/profile/:userId` | 必填 | 仅允许查本人（同 profile） |
| POST | `/api/v1/fitness/feedback` | 必填 | 行程后 effort 反馈 |
| GET | `/api/v1/fitness/feedback/stats` | 必填 | 反馈统计 |
| POST | `/api/v1/fitness/calibrate` | 必填 | 基于反馈校准模型 |

> Phase 2 分析（`/api/v1/fitness/analytics/*`：趋势 / 报告 / 可穿戴）首版 iOS **可不接**。

---

## 3. 通用约定

### 3.1 请求头

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### 3.2 响应形态（注意）

本模块 **不完全统一** 为 Mobile `{ success, data, requestId }` 信封：

| 接口 | 成功形态 |
|------|----------|
| GET questionnaire | 直接返回问卷对象（无 `data` 包裹） |
| POST submit | `{ success, model, profile }` |
| GET profile（有画像） | 直接返回 `FitnessProfile` 字段 |
| GET profile（无画像） | `{ hasProfile: false, message }`（**HTTP 仍可能 200**） |
| POST feedback | `{ success, message }` |
| POST calibrate | `{ success, calibrated, message, profile? }` |

iOS 解码建议：

1. 先判 `hasProfile == false` → 引导问卷  
2. 再判顶层是否存在 `overallScore` / `fitnessLevel` → 有画像  
3. submit / feedback / calibrate 看 `success`

---

## 4. GET 问卷

```
GET /api/v1/fitness/questionnaire?locale=zh
```

| Query | 说明 |
|-------|------|
| `locale` | `zh`（默认）\| `en`；题面含 `question` / `questionZh`、`label` / `labelZh`，iOS 可按 locale 取中文 |

**响应：**

```typescript
{
  questions: [{
    id: "weekly_exercise" | "longest_hike" | "elevation_experience"
    question: string
    questionZh: string
    options: [{
      value: 0 | 1 | 2 | 3 | 4
      label: string
      labelZh: string
      emoji?: string
    }]
  }]
  ageQuestion: {
    id: "age_group"
    question: string
    questionZh: string
    options: [{ value: 0|1|2|3|4, label, labelZh, emoji? }]
  }
}
```

### 题意与提交字段映射

| 题目 `id` | 提交字段 | `value` 含义 |
|-----------|----------|--------------|
| `weekly_exercise` | `weeklyExercise` | 0 基本不运动 → 4 专业级 |
| `longest_hike` | `longestHike` | 0 从未 → 4 单日 25km+ |
| `elevation_experience` | `elevationExperience` | 0 不确定 → 4 单日爬升 1000m+ |
| `age_group` | `ageGroupIndex` | 0=18–29 … 4=60+ |

---

## 5. POST 提交问卷

```
POST /api/v1/fitness/questionnaire/submit
Authorization: Bearer <token>
```

```json
{
  "weeklyExercise": 2,
  "longestHike": 2,
  "elevationExperience": 2,
  "ageGroupIndex": 1,
  "riskTolerance": "medium",
  "highAltitudeExperience": "basic",
  "pace": "normal"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `weeklyExercise` | 是 | 0–4 |
| `longestHike` | 是 | 0–4 |
| `elevationExperience` | 是 | 0–4 |
| `ageGroupIndex` | 是 | 0–4 |
| `riskTolerance` | 否 | `low` \| `medium` \| `high` |
| `highAltitudeExperience` | 否 | `none` \| `basic` \| `advanced` |
| `pace` | 否 | `slow` \| `relaxed` \| `normal` \| `fast` \| `intense` |

**userId 从 JWT 取，body 不要传 userId。**

**成功示例：**

```json
{
  "success": true,
  "model": { "...": "HumanCapabilityModel 内部结构，UI 可忽略" },
  "profile": {
    "overallScore": 62,
    "fitnessLevel": "MEDIUM",
    "levelDescription": "…",
    "confidence": "MEDIUM",
    "confidenceDescription": "…",
    "dimensions": {
      "climbingAbility": 65,
      "endurance": 60,
      "recoverySpeed": 55
    },
    "recommendedDailyAscentM": 600,
    "recommendedDailyDistanceKm": 12,
    "longestHike": 2,
    "completedTripCount": 0,
    "ageInfo": {
      "ageGroup": "30-39",
      "modifier": 0.95,
      "description": "…"
    }
  }
}
```

iOS 展示优先用 **`profile`**，不必依赖 `model`。

---

## 6. GET 体能画像

```
GET /api/v1/fitness/profile
Authorization: Bearer <token>
```

等价（仅本人）：

```
GET /api/v1/fitness/profile/{userId}
```

查他人 → `403`。

### 6.1 已有画像

```typescript
{
  overallScore: number              // 0–100
  fitnessLevel: "LOW" | "MEDIUM_LOW" | "MEDIUM" | "MEDIUM_HIGH" | "HIGH"
  levelDescription: string
  confidence: "LOW" | "MEDIUM" | "HIGH"
  confidenceDescription: string
  dimensions: {
    climbingAbility: number         // 0–100
    endurance: number
    recoverySpeed: number
  }
  recommendedDailyAscentM: number
  recommendedDailyDistanceKm: number
  longestHike?: 0 | 1 | 2 | 3 | 4
  completedTripCount: number
  ageInfo?: {
    ageGroup: string                // "18-29" | "30-39" | …
    modifier: number
    description: string
  }
}
```

**建议卡片字段：** `fitnessLevel` + `levelDescription` + `overallScore` + 三维 `dimensions` + 两行建议（爬升 / 距离）。

### 6.2 尚未评估

```json
{
  "hasProfile": false,
  "message": "您尚未完成体能评估，请先完成问卷。"
}
```

→ 跳转问卷页。

---

## 7. POST 行程后反馈

```
POST /api/v1/fitness/feedback
```

```json
{
  "tripId": "trip-xxx",
  "actualEffortRating": 2,
  "completedAsPlanned": true,
  "plannedFatigueIndex": 1.0,
  "adjustmentsMade": ["缩短徒步"]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `tripId` | 是 | |
| `actualEffortRating` | 是 | **1**=😓太累了，**2**=😊刚刚好，**3**=💪还能再走 |
| `completedAsPlanned` | 是 | |
| `plannedFatigueIndex` | 否 | 系统预估疲劳；可省略 |
| `adjustmentsMade` | 否 | 实际做了哪些调整 |

```json
{ "success": true, "message": "太棒了！看来行程安排刚刚好。" }
```

---

## 8. GET 反馈统计 / POST 校准

```
GET /api/v1/fitness/feedback/stats
```

用于个人中心「校准数据是否足够」类文案（字段见 `FitnessFeedbackStatsResponseDto`）。

```
POST /api/v1/fitness/calibrate
```

无 body。响应：

```typescript
{
  success: boolean
  calibrated: boolean
  message: string
  profile?: FitnessProfile   // calibrated=true 时带回
}
```

无足够反馈时：`calibrated: false`，`message` 提示稍后再试。

---

## 9. 错误与状态

| 场景 | HTTP | 客户端 |
|------|------|--------|
| 未登录 | 401 | 走会话刷新 |
| 查他人 profile | 403 | 仅展示本人 |
| 字段越界 / 校验失败 | 400 | Toast 回问卷 |
| 尚未问卷（profile） | 200 + `hasProfile:false` | 引导问卷，勿当致命错误 |

---

## 10. iOS 接入要点

1. Repository 建议：`FitnessProfileRepository`
   - `fetchQuestionnaire(locale:)`
   - `submitQuestionnaire(_:)`
   - `fetchProfile()` → `enum { none(message), ready(FitnessProfileViewData) }`
   - `submitTripFeedback(...)` / `calibrate()`
2. `userId` **全部从 JWT 推导**，勿在 body / path 伪造他人 ID  
3. 等级枚举用服务端字符串，中文描述用 `levelDescription` / `confidenceDescription`（勿本地硬翻等级）  
4. 规划期「体力」文案若来自 `planning/team-status`，那是入职/偏好完成度，**补做本问卷**后才能抬升体能置信度  
5. 提交成功后：缓存 `profile`，并广播刷新依赖体能的规划读模型（若行程已打开）

---

## 11. 验收清单

- [ ] 无画像时 `GET profile` → `hasProfile: false`，进入问卷  
- [ ] 问卷 4 题（3 + 年龄）选项与 GET questionnaire 一致，`value` 原样回传  
- [ ] submit 后 `profile.fitnessLevel` / `recommendedDaily*` 可展示  
- [ ] 再次 `GET profile` 与 submit 返回的 profile 一致  
- [ ] feedback `actualEffortRating` 仅 1/2/3  
- [ ] calibrate：无反馈不崩溃，有反馈时可选更新 UI  

---

## 12. 相关代码

| 文件 | 说明 |
|------|------|
| `src/trips/decision/controllers/fitness-assessment.controller.ts` | HTTP |
| `src/trips/decision/dto/fitness-assessment.dto.ts` | DTO |
| `src/trips/decision/services/fitness-assessment.service.ts` | 问卷常量 + 画像投影 |
| `src/trips/decision/models/human-capability.model.ts` | 能力模型 |
| `scripts/test-fitness-api.ts` | 接口自检脚本说明 |
| Phase 2 | `fitness-analytics.controller.ts`（首版可跳过） |
| 决策风格（勿混） | `src/trips/decision-profiling/DECISION_PROFILING_API.md` |
