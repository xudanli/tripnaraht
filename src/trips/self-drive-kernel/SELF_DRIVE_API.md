# Self-Drive Kernel · 产品 API（K5）

> 架构：[ADR-SELF-DRIVE-KERNEL](../../../internal-docs/architecture/ADR-SELF-DRIVE-KERNEL.md)  
> 实现：`src/trips/self-drive-kernel/`  
> **状态：** K1–K5 门面已落地；旧 `/countries/CN/*`、`/iceland-self-drive/*` 仍兼容，新产品请走本门面。

## 原则

```
Self-Drive Kernel owns the decision logic.
Destination Pack owns local knowledge.
Evidence Adapter owns reality.
Projection owns user experience.
```

## 路径

相对 `baseURL`（已含 `/api`）：

```
GET  trips/{tripId}/self-drive/context
GET  trips/{tripId}/self-drive/readiness
GET  trips/{tripId}/self-drive/daily-drive
GET  trips/{tripId}/self-drive/road-segments
GET  trips/{tripId}/self-drive/advisories
GET  trips/{tripId}/self-drive/evidence
GET  trips/{tripId}/self-drive/alternatives

# 全球统一自驾设置（iOS 用 data.countryCode 分支）
GET   trips/{tripId}/self-drive/driving-settings
PATCH trips/{tripId}/self-drive/driving-settings
POST  trips/{tripId}/self-drive/driving-settings/preview-impact
POST  trips/{tripId}/self-drive/driving-settings/reevaluate

# 国家能力包（免登录）
GET   self-drive/capabilities?countryCode=IS

# 管理端
GET   trips/admin/{tripId}/self-drive/driving-settings
PATCH trips/admin/{tripId}/self-drive/driving-settings
```

旧路径 `/iceland-self-drive/trips/{tripId}/driving-settings*` 仍兼容；新产品请走本门面。

### Query

| 参数 | 说明 |
|------|------|
| `dayIndex` | 1-based，可选 |
| `date` | `YYYY-MM-DD`，可选，作 localDate |

### driving-settings 响应要点

```ts
{
  schemaId: 'tripnara.self_drive_driving_settings@v1'
  countryCode: 'IS' | 'CN' | 'NZ' | string
  destinationPackId: string
  capabilities: DestinationSelfDriveCapabilities  // iOS 按此决定展示项
  tripId, contextVersion, items: [...]            // 与旧 iceland 设置同形
}
```


## 主读：`daily-drive`

回答「今天这条自驾能不能按计划走」。

```ts
{
  schemaId: 'tripnara.self_drive_daily_drive@v1'
  localDate: string
  status: 'ON_PLAN' | 'NEED_ATTENTION' | 'SUGGEST_ADJUST' | 'BLOCKED'
  drive: {
    distanceKm?: number
    expectedDurationMin?: number
    difficulty: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'
    originLabel?: string
    destinationLabel?: string
  }
  criticalSegments: Array<{ segmentId, fromLabel, toLabel, ... }>
  advisories: DriveAdvisory[]   // 国家无关
  recommendation?: { action, titleZh, detailZh? }
  executabilityVerdict: 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'BLOCK'
  destinationPackId: string
  countryCode: string
}
```

## 与 overview-dashboard 关系

| 能力 | 接口 |
|------|------|
| 行中首屏 | `execution/overview-dashboard`（含 K4 `advisories` / `selfDriveKernel` 影子） |
| 自驾深度读 | **本门面** `self-drive/*` |
| 旧 CN catalog | `countries/CN/classic-self-drive-routes`（选线 UX，非裁决） |
| 旧 IS BFF | `iceland-self-drive/*`（兼容） |

## Engines（K3）

`runSelfDriveEngines(context)` 产出：

1. Route Understanding  
2. Vehicle–Road Fit  
3. Route Executability  
4. Driving Load  
5. Runtime Monitor  
6. Recovery / Replan  

`GET readiness` / `alternatives` 直接暴露引擎切片。
