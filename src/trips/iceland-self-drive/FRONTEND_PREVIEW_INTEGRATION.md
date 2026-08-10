# Iceland Initial Plan — Frontend 最小接入契约

## 目标

向导完成后：Preview → Confirm → **Apply（写入 Iceland PlanVersion）**。  
Apply **不是** OR-Tools 权威优化闭环。

## 页面流

```text
[向导] → POST shell → POST proposals → GET preview
[Preview]  canConfirm? → 勾选 blockingApply → POST confirm
[Confirmed] canApply? → POST apply
[Applied]  展示已写入；禁止再 Apply
         → 之后才用 prismaTripId 调 bootstrap / arrange / attraction-explore
```

### TripShell vs 正式 Trip（iOS 必读）

| | Trip Shell（预览） | 正式 Trip（Apply 后） |
|--|-------------------|----------------------|
| id 形态 | `trip_` + 短 hex（如 `trip_718d77e8d3774684`） | UUID（Prisma `Trip.id`） |
| 存活 | **进程内存**（`IcelandTripShellRepository`） | DB |
| 可用 API | **仅** `/api/iceland-self-drive/trips/:tripId/...`（含 **driving-settings** GET/PATCH） | `/api/trips/:id/...`、`/api/mobile/trips/...`、bootstrap 等 |

### 会踩的坑

| 错误 | 原因 | 正确做法 |
|------|------|----------|
| `404 行程 … 不存在`（attraction-explore / `/api/trips/...`） | 拿 **shell id** 打正式行程 API | Apply 成功后用返回的 **prismaTripId** |
| `401` / `TRIP_NOT_FOUND` 打 driving-settings | 旧逻辑只查 Prisma；或鉴权与 shell 不一致 | Shell 上用与 Preview **相同**鉴权（Bearer 或 `x-owner-id`）；路径仍是 `…/trips/:shellTripId/driving-settings` |
| `403 Not trip owner` | JWT / `x-owner-id` 与创建 shell 时不一致 | Preview 全程同一用户；本地调试固定同一个 `x-owner-id` |
| 服务重启后 shell 丢失 | 内存仓库 | 重新走向导 → 再 create shell |

### 鉴权

- 生产：`Authorization: Bearer <token>`（创建 shell、preview、**shell driving-settings** 必须同一用户）
- 本地：`x-owner-id: <owner>`（全程同一个值）

### Shell driving-settings

- `GET/PATCH /api/iceland-self-drive/trips/:tripId/driving-settings` 对 **memory shell**（`trip_*`）可用
- PATCH 会 bump `contextVersion` / `contextHash`，旧 proposal 标 SUPERSEDED，并**自动重算 Preview**（响应含 `previewRegenerated`、`activeProposalId`、`contextHash`）
- Apply 之后请改用正式 Trip 的 driving-settings（Prisma）

### 区域覆盖（`coverageSummary`）

- `countsTowardAttractionCoverage` = **已排进草案**且计入景点覆盖的去重点数，不是目录 POI 总量
- 体验产品（蓝湖门票 / 观鲸 / 高地超级吉普）在「需确认项」，**不计入**该数字
- 创建时可不填车型；高地仍可出草案（seed 为 WARN）。完善自驾设置后 VERIFY 再收紧；仅当用户显式拒绝四驱/F-road 时高地才被 BLOCK
- Þórsmörk 以体验产品（`exp_thorsmork_superjeep`）出现在需确认项，**不**作为自驾硬门禁景点
- 需确认文案：`exp_thorsmork_superjeep` 会标明「超级吉普 / 向导体验增强、非自驾过河硬门禁」（见 `confirmations[].message`）
- 高地需独占整天；求解器会优先为已选 `highlands` 占支线日。若仍为 0，看 decisions 里 `CAPACITY_OR_DAY_SCOPE` / `HIGHLANDS_GATE`，提示加天、少选区域或完善四驱
- 黄金圈 Golden Set：经典三件套 + 二级点（Kerið / Brúarfoss / Faxafoss / Fontana）；`coverage` 可 > 3
- 编排会用坐标估算 **日内 POI 间距** 与 **隔夜衔接**：优先用过夜酒店作锚点（`startAnchor` → 首点、末点 → `endAnchor`），无酒店时回退「前一日最后一点 → 次日第一点」；**入境日**晨起用 `startLocationCode`（默认 KEF `381221`），**出境日**收尾用 `endLocationCode`；按酒店/机场锚定近邻重排当日顺序；`drivingMinutes` 含机场↔景点↔酒店腿。`startAnchor`/`endAnchor` 仍只表示过夜住宿。尚未接真实路网 ETA。

### 过夜锚点（已订 + Golden Set 软推荐）

**已订（硬）** — Create shell / create trip 传 `confirmedLodgings`（或 bookings `kind: lodging`）：

```json
{ "placeId": 381045, "label": "Vík Hostel", "nightDate": "2026-07-23" }
```

- 有 `nightDate` → 只占该夜；无日期 → 填满尚未被占用的夜
- `endAnchor.source = "CONFIRMED_BOOKING"`
- Preview `days[].endAnchor` / `startAnchor` 会原样返回（含 `placeId`、`label`、`nightDate`、`source`），前端据此展示过夜酒店
- 部分夜未覆盖 → WARN + Golden Set 软填，**不**整单闷杀；无效 place → `blockingIssues` 含 `ICELAND_LODGING_ANCHOR_001`（带 dayIndex / placeId / nightDate）

**Golden Set 软推荐** — 未覆盖的夜，从区域包 `entityType: LODGING`（如 Vík Hostel）按当日 `packIds` / `regionId` 选过夜：

- `endAnchor.source = "GOLDEN_SET_SOFT"`
- 同区域尽量 sticky（连住同一酒店）
- **不**用 `TOWN_HUB` 当酒店；**不**从全库 HOTEL 乱推（避免无图/错点）

住宿目录：`GET /api/iceland-self-drive/bookable-places?kind=lodging` → `imageUrl` + **`anchorEligible`** + **`bookingUrl`** / **`bookingLinks`**

- `anchorEligible: true` — Golden Set `LODGING`（如 Vík Hostel `381045`），可作为过夜 `endAnchor`
- `anchorEligible: false` — 目录里其它酒店仍可展示/选择，但确认后 Shadow / Platform 可能以 `ICELAND_LODGING_ANCHOR_001` **拒绝**（非 Golden Set）
- `kind=activity` 时 `anchorEligible` 恒为 `false`；`bookingUrl` / `bookingProvider` / `bookingCtaLabelZh` 为 `null`，`bookingLinks` 为 `[]`
- 住宿行：
  - `bookingUrl` / `bookingProvider` / `bookingCtaLabelZh` — **主 CTA**（有官网优先官网，否则 Booking.com）
  - `bookingLinks[]` — 多渠道：`{ provider, url, labelZh }`
    - `official`（若 Place.metadata 有官网）
    - `booking_com` — Booking.com 搜索/深链
    - `airbnb` — Airbnb 搜索/深链
    - `trip_com` — Trip.com 酒店搜索/深链
  - 前端：酒店 POI 可展示「Booking / Airbnb / Trip」按钮组，各自打开对应 `url`；主按钮仍可用 `bookingUrl`

## 状态机（建议）

```ts
type FeState =
  | 'idle'
  | 'creating_shell'
  | 'shell_ready'
  | 'generating_preview'
  | 'preview_ready'
  | 'preview_blocked'
  | 'confirming'
  | 'confirmed'
  | 'applying'
  | 'applied'
  | 'error';
```

| 后端 `status` | FE | UI |
|---------------|----|----|
| VERIFIED / VERIFIED_WITH_CONFIRMATIONS | preview_ready | Confirm（若 canConfirm） |
| CONFIRMED | confirmed | Apply CTA |
| APPLIED | applied | 已写入徽章 |
| BLOCKED | preview_blocked | 无 Confirm/Apply |

## 能力位（唯一门禁）

```ts
const ui = previewUiFlags(preview);
// 禁止：用 status / calibration 硬猜；必须看 capabilities
if (ui.showConfirmCta) { /* confirm */ }
if (ui.showApplyCta) { /* apply with contextVersion/Hash */ }
```

## Calibration（Shadow vs 平台）— 前端要做什么

Preview 响应现含可选字段：

```ts
preview.calibration?.shadowVsPlatform: {
  gateAligned: boolean;
  mappedAligned: boolean;
  iceland: { allowConfirm; aggregateOutcome };
  platform: {
    allowConfirm;
    overallStatus;
    gateway?: { overallStatus; allowConfirm; gateAlignedWithShadow };
  };
  unmappedIcelandCids: string[];
  doesNotAffectCapabilities: true; // 恒为 true
  notes: string[];
  postApplyBundle?: { /* Apply 后才有 */ };
}
```

完整报告（可选）：  
`GET …/proposals/:proposalId/shadow-vs-platform`

Apply 响应另含：`calibration.postApplyBundle`（`buildBundle` 二次对照摘要）。

### 必须做

无。对照**不改变** Confirm / Apply。继续只认 `capabilities.canConfirm` / `canApply`。

### 建议做（产品/调试）

| 场景 | UI |
|------|-----|
| `gateAligned === false` | 开发者/内部徽章（`showCalibrationDriftBadge`） |
| `platform.gateway` 且 `gateCompareSkipped` | **不**算 Confirm 漂移（完整性 UNVERIFIED） |
| `platform.gateway?.gateAlignedWithShadow === false` 且未 skip | 同上，标注 Gateway 腿（INFEASIBLE 等） |
| Apply 后 `postApplyBundle.gateAlignedWithShadow === false` | 内部「物化漂移」提示，**不**撤销 Apply |
| `unmappedIcelandCids`（day-scope 等） | 展示 notes；河渡 / 住宿锚点已 converge |
| 正式用户预览页 | **可完全忽略** `calibration` |

### 禁止做

- `if (!calibration.gateAligned) disable Confirm`
- 用 `platform.allowConfirm` 替代 `capabilities.canConfirm`
- 把对照文案写成「平台已否决行程」

## Typed Client

```ts
import {
  IcelandInitialPlanPreviewClient,
  previewUiFlags,
  buildConfirmAckPayload,
} from '@/trips/iceland-self-drive/clients/iceland-initial-plan-preview.client';

const client = new IcelandInitialPlanPreviewClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE!,
  getAccessToken: () => auth.getToken(),
});

const { shell, preview } = await client.createShellAndLoadPreview({ shell: {…} });
const ui = previewUiFlags(preview);

if (ui.showConfirmCta) {
  const confirmed = await client.confirmProposal(
    preview.tripId,
    preview.proposalId,
    buildConfirmAckPayload(preview),
  );
  if (confirmed.applyAllowed) {
    await client.applyProposal(preview.tripId, preview.proposalId, {
      contextVersion: shell.contextVersion,
      contextHash: shell.contextHash,
    });
  }
}

// optional: ui.showCalibrationDriftBadge → internal panel only
```

## 文档

- Confirm：[`INITIAL_PLAN_CONFIRM.md`](./INITIAL_PLAN_CONFIRM.md)
- Apply：[`INITIAL_PLAN_APPLY.md`](./INITIAL_PLAN_APPLY.md)
- Contrast：[`INITIAL_PLAN_SHADOW_VS_PLATFORM.md`](./INITIAL_PLAN_SHADOW_VS_PLATFORM.md)
- Preview HTTP：[`INITIAL_PLAN_PREVIEW_HTTP.md`](./INITIAL_PLAN_PREVIEW_HTTP.md)

## 不要做的事

- 未 Confirm 就 Apply
- **Apply 前**用 shell id 调 `/api/trips/...`、`attraction-explore`、`bootstrap`
- 混用两个用户的 token / `x-owner-id` 读写同一 shell
- 宣称 OR-Tools / 权威优化已完成
- 忽略 `blockingApply` 直接 Confirm
- 用错误 `contextHash` 硬 Apply
- 用 `calibration.gateAligned` 改写 Confirm/Apply
