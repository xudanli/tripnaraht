# Reputation OS 前端集成指南

Decision OS · 行后互评与信用资产 · v2.0.0 (P2)  
本仓库无前端工程，以下为 **API 契约驱动的集成说明**。

---

## 1. 你要改什么（一句话）

行程 **endDate + 48h** 后强触达「给你的旅伴打个分吧」；用户完成 **5 题五星问卷** 后，信用星级与标签云沉淀到 **个人主页**，队长审批时展示 **安全预警**。

**前置依赖**：[Match Square](./match-square/frontend-integration-guide.md) 成行（至少 1 名已通过队员 + 队长）。

---

## 2. 触达流程（PRD 5.1）

```
App 启动 / Push 点击
  → GET  /api/reputation-os/pending-surveys
  → 若 campaigns.length > 0：全局顶层弹窗（modalPriority: global_top）
  → 展示 pushCopy.title：「旅行已结束，给你的旅伴打个分吧」

每位旅伴单独提交：
  → GET  /api/reputation-os/survey/questions   （题干，可缓存）
  → POST /api/reputation-os/surveys/submit     （每位 reviewee 一次）

被评价用户画像微调 + 卡片流光：
  → 下次 GET /api/odyssey-intake/profile/card 可能 showShimmerRefresh=true
  → POST /api/odyssey-intake/profile/ack-refresh
```

Cron：后端每小时扫描 `endDate + 48h` 已到期的招募帖并创建 campaign（无需前端触发）。

---

## 3. TypeScript 类型

```typescript
export type ReputationSurveyQuestion = {
  id: string;
  order: number;
  text: string;
  mapsTo: string;
};

export type PendingSurveyCampaign = {
  id: string;
  postId: string;
  destinationLabel: string | null;
  tripEndDate: string;
  pushCopy: { title: string; modalPriority: 'global_top' };
  companionsToRate: Array<{
    userId: string;
    displayName: string;
    cardTitle: string | null;
    alreadyRated: boolean;
  }>;
  isComplete: boolean;
};

export type UserReputationAssets = {
  userId: string;
  averageStars: number | null; // 如 4.9，无评价时为 null
  surveyCount: number;
  tagCloud: string[];          // 如 ["极度守时", "神仙旅伴"]
  safetyWarning?: string | null; // 仅队长 / 内部场景
  updatedAt: string | null;
};

export type SubmitSurveyBody = {
  campaignId: string;
  revieweeUserId: string;
  q1Overall: 1 | 2 | 3 | 4 | 5;
  q2PaceSync: 1 | 2 | 3 | 4 | 5;
  q3Communication: 1 | 2 | 3 | 4 | 5;
  q4Spending: 1 | 2 | 3 | 4 | 5;
  q5WouldAgain: 1 | 2 | 3 | 4 | 5;
};
```

---

## 4. 五星问卷（PRD 5.2）

| 字段 | 题干 |
|------|------|
| `q1Overall` | 总体而言，你对这次同行的体验打几分？ |
| `q2PaceSync` | 旅行节奏（暴走/松弛/作息）有多同步？ |
| `q3Communication` | 出现分歧时，沟通顺畅吗？ |
| `q4Spending` | 行中花费默契程度如何？ |
| `q5WouldAgain` | 下次还愿意和这个人组队吗？ |

每题 **1–5 星**，全部必填。

---

## 5. API 示例

### 待办互评（弹窗数据源）

```bash
curl "$API/api/reputation-os/pending-surveys" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": {
    "campaigns": [{
      "id": "…",
      "postId": "…",
      "destinationLabel": "西北环线",
      "tripEndDate": "2026-07-10",
      "pushCopy": {
        "title": "旅行已结束，给你的旅伴打个分吧",
        "modalPriority": "global_top"
      },
      "companionsToRate": [
        { "userId": "…", "displayName": "王小野", "alreadyRated": false }
      ],
      "isComplete": false
    }]
  }
}
```

### 提交互评

```bash
curl -X POST "$API/api/reputation-os/surveys/submit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "…",
    "revieweeUserId": "…",
    "q1Overall": 5,
    "q2PaceSync": 4,
    "q3Communication": 5,
    "q4Spending": 4,
    "q5WouldAgain": 5
  }'
```

对 `companionsToRate` 中每位 `alreadyRated === false` 的旅伴各提交一次。

### 个人主页信用资产

```bash
curl "$API/api/reputation-os/profile/me" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": {
    "userId": "…",
    "averageStars": 4.9,
    "surveyCount": 12,
    "tagCloud": ["极度守时", "消费观合拍", "神仙旅伴"],
    "safetyWarning": null,
    "updatedAt": "2026-07-13T08:00:00.000Z"
  }
}
```

他人主页（脱敏，无 safetyWarning）：

```bash
curl "$API/api/reputation-os/users/$USER_ID/profile"
```

---

## 6. 队长审批安全预警（PRD 5.4）

Match Square 审批列表 **已自动注入** `safetyWarning` 与实时 `applicantReputationStars`。

也可单独查询：

```bash
curl "$API/api/reputation-os/users/$USER_ID/safety" \
  -H "Authorization: Bearer $TOKEN"
```

示例文案：

- `该用户近期收到偏低互评，建议队长进一步沟通确认`
- `该用户历史存在放鸽子/计划执行度极低记录，审批前请谨慎确认`

---

## 7. 与 Odyssey / Match Square 的关系

| 系统 | 职责 |
|------|------|
| Match Square | 成行组（队长 + 已通过队员）→ 触发 campaign |
| Reputation OS | 48h 问卷、星级、标签云、安全降权 |
| Odyssey Intake | 低分/高分互评 → 雷达图微调 + 流光刷新 |

旧版 tag 互评 `POST /api/odyssey-intake/peer-feedback` 仍可用；**新行程优先走 Reputation OS 五星问卷**。

---

## 8. 尚未实现（P3 已完成）

Match Learning 每周 Soft Weights 自迭代已实现，见 [match-learning/frontend-integration-guide.md](../match-learning/frontend-integration-guide.md)。

- `GET /api/match-learning/weights` — 当前生效权重
- 每周一 04:00 UTC Cron 自动迭代

---

## 9. Swagger

本地开发：`GET /api/docs` → 标签 **reputation-os**
