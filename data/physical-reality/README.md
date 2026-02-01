# Physical Reality 数据目录

本目录存储**物理现实数据**（Physical Reality Data），用于RAG知识库索引。

## 📋 数据类别

### 1. 道路状态数据 (`road-status/`)

**用途**: 记录道路的开放状态、季节性限制、4x4要求等信息，用于Abu决策和Neptune修复。

**文件命名**: `{region}-road-status.json`

**数据结构**: 见 `road-status-template.json`

**关键字段**:
- `roadId`: 道路标识（如 "F208", "F26"）
- `roadName`: 道路名称
- `status`: 当前状态（"open", "closed", "seasonal"）
- `season`: 季节性信息（"summer_only", "winter_closed", "year_round"）
- `requirements`: 车辆要求（"4x4_required", "high_clearance", "none"）
- `coordinates`: 道路坐标（起点、终点、关键节点）
- `lastUpdated`: 最后更新时间

### 2. 渡轮时刻表 (`ferry-schedules/`)

**用途**: 记录渡轮路线、时刻表、季节性变化、预订要求，用于Dr.Dre排期和连通性校验。

**文件命名**: `{region}-ferry-schedules.json`

**数据结构**: 见 `ferry-schedules-template.json`

**关键字段**:
- `route`: 路线标识
- `from/to`: 出发/到达港口
- `schedule`: 时刻表（按季节）
- `booking`: 预订要求（"required", "recommended", "not_required"）
- `price`: 价格信息
- `seasonalChanges`: 季节性变化

### 3. 天气窗口数据 (`weather-windows/`)

**用途**: 记录最佳旅行窗口、极端天气风险、季节性变化，用于Abu决策和Neptune修复。

**文件命名**: `{region}-weather-windows.json`

**数据结构**: 见 `weather-windows-template.json`

**关键字段**:
- `region`: 区域标识
- `bestWindows`: 最佳旅行窗口（按月份）
- `weatherPatterns`: 天气模式（历史数据）
- `riskLevels`: 风险等级（按月份）
- `extremeEvents`: 极端天气事件（历史记录）

## 📁 目录结构

```
data/physical-reality/
├── README.md                          # 本文件
├── road-status/
│   ├── template.json                  # 道路状态数据模板
│   ├── iceland-road-status.json      # 冰岛道路状态（示例）
│   └── greenland-road-status.json    # 格陵兰道路状态（示例）
├── ferry-schedules/
│   ├── template.json                  # 渡轮时刻表模板
│   ├── iceland-ferry-schedules.json  # 冰岛渡轮时刻表（示例）
│   └── faroe-islands-ferry-schedules.json  # 法罗群岛渡轮时刻表（示例）
└── weather-windows/
    ├── template.json                  # 天气窗口模板
    ├── iceland-weather-windows.json  # 冰岛天气窗口（示例）
    └── greenland-weather-windows.json  # 格陵兰天气窗口（示例）
```

## 🚀 使用方法

### 1. 准备数据文件

按照模板文件创建JSON数据文件，确保：
- 符合JSON格式
- 包含所有必需字段
- 坐标使用WGS84格式（lat, lng）
- 时间使用ISO 8601格式

### 2. 索引数据

运行索引脚本：

```bash
npx tsx scripts/index-physical-reality-data.ts
```

脚本会自动：
- 扫描 `data/physical-reality/` 目录
- 按数据类型分类处理
- 创建细粒度chunks（按道路/路线/区域）
- 提取关键词和元数据
- 生成向量并存储到RAG系统

### 3. 验证索引

运行数据质量检查：

```bash
npx tsx scripts/check-data-quality.ts
```

## 📝 数据来源建议

### 道路状态数据
- 官方道路管理机构网站（如冰岛 Road.is）
- 旅游信息中心
- 本地向导/专家

### 渡轮时刻表
- 渡轮公司官方网站
- 旅游信息中心
- 官方旅游网站

### 天气窗口数据
- 气象局历史数据
- 气候数据库（如World Weather Online）
- 旅游指南和专家建议

## ⚠️ 注意事项

1. **数据时效性**: 这些数据会定期更新，建议每季度检查一次
2. **数据准确性**: 优先使用官方数据源，确保准确性
3. **数据格式**: 严格遵循模板格式，确保索引脚本能正确解析
4. **坐标精度**: 确保坐标精度足够（至少小数点后4位）
