# PRD 3.1.3 身份资产授信与隐私保护规范

Decision OS · Odyssey Intake / Match Square · 归档版  
**前置依赖**：§3.1.2 身份背书资产（Verified Credentials 数据模型）

---

## 1. 设计原则

在陌生人社交与拼车场景下，**自封高管**或**口头高学历**无法建立信任，反而增加防备。学历与工作背景作为 Decision OS 核心背书资产，必须通过**技术手段闭环验证**；同时避免做成「猎头招聘」或「相亲 App」——用户是来找同频旅伴，不是来拓展职场人脉。

| 底线 | 说明 |
|------|------|
| 授信闭环 | 未通过后台校验的用户**不得**自主填写并展示社会背景 |
| 隐私脱敏 | 严禁存储/展示校名、专业、毕业年份、身份证号、公司全称 |
| 模糊化标签 | 只展示**阶层与认知圈层**，不暴露具体物理雇主信息 |
| 防爬渲染 | 已认证标签前端以**矢量组件 + 微弱水印**渲染，禁止纯文本可复制 |

---

## 2. 学历认证：学信网在线验证码

### 2.1 用户流程

1. Identity Hub 提供「学信网一键认证」入口（**禁止**截图上传毕业证）
2. 用户输入学信网**在线验证码**（CHSI verification code）
3. 后端经合规第三方 API / 授权通道校验最高学历状态
4. 校验通过后写入脱敏标签，My Profile 与搭子广场 Card 点亮授信高光

### 2.2 后台存储（白名单字段）

| 字段 | 允许值 |
|------|--------|
| `degreeLevel` | `bachelor` / `master` / `doctor` |
| `tierTag` | `985_211` / `qs_top50` / `overseas` / `general` |
| `verificationChannel` | `xuexin_online_code` |
| `verifiedAt` | ISO 时间戳 |

**严禁留存**：校名、专业、毕业年份、身份证号、验证码原文（校验后立即丢弃）。

### 2.3 前端外显（Verified Badge）

| 条件 | 展示示例 |
|------|----------|
| 档次为 985/211 | `🎓 985/211(已认证)` |
| 档次为 QS Top 50 | `🎓 QS Top 50(已认证)` |
| 海归 | `🎓 硕士(海归)(已认证)` |
| 普通 | `🎓 硕士(已认证)` |

标签右侧追加极简微标 `✓` 或 Apple Wallet 风格「已认证」动效；API 返回 `badge.renderHint: vector_component_watermark`。

---

## 3. 工作资历：多通道组合授信

用户**任选一种**通道激活工作背书即可。

### 通道 A — 企业邮箱反向验证（推荐）

1. 用户输入官方工作邮箱（如 `name@tencent.com`）
2. `POST .../profession/email/send-code` → 6 位验证码
3. 用户输入验证码 → `POST .../profession/email/verify`
4. 系统通过**二级域名字典**映射 `industryTag` + `companyTierTag`（不存公司全称）

### 通道 B — 工牌/在职证明 OCR（脱敏）

1. 用户上传工牌或名片照片
2. OCR 提取企业名称与职位 → 人工/AI 审核
3. **审核通过后立即销毁原始图片**
4. 映射为模糊标签写入 `verified_credentials`

### 通道 C — 第三方职场平台 OAuth

- 支持脉脉 / LinkedIn 等 OAuth 2.0 一键授权
- 仅读取「实名在职」状态 + 行业/职级桶，不拉取完整简历

---

## 4. 模糊化标签规范（去具体化 / 去窥探化）

| 真实信息（后台 OCR/OAuth 短暂接触） | 前端外显 |
|--------------------------------------|----------|
| 腾讯 · AI 产品总监 | `👨‍💻 泛科技·产品总监(已认证)` |
| 某制造集团 · 解决方案专家 | `🏭 知名制造集团·解决方案专家(已认证)` |
| 仅邮箱验证、未知职级 | `👨‍💻 泛科技·头部大厂(已认证)` |

**禁止出现**：雇主商标、公司全称、具体 BU/部门、可反查个人的组合信息。

---

## 5. API 契约（后端已实现）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/odyssey-intake/credentials/education/verify` | 仅 `verificationCode`（学信网） |
| POST | `/api/odyssey-intake/credentials/profession/email/send-code` | 发送邮箱验证码 |
| POST | `/api/odyssey-intake/credentials/profession/email/verify` | 校验邮箱验证码 |
| POST | `/api/odyssey-intake/credentials/profession/oauth/verify` | 脉脉 / LinkedIn 授权 |
| POST | `/api/odyssey-intake/credentials/profession/badge/upload` | 工牌/名片上传 → `imageToken` |
| POST | `/api/odyssey-intake/credentials/profession/badge/verify` | 工牌 OCR token（异步审核） |
| GET | `/api/odyssey-intake/credentials/gateway/status` | 各通道 stub/production 状态（运维） |
| GET | `/api/odyssey-intake/credentials/me` | Identity Hub 只读视图 |

前端集成细节见 [frontend-integration-guide.md](./frontend-integration-guide.md) §8–§9。

---

## 6. 研发验收清单

- [ ] 用户无法在未授信时手动填写学历/职业并展示
- [ ] 数据库 `extendedProfile.verified_credentials` 无校名/公司全称字段
- [ ] 所有 `displayTag` 含 `(已认证)` 且带 `badge.renderHint`
- [ ] 邮箱验证码 10 分钟过期；OCR 原图不落库
- [ ] Match Square 卡片 `verifiedCredentials` 与 Identity Hub 一致
- [ ] 前端标签组件使用矢量 + 水印（非 `<span>` 纯文本）

---

## 7. 与 §3.1.2 的关系

| §3.1.2 | §3.1.3 |
|--------|--------|
| 定义「展示什么字段」 | 定义「如何授信 + 如何脱敏展示」 |
| `VerifiedCredentialsView` 结构 | 多通道 verify API + `badge` + `verificationChannel` |
| Match Square 圈层同频 +8%/+10% | 仅对 `verified: true` 的 fuzzy 标签生效 |
