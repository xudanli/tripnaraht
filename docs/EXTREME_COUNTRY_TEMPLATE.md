# 🌍 ExtremeCountryTemplate（极端国家模板）

## 概述

极端国家模板是从冰岛抽象出的可复用模板系统，用于快速适配到其他极端环境国家。这不是"支持国家"，而是在"部署世界观"。

## 核心概念

### 决策优先级顺序

```
WEATHER > TERRAIN (DEM) > ROAD/ACCESS > VEHICLE > USER_PERSONA
```

在某些国家（如秘鲁），还需要考虑：
```
HUMAN_PHYSIOLOGY > WEATHER > TERRAIN > ...
```

### Agent 职责

- **mustWarn**: 必须警告用户
- **mustReject**: 必须拒绝不合适用户
- **mustProvideFallback**: 必须提供替代方案
- **mustExplicitRisk**: 必须显式告知风险

### 路线分层

1. **SAFE_BASELINE**: 安全基线（新手安全壳）
2. **ICONIC_BUT_SENSITIVE**: 标志性但敏感
3. **HIGH_RISK_INTERIOR**: 高风险内陆

### 不可接受的计划特征

- `NO_WEATHER_BUFFER`: 没有天气缓冲
- `NO_DEM_EVIDENCE`: 没有 DEM 证据
- `NO_ALTERNATIVE_CORRIDOR`: 没有替代走廊
- `NO_ACCLIMATIZATION`: 没有适应期（高海拔）
- `RAPID_ASCENT_FORBIDDEN`: 禁止快速爬升但违反
- `NO_GUIDE_REQUIRED`: 需要向导但没有

## 已自动适配的国家

| 国家 | 复用冰岛模板比例 | 特殊适配 |
|------|-----------------|---------|
| 🇳🇿 新西兰 | 80% | 火山、地热、峡湾 |
| 🇨🇱 智利（巴塔哥尼亚） | 85% | 极端风、冰川、偏远 |
| 🇺🇸 阿拉斯加 | 90% | 极地气候、野生动物 |
| 🇳🇴 北挪威 | 75% | 极地、极端天气 |

## 使用示例

```typescript
import { EXTREME_COUNTRY_TEMPLATE, ICELAND_EXTREME_PROFILE } from './interfaces/extreme-country-template.interface';

// 获取冰岛画像
const icelandProfile = ICELAND_EXTREME_PROFILE;

// 适配到新西兰
const nzProfile = EXTREME_COUNTRY_TEMPLATE.adaptationRules?.adaptProfile?.('NZ');
```

## 实现细节

参见 `src/route-directions/interfaces/extreme-country-template.interface.ts`

