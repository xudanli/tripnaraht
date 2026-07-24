# Odyssey Intake 前端集成指南

Decision OS · 旅行人格匹配平台 · **v2.0.0（Premium Intake）**  
本仓库无前端工程，以下为 **API 契约驱动的集成说明**。

---

## 1. 你要改什么（一句话）

**My Profile 头部 1/3** 固定渲染「旅行人格卡片」；首次入网走 **MBTI 自选 → 硬核背书 → Premium Stress Test → 安全授权 → 名片 → 旅伴列表**；**严禁**把入口放进 Settings 二级页。  
**v1 五题小白场景测评已下线**，请勿再集成。

---

## 2. 推荐用户流程（v2 Premium Intake）

```
首次进入
  → GET  /api/odyssey-intake/onboarding/status          （判断跳哪一步）
  → GET  /api/odyssey-intake/mbti/types                 （16 型 Apple Wallet 卡片选择器）
  → POST /api/odyssey-intake/mbti/select                （环节 1：一键点亮 MBTI）
  → POST /api/odyssey-intake/credentials/education/verify
  → POST /api/odyssey-intake/credentials/profession/... （环节 2：学信网 + 职场授信）
  → GET  /api/odyssey-intake/premium-stress-test/questions
  → POST /api/odyssey-intake/premium-stress-test/submit   （环节 3：3 道行中博弈题）
  → POST /api/odyssey-intake/trust/verify               （实名 / 芝麻信用）
  → PATCH /api/odyssey-intake/trip-meta
  → POST /api/odyssey-intake/match

或合并 MBTI + 博弈题：
  → POST /api/odyssey-intake/submit                     （mbtiType + 3 题 answers）
  → POST /api/odyssey-intake/submit-and-match           （已 trust 时一次返回 matches）
```

### onboarding/status 步骤机

| nextStep | 含义 |
|----------|------|
| `mbti_select` | 展示 16 型卡片，文案：「已知自己的旅行人格？直接一键点亮。」 |
| `credentials` | 学信网 + 企业邮箱/OAuth/工牌授信 |
| `premium_stress_test` | 3 道高端行中博弈题 |
| `trust_verify` | 芝麻信用 / 实名 |
| `match` | 可进入契合旅伴 / 搭子广场 |

```typescript
export type OdysseyOnboardingStatus = {
  quizComplete: boolean;
  mbtiSelected: boolean;
  premiumStressComplete: boolean;
  credentialsVerified: boolean;
  trustVerified: boolean;
  cardReady: boolean;
  canMatch: boolean;
  intakeVersion?: 1 | 2;
  nextStep?:
    | 'mbti_select'
    | 'credentials'
    | 'premium_stress_test'
    | 'trust_verify'
    | 'match'
    | 'quiz'; // 仅 v1 历史用户
};
```

### Premium Stress Test 场景 ID

| scenarioId | 测试维度 |
|------------|----------|
| `resource_scarcity_replan` | 品质底线 / 风险偏好 vs 安全优先 |
| `convoy_division_collaboration` | 全托管主导 vs 一起策划协同 |
| `premium_upcharge_decision` | 消费弹性 / 独立度 vs 团队妥协 |

**务必使用 `GET /premium-stress-test/questions` 返回的 `id` 字段**，不要硬编码。若前端仍发送旧 alias，服务端会自动映射：

| alias（兼容） | canonical |
|---------------|-----------|
| `resource_crunch` | `resource_scarcity_replan` |
| `convoy_division` / `convoy_chaos` | `convoy_division_collaboration` |
| `premium_upcharge` / `premium_consumption` | `premium_upcharge_decision` |

提交后响应含 `travelCollaborationGene`：`full_managed_leader` | `co_planning_partner` | `passive_experiencer` | `team_compromiser`。

**v1 老用户升级**：若 `onboarding/status` 返回 `intakeVersion: 1` 且 `premiumStressComplete: false`，应走 v2 升级（credentials → premium_stress_test）。服务端已允许 v1 完成用户提交 Premium Stress Test，画像会升级为 `version: 2`。

---

## 3. 旧版说明（v1，已废弃）

<details>
<summary>v1 五题流程（勿再接入）</summary>

```
  → GET  /api/odyssey-intake/questions   （现返回 deprecated + Premium 题库）
  → POST /api/odyssey-intake/submit/legacy （返回 VALIDATION_ERROR）
```

已有 `version: 1` 画像的用户数据仍可读；新用户一律走 v2。

</details>

---

### My Profile 常驻卡片

```
GET /api/odyssey-intake/profile/card
```

- `ui.placement === 'profile_header_third'`：布局约束
- `ui.showShimmerRefresh === true`：行后互评后播放流光动效，展示 `refreshMessage`
- `ui.gyroscopeEnabled === true`：CSS 3D Transform + 陀螺仪（Apple Wallet 质感）
- `ui.cta`：右下角「调整本次出行状态」→ `PATCH /api/odyssey-intake/trip-intent`

---

## 3. TypeScript 类型（建议复制到前端）

```typescript
export type OdysseyOnboardingStatus = {
  quizComplete: boolean;
  trustVerified: boolean;
  cardReady: boolean;
  canMatch: boolean;
  nextStep?: 'quiz' | 'trust_verify' | 'view_card' | 'match';
};

export type OdysseyIdentityCard = {
  mbtiType: string;
  title: string;
  subtitle: string;
  theme: {
    quadrant: 'NT' | 'NF' | 'SP' | 'SJ';
    gradientFrom: string;
    gradientTo: string;
    accentColor?: string;
  };
  radar: Record<string, number>; // 0–100，雷达图 8 维
};

export type OdysseyProfileCardView = {
  completed: boolean;
  profile: {
    mbtiType: string;
    card: OdysseyIdentityCard;
    tripIntentTags?: string[];
    profileRefreshPending?: boolean;
    profileRefreshMessage?: string;
  } | null;
  tripMeta: { destination: string; startDate: string; endDate: string } | null;
  trust: { verified: boolean; provider?: string } | null;
  ui: {
    placement: 'profile_header_third';
    showShimmerRefresh: boolean;
    refreshMessage?: string;
    gyroscopeEnabled: boolean;
    cta: { label: string; action: 'trip_intent' };
    tripIntentTagOptions: Array<{ id: string; label: string }>;
  };
};

export type OdysseyQuestion = {
  id: string;
  order: number;
  title: string;
  scenario: string;
  wallpaperKey: string;
  wallpaper: { key: string; url: string; blurHash?: string };
  options: Array<{ id: 'A' | 'B' | 'C'; label: string }>;
};

export type CompanionMatch = {
  userId: string;
  mbtiType: string;
  cardTitle: string;
  compatibilityScore: number;
  dimensionBreakdown: {
    eiFit: number;
    tfFit: number;
    energyFit: number;
    ambiguityFit: number;
  };
};
```

---

## 4. Card UI 渲染规范

### 四象限配色（Theming Engine）

| 象限 | gradientFrom | gradientTo | accent |
|------|--------------|------------|--------|
| NT | `#1C2E24` | `#0A1410` | `#3D5A47` |
| NF | `#D97746` | `#F5E6D3` | `#E8A87C` |
| SP | `#0A0A0A` | `#1A1A2E` | `#00D4FF` |
| SJ | `#2C3539` | `#8B7355` | `#A0927D` |

### 动效

1. **题目切换**：背景 `wallpaper.url` 交叉淡入（Cross-fade），文案 fade
2. **名片生成**：3D `perspective` + `rotateX/Y` 随 `deviceorientation` 微调
3. **流光刷新**：`showShimmerRefresh` 时卡片表面 `linear-gradient` 动画 2s loop
4. **匹配 loading**：「正在计算你的灵魂旅伴…」≤1.5s（后端 match 目标 <300ms）

### 壁纸 CDN

默认 base：`https://cdn.tripnara.com/odyssey/wallpapers`  
可通过环境变量 `ODYSSEY_WALLPAPER_BASE_URL` 覆盖（后端 `GET questions` 已解析完整 URL）。

---

## 5. 关键 API 示例

### 提交测评

```bash
curl -X POST "$API/api/odyssey-intake/submit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": [
      {"scenarioId":"budget_financial_tolerance","optionId":"A"},
      {"scenarioId":"ambiguity_tolerance","optionId":"A"},
      {"scenarioId":"energy_pace","optionId":"B"},
      {"scenarioId":"social_recharge","optionId":"C"},
      {"scenarioId":"aesthetic_meaning","optionId":"A"}
    ]
  }'
```

### 安全授权（占位，生产对接网关）

```bash
curl -X POST "$API/api/odyssey-intake/trust/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"provider":"zhima_credit","authToken":"..."}'
```

### 设置行程 Hard Gate 条件

```bash
curl -X PATCH "$API/api/odyssey-intake/trip-meta" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"destination":"Iceland","startDate":"2026-07-01","endDate":"2026-07-10"}'
```

### 调整本次出行状态（即时意向标签）

**推荐请求体**（前端当前格式）：

```bash
curl -X PATCH "$API/api/odyssey-intake/trip-intent" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tripIntentTag":"budget_mode"}'
```

兼容别名（任选其一）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `tripIntentTag` | string | **推荐**；写入 `tripIntentTags[0]` |
| `trip_intent_tag` | string | snake_case 单选 |
| `tripIntentTags` | string[] | 多标签数组 |
| `trip_intent_tags` | string[] | snake_case 数组 |

**响应**：完整 `OdysseyProfileCardView`（与 `GET profile/card` 同结构），已持久化。

```json
{
  "success": true,
  "data": {
    "completed": true,
    "profile": {
      "mbtiType": "INFP",
      "tripIntentTags": ["budget_mode"],
      "tripIntentTag": "budget_mode",
      "trip_intent_tag": "budget_mode",
      "trip_intent_tags": ["budget_mode"],
      "card": { "title": "...", "mbtiType": "INFP", "radar": {} }
    },
    "ui": {
      "tripIntentTagOptions": [
        { "id": "open_to_match", "label": "开放匹配" },
        { "id": "budget_mode", "label": "穷游模式" }
      ]
    }
  }
}
```

**契约要点**：

- `tripIntentTags[0]` = 当前选中 tag（胶囊「本次出行 · xxx」读 `ui.tripIntentTagOptions` 里对应 `label`）
- `ui.tripIntentTagOptions[].id` 与 PATCH 的 `tripIntentTag` 必须一致
- **会变**：`tripIntentTags`、胶囊文案、即时意向
- **不会变**：`card.title`、`card.mbtiType`、`card.radar`（底层人格，符合 PRD）

刷新后 `GET /api/odyssey-intake/profile/card` 必须带回相同 `tripIntentTags`。

---

## 6. 行后互评（数据回哺）

行程结束页埋点 → `POST /api/odyssey-intake/peer-feedback`

| tag | 画像修正 |
|-----|---------|
| `too_stingy` | financial_flexibility −1 |
| `always_late` | planning_index / J −1 |
| `great_communicator` | compromise_index / F +1 |

被评价用户下次打开 My Profile 时 `showShimmerRefresh=true`，确认后调 `POST /api/odyssey-intake/profile/ack-refresh`。

---

## 7. 与行程规划 INTAKE 的区别

| | Odyssey Intake | Trip INTAKE (`intake-phase.executor`) |
|--|----------------|--------------------------------------|
| 用途 | 旅行人格 / 旅伴匹配 | 冰岛行程约束澄清 |
| 入口 | My Profile 头部 | 规划对话 / route_and_run |
| 路径 | `/api/odyssey-intake/*` | Agent orchestrator 内部 |

两者互不替代，前端勿混用。

---

## 8. PRD 3.1.2 身份背书资产（Verified Credentials）

**Identity Hub** 建议放在 My Profile 卡片下方或「信任与安全」区块，与 `trust/verify` 并列。认证结果写入 `userTravelProfile.extendedProfile`；Match Square 卡片通过 `verifiedCredentials` 只读展示。

### 推荐流程（PRD 3.1.3 授信闭环）

```
My Profile → Identity Hub
  → POST /credentials/education/verify              （仅学信网在线验证码）
  → POST /credentials/profession/email/send-code    （通道 A：企业邮箱）
  → POST /credentials/profession/email/verify
  → 或 POST /credentials/profession/oauth/verify   （通道 C：脉脉/LinkedIn）
  → 或 POST /credentials/profession/badge/verify     （通道 B：工牌 OCR）
  → POST /trust/verify                              （芝麻信用）
  → GET  /credentials/me
```

完整规范见 [prd-3.1.3-asset-verification-privacy.md](./prd-3.1.3-asset-verification-privacy.md)。

### TypeScript 类型（补充）

```typescript
export type VerifiedBadgeMeta = {
  verified: boolean;
  badgeLabel: '已认证';
  badgeMark: '✓';
  /** 必须用矢量组件 + 水印渲染，禁止纯文本复制 */
  renderHint: 'vector_component_watermark';
};

export type VerifiedCredentialsBundle = {
  education?: {
    verified: boolean;
    degreeLevel: 'bachelor' | 'master' | 'doctor';
    tierTag: '985_211' | 'qs_top50' | 'overseas' | 'general';
    displayTag: string; // e.g. 🎓 985/211(已认证)
    verificationChannel: 'xuexin_online_code';
    badge: VerifiedBadgeMeta;
    verifiedAt: string;
  };
  profession?: {
    verified: boolean;
    industryTag: 'tech' | 'finance' | 'consulting' | 'manufacturing' | 'creative' | 'other';
    companyTierTag: string;
    roleLevelTag: string;
    displayTags: string[]; // 模糊标签，如 👨‍💻 泛科技·产品总监(已认证)
    verificationChannel: 'work_email' | 'badge_ocr' | 'oauth_maimai' | 'oauth_linkedin';
    badge: VerifiedBadgeMeta;
    verifiedAt: string;
  };
};
```

### 学历认证（学信网在线验证码）

```bash
curl -X POST "$API/api/odyssey-intake/credentials/education/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "verificationCode": "CHSI-ONLINE-CODE" }'
```

| 字段 | 说明 |
|------|------|
| `verificationCode` | 学信网在线验证码（**禁止**用户自选 degree/tier） |
| `authToken` | 兼容旧字段名，等同 verificationCode |

后端经合规网关回写 `degreeLevel` + `tierTag`，外显如 `🎓 985/211(已认证)`、`🎓 硕士(海归)(已认证)`。**严禁**存校名/专业/毕业年份。

### 工作资历 — 通道 A 企业邮箱

```bash
# Step 1 发送 6 位验证码
curl -X POST "$API/api/odyssey-intake/credentials/profession/email/send-code" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "workEmail": "name@tencent.com" }'

# Step 2 校验（开发环境 send-code 响应含 devCode）
curl -X POST "$API/api/odyssey-intake/credentials/profession/email/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "workEmail": "name@tencent.com", "verificationCode": "123456" }'
```

映射为模糊标签，如 `👨‍💻 泛科技·头部大厂(已认证)` — **不出现公司全称**。

### 工作资历 — 通道 B / C

```bash
# 工牌 OCR（imageToken 由 upload 接口换取；审核后销毁原图）
curl -X POST "$API/api/odyssey-intake/credentials/profession/badge/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "imageBase64": "...", "mimeType": "image/jpeg" }'

curl -X POST "$API/api/odyssey-intake/credentials/profession/badge/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "imageToken": "UPLOAD_TOKEN" }'

# 脉脉 / LinkedIn OAuth
curl -X POST "$API/api/odyssey-intake/credentials/profession/oauth/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "provider": "maimai", "authToken": "oauth-code" }'
```

`POST /credentials/profession/verify`（自选 industry/role）**已废弃**，返回 `VALIDATION_ERROR`。

### 芝麻信用（扩展）

在原有 `POST /trust/verify` 上增加可选 `creditScore`（350–950）：

```bash
curl -X POST "$API/api/odyssey-intake/trust/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "zhima_credit",
    "authToken": "...",
    "creditScore": 800
  }'
```

- 未传 `creditScore` 且 `provider=zhima_credit` 时，后端默认 **750**（良好）
- `creditScore >= 780` → tier `excellent` / label `极佳`
- `creditScore >= 650` → tier `good` / label `良好`
- headline 展示：`🛡️ 芝麻信用 800 (极佳)`

### 查询我的背书

```bash
curl "$API/api/odyssey-intake/credentials/me" \
  -H "Authorization: Bearer $TOKEN"
```

响应：`{ success: true, data: VerifiedCredentialsView }`。他人背书见 Match Square `GET /posts/:id` 的 `verifiedCredentials`。

### UI 契约

| 场景 | 读什么 |
|------|--------|
| Identity Hub 列表 | `headline.identityHeadline` + `headline.sesameCreditLine` |
| 信任档案抽屉 | `dossier.*` + `badge.renderHint` |
| 标签渲染 | **矢量 + 水印**；读 `badge.badgeMark` 展示 `✓` 微标 |
| 未认证占位 | 各块 `null` → 「去认证」CTA；**禁止**手动填学历/职业 |
| 与测评关系 | 背书**不改变** `card.mbtiType` / radar |

### 常见坑

| 现象 | 原因 | 处理 |
|------|------|------|
| 广场 Card 无背书行 | 未完成授信 API | `GET credentials/me` |
| 学历 400 | 仍传 `degreeLevel/tierTag` | 只传 `verificationCode` |
| 职业 400 | 调用旧 `/profession/verify` | 改用 email/oauth/badge 通道 |
| 邮箱 send-code 400 | 域名不在白名单 | 换 OAuth 或工牌通道 |
| headline 缺姓名 | 未完成实名/芝麻 | `trust/verify` |

Match Square 侧见 [match-square/frontend-integration-guide.md](../match-square/frontend-integration-guide.md) §14。

---

## 9. PRD 3.1.3 身份资产授信与隐私保护（摘要）

| 原则 | 要求 |
|------|------|
| 授信闭环 | 未验证不得展示社会背景 |
| 去具体化 | 禁止公司全称/校名；仅模糊圈层标签 |
| 防爬 | `renderHint: vector_component_watermark` |

归档全文：[prd-3.1.3-asset-verification-privacy.md](./prd-3.1.3-asset-verification-privacy.md)  
生产网关：[credential-gateway-production.md](./credential-gateway-production.md)

---

## 10. Swagger

本地开发：`GET /api/docs` → 标签 **odyssey-intake**
