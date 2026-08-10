# Contract — CTA strings & role matrix (Q8 freeze)

**Status:** FROZEN (2026-07-25)  
**Source decision:** [`../OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md) Q8  
**Owner:** PM

---

## 8.1 Final role matrix

| Role | Capture | View result | View plans | Confirm Apply | Notes |
| ---- | ------: | ----------: | ---------: | ------------: | ----- |
| Organizer | Y | Y | Y | Y | 受 Gate、行程状态和写权限约束 |
| Driver | Y | Y | Y | Conditional | 必须拥有 `CAN_CONFIRM_EXECUTION_CHANGE` |
| Member | Y | Y | Y | N | 可提交 Observation，不可 Apply |
| Advisor | N by default | Y | Y | N | 可查看与建议，不默认采集现场媒体 |

### Advisor clarification

```text
Advisor:
Capture = false by default
View result = true
View plans = true
Confirm Apply = false
```

企业版顾问远程上传材料须另授 `CAN_ATTACH_EVIDENCE`（≠ 现场 Capture）。

---

## 8.2 Driver Apply rule

须同时满足：

```text
role = DRIVER
and
tripPermission.CAN_CONFIRM_EXECUTION_CHANGE = true
and
device is not actively driving
and
proposal is not blocked
and
existing Preview confirms write authority
```

Driver 不可 Apply：行驶中；Gate = BLOCK；跨日结构；住宿；付费订单；Organizer 专属授权；仅导航权限。

---

## 8.3 Assessment status CTA table

### INFO

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 返回今日行程 | 查看识别依据 |
| English | Back to Today | View evidence |

### NOTICE

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 我知道了 | 查看影响 |
| English | Got it | View impact |

### NEED_CONFIRM

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 查看详情 | 稍后处理 |
| English | Review details | Decide later |

### SUGGEST_REPLACE

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 查看替代方案 | 保留当前计划 |
| English | View alternatives | Keep current plan |

“保留当前计划”仅关闭建议，不绕过 Gate。现状不可执行时不显示该 Secondary。

### EXECUTION_BLOCK

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 查看安全方案 | 联系求助 |
| English | View safe options | Get help |

禁止：继续 / 忽略 / 仍然前往 / 强制执行 / Keep current plan。

### UNKNOWN / INSUFFICIENT

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 补拍照片 | 查看已识别内容 |
| English | Take another photo | View detected details |

### CONFLICTING

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 查看冲突证据 | 稍后重新检查 |
| English | Review conflicting evidence | Check again later |

### No GPS

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 开启定位后重试 | 仅查看标志说明 |
| English | Enable location and retry | View sign explanation only |

### Upload / model retry

| Language | Primary CTA | Secondary CTA |
| -------- | ----------- | ------------- |
| 中文 | 重新分析 | 删除照片 |
| English | Try analysis again | Delete photo |

---

## 8.4 Capture page CTA

| Context | 中文 | English |
| ------- | ---- | ------- |
| Main shutter guidance | 拍下现场 | Capture scene |
| Confirm image | 使用这张照片 | Use this photo |
| Retake | 重新拍摄 | Retake |
| Add view | 再拍一张 | Add another photo |
| Submit | 提交给 NARA 判断 | Ask NARA to assess |
| Cancel | 取消 | Cancel |

---

## 8.5 Permission-denied copy

### Camera

**中文：** 需要相机权限才能拍摄现场。你也可以从相册选择已有照片。  
**English:** Camera access is required to capture the scene. You can also choose an existing photo.

| 中文 | English |
| ---- | ------- |
| 打开相机权限 | Enable camera |
| 从相册选择 | Choose from library |

### Location

**中文：** 开启定位后，NARA 才能确认你所在的道路或活动入口。不开启定位时，只能提供图片内容说明。  
**English:** Location is required to match the road or activity entrance. Without it, NARA can only explain what is visible in the photo.

| 中文 | English |
| ---- | ------- |
| 开启定位 | Enable location |
| 仅分析图片 | Analyze photo only |

---

## 8.6 Driving safety copy

**中文：** 当前车辆正在移动。请在安全停车后使用 NARA Look，或交由同行成员操作。  
**English:** The vehicle appears to be moving. Use NARA Look after stopping safely, or ask a passenger to operate it.

| 中文 | English |
| ---- | ------- |
| 稍后处理 | Do this later |
| 由同行成员操作 | Let a passenger continue |

不得提供“仍然打开相机”。

---

## 8.7 Apply authorization responses

### No Apply permission

**中文：** 你可以查看方案，但没有确认修改行程的权限。请由行程组织者处理。  
**English:** You can review the proposal, but you do not have permission to confirm itinerary changes. Ask the trip organizer to continue.

| 中文 | English |
| ---- | ------- |
| 通知组织者 | Notify organizer |
| 返回 | Back |

### Driver requires Organizer

**中文：** 该调整会影响住宿、订单或跨日安排，需要行程组织者确认。  
**English:** This change affects accommodation, bookings, or multiple days and requires organizer approval.

| 中文 | English |
| ---- | ------- |
| 请求组织者确认 | Request organizer approval |
| 查看方案 | Review proposal |
