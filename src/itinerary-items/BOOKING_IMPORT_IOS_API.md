# 住宿订单 / 预订导入 — iOS 契约

> Base：`/api/itinerary-items`  
> 适用：**住宿订单**与**活动订单**同一套导入契约；写回共用 `PATCH …/booking`。  
> 导入只抽出草稿，用户必须在核对页确认后再写回。  
> 最后更新：2026-07-23

---

## 有没有文档？

| 文档 | 内容 |
|------|------|
| **本文** `BOOKING_IMPORT_IOS_API.md` | 住宿/活动订单导入 + 写回（客户端已接） |
| [`FRONTEND_PREVIEW_INTEGRATION.md`](../trips/iceland-self-drive/FRONTEND_PREVIEW_INTEGRATION.md) | 冰岛 Preview 过夜锚点、`bookable-places?kind=lodging` |
| [`ADD_ACTIVITY_NEARBY_API.md`](./ADD_ACTIVITY_NEARBY_API.md) | 行程附近搜酒店 Chip `hotel` |
| [`ATTRACTION_EXPLORE_API.md`](../trips/attraction-explore/ATTRACTION_EXPLORE_API.md) | 探索图住宿 / lodging workbench |

---

## 入口与流程（住宿）

住宿订单 → 上传订单 → 选择：

1. **手动** — 直接填确认号 / URL，再 `PATCH …/booking`
2. **截图 · PDF** — `POST …/booking/documents`（`sourceHint=order_ocr`）
3. **邮件粘贴** — `POST …/booking/import`（`sourceHint=email_paste`）
4. **扫描邮件** — `POST …/booking/documents`（`sourceHint=email_ocr`）
5. **Booking 链接** — `POST …/booking/import`（`sourceHint=booking_url`）

→ 上传进度或文本页 → **核对页** → 保存（`PATCH …/booking`）

活动订单同一路径；核对页字段相同。

---

## 接口一览

| Method | Path | 用途 |
|--------|------|------|
| `POST` | `/{itemId}/booking/documents` | multipart：`file` + `sourceHint`（`order_ocr` / `email_ocr`） |
| `GET` | `/{itemId}/booking/documents/{docId}` | 轮询识别结果 |
| `POST` | `/{itemId}/booking/import` | JSON：`{ text, sourceHint }`（`email_paste` / `booking_url`） |
| `PATCH` | `/{itemId}/booking` | 写回确认号 / URL / 状态（核对页保存） |

`itemId` = 行程里该住宿（或活动）`ItineraryItem.id`。

---

## 1. 上传截图 / PDF

```http
POST /api/itinerary-items/{itemId}/booking/documents
Content-Type: multipart/form-data

file: <binary>
sourceHint: order_ocr   # 或 email_ocr
```

## 2. 轮询识别

```http
GET /api/itinerary-items/{itemId}/booking/documents/{docId}
```

MVP 上传后多为立即 `ready`；仍建议按 `processing` 轮询兼容。

## 3. 邮件粘贴 / Booking 链接

```http
POST /api/itinerary-items/{itemId}/booking/import
Content-Type: application/json

{
  "text": "Confirmation number: BLG-928471\nHotel: Vík Hostel\nCheck-in: 2026-08-01\nhttps://www.booking.com/confirmation/BLG-928471",
  "sourceHint": "email_paste"
}
```

```json
{
  "text": "https://www.booking.com/hotel/is/foo.html?confirmation_number=ABC12345",
  "sourceHint": "booking_url"
}
```

## 4. 核对页写回（住宿）

```http
PATCH /api/itinerary-items/{itemId}/booking
Content-Type: application/json

{
  "bookingStatus": "BOOKED",
  "bookingConfirmation": "BLG-928471",
  "bookingUrl": "https://www.booking.com/confirmation/BLG-928471"
}
```

| 字段 | 说明 |
|------|------|
| `bookingStatus` | `BOOKED` / `NEED_BOOKING` / `NO_BOOKING` |
| `bookingConfirmation` | 确认号（来自核对页 `draft.confirmation`） |
| `bookingUrl` | 预订链接（来自 `draft.bookingUrl`） |
| `bookedAt` | 可选，ISO 时间 |

导入接口**不会**写入这些字段。

---

## 响应 `data`（导入 / 轮询）

```json
{
  "docId": "uuid",
  "status": "ready",
  "fileName": "vik_hostel_order.pdf",
  "contentType": "application/pdf",
  "warnings": [],
  "draft": {
    "placeName": "Vík Hostel",
    "confirmation": "BLG-928471",
    "bookingUrl": "https://www.booking.com/confirmation/BLG-928471",
    "platform": "booking.com",
    "guestName": "Danny Wang",
    "checkInDate": "2026-08-01",
    "checkOutDate": "2026-08-03",
    "source": "order_ocr"
  }
}
```

| 字段 | 说明 |
|------|------|
| `status` | `ready` \| `processing` \| `failed` |
| `draft.confirmation` | → 核对后映射 `bookingConfirmation` |
| `draft.bookingUrl` | → 核对后映射 `bookingUrl` |
| `draft.checkInDate` / `checkOutDate` | 仅展示/校验；**不**经本 PATCH 写日程日 |
| `draft.placeName` / `guestName` / `platform` | 核对页展示；不写回 item booking 字段 |

常见 `warnings`：

- `confirmation_not_found`
- `place_name_not_found`
- `booking_url_not_found`
- `ocr_text_unavailable`（纯图片/扫描件、无可抽取文本）

---

## 服务端说明（MVP）

- **启发式抽取**（邮件正则 / Booking URL query / 文件名），非真实 OCR。
- 文档结果**进程内缓存**；进程重启后 `GET …/documents/{docId}` 可能 404。
- 无 `itemId` 对应行程项 → `404`。

---

## 客户端降级

`404` / `405` / `501` 或网络失败 → 本地启发式（文件名 / 邮件正则 / Booking URL query）生成草稿，并打：

- `api_unavailable_local_stub`
- `ocr_local_stub`

核对页提示：「服务端识别暂不可用」。

---

## 相关：冰岛住宿目录 / 过夜锚点（规划侧）

与「行程项订单导入」不同链路，供创建行程 / Preview 用：

```http
GET /api/iceland-self-drive/bookable-places?kind=lodging
```

- `anchorEligible: true` — Golden Set 住宿，可作过夜 `endAnchor`
- Create shell 可传 `confirmedLodgings` / `bookings[{ kind: "lodging", placeId, nightDate }]`

详见 Preview 集成文档中的「过夜锚点」一节。
