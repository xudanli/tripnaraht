# 签证数据字段说明

## 字段含义

### 1. `status` (签证状态)
**类型**: 枚举值  
**可能的值**:
- `VISA_FREE` - 免签（不需要签证）
- `VISA_ON_ARRIVAL` - 落地签（到达时办理）
- `E_VISA` - 电子签（在线申请）
- `VISA_REQUIRED` - 需要签证（需提前申请）

**示例**: `"VISA_REQUIRED"` 表示需要提前申请签证

---

### 2. `requirement` (签证要求描述)
**类型**: 字符串  
**含义**: 签证要求的详细描述文本

**应该包含的内容**:
- 签证要求的完整描述（如 "Visa not required"、"Visa required"）
- 或政策变更日期（如 "25 September 2023" 表示政策在2023年9月25日变更）

**当前问题**: 
从您的数据 `"requirement": "25 September 2023"` 来看，这个字段存储的是日期而不是描述文本。这可能是因为 Wikipedia 表格结构变化，解析逻辑需要调整。

**正确示例**:
```json
{
  "requirement": "Visa not required for 30 days"
}
```

---

### 3. `allowedStay` (允许停留时间)
**类型**: 字符串（可选）  
**含义**: 允许在该国停留的时长或条件

**常见格式**:
- `"30 days"` - 允许停留30天
- `"90 days"` - 允许停留90天
- `"Permanently on 1 March 2024"` - 从2024年3月1日起可以永久停留
- `"Visa Requirement Reinstated on 1 July 2024"` - 签证要求于2024年7月1日恢复

**示例**: `"Permanently on 1 March 2024"` 表示从2024年3月1日起可以永久停留

---

### 4. `notes` (备注信息)
**类型**: 字符串或 null（可选）  
**含义**: 额外的说明信息

**可能包含**:
- 特殊条件（如 "Only for holders of certain passports"）
- 政策变更说明
- 其他重要提示

**示例**: `null` 表示没有额外备注

---

## 数据结构示例

### 完整示例（免签国家）
```json
{
  "status": "VISA_FREE",
  "requirement": "Visa not required for 30 days",
  "allowedStay": "30 days",
  "notes": "Must hold return ticket"
}
```

### 完整示例（需要签证）
```json
{
  "status": "VISA_REQUIRED",
  "requirement": "Visa required",
  "allowedStay": null,
  "notes": "Apply at embassy or consulate"
}
```

### 当前数据问题示例
```json
{
  "status": "VISA_REQUIRED",
  "requirement": "25 September 2023",  // ❌ 这是日期，不是描述
  "allowedStay": "Permanently on 1 March 2024",
  "notes": null
}
```

---

## 数据问题分析

从您提供的数据来看，`requirement` 字段存储的是日期而不是签证要求描述。这可能是因为：

1. **Wikipedia 表格结构变化**: 表格列的顺序或内容可能已改变
2. **解析逻辑需要调整**: `scrape-visa.ts` 中的列索引可能不正确

### 建议修复

检查 Wikipedia 表格的实际结构，确保：
- 第二列是签证要求描述（如 "Visa not required"）
- 第三列是允许停留时间
- 日期信息应该作为 `notes` 或单独字段存储

---

## 使用建议

1. **前端显示**: 
   - 主要显示 `status`（用图标和颜色区分）
   - 详细显示 `requirement` 和 `allowedStay`
   - 如有 `notes`，显示为提示信息

2. **API 返回格式**:
```json
{
  "countryCode": "IS",
  "visaInfo": {
    "status": "VISA_FREE",
    "summary": "免签30天",
    "details": "Visa not required for 30 days",
    "allowedStay": "30 days",
    "notes": null
  }
}
```

