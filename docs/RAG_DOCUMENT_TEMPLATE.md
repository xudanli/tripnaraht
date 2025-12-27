# RAG 文档模板

## 文档添加模板

### Rail Pass 规则文档模板

```typescript
{
  collection: 'rail_pass_rules',
  title: '[Pass Type] - [Country] Rules',
  content: `
[Pass Type] is valid in [Country]. [Brief description]

Key Rules:
- Valid for [eligible travelers]
- Requires seat reservation: [yes/no, details]
- Reservation fee: [amount and currency]
- Not valid on: [train types or services]
- Seasonal restrictions: [if applicable]

Reservation Requirements:
- [Detailed reservation requirements]
- [How to make reservations]
- [Cost and process]

Validity:
- Valid countries: [list]
- Validity period: [details]
- Activation requirements: [if any]

Special Notes:
- [Any additional important information]
`,
  source: '[Official URL]',
  countryCode: '[ISO country code]',
  tags: ['[pass-type]', '[country]', 'rail-pass'],
}
```

### 游记和攻略模板

```typescript
{
  collection: 'travel_guides',
  title: '[Route Name] [Type] Guide',
  content: `
[Route Name] is [brief description of the route].

Getting There:
- [How to reach the starting point]
- [Transportation options]
- [Travel time and distance]

Route Overview:
- Starting point: [location and elevation]
- End point: [location and elevation]
- Distance: [total distance]
- Duration: [typical duration]
- Difficulty: [difficulty level]

Key Highlights:
- [Main attractions or experiences]
- [Unique features]
- [Best viewpoints or stops]

Practical Information:
- [Permits or requirements]
- [Best time to visit]
- [Weather considerations]
- [Accommodation options]

What to Bring:
- [Essential items]
- [Recommended gear]
- [Food and water]

Safety Considerations:
- [Important safety notes]
- [Emergency information]
- [Risk factors]
`,
  source: '[Source URL or "Local knowledge compilation"]',
  countryCode: '[ISO country code]',
  tags: ['[country]', '[route-type]', '[activity-type]', 'travel-guide'],
}
```

### 当地洞察模板

```typescript
{
  collection: 'local_insights',
  title: '[Location] [Topic] Local Insights',
  content: `
Local knowledge about [topic] in [location] from experienced travelers and locals.

Practical Tips:
- [Tip 1 with context]
- [Tip 2 with context]
- [Tip 3 with context]

Cultural Notes:
- [Cultural consideration 1]
- [Cultural consideration 2]
- [Cultural consideration 3]

Unwritten Rules:
- [Rule 1]
- [Rule 2]
- [Rule 3]

Common Mistakes:
- [Mistake 1 and how to avoid]
- [Mistake 2 and how to avoid]
- [Mistake 3 and how to avoid]

Local Customs:
- [Custom 1]
- [Custom 2]
- [Custom 3]
`,
  source: 'Local knowledge compilation',
  countryCode: '[ISO country code]',
  tags: ['[country]', '[topic]', '[region]', 'local-insights', 'tips'],
}
```

### 徒步路线准入规则模板

```typescript
{
  collection: 'trail_access_rules',
  title: '[Trail Name] Access Rules',
  content: `
Access rules and permit requirements for [Trail Name].

Permit Requirements:
- Requires permit: [yes/no]
- Permit type: [DAILY/SEASONAL/ANNUAL]
- Permit cost: [amount and currency]
- Where to get: [location or website]

Booking Requirements:
- Advance booking required: [yes/no]
- Booking in advance: [number of days]
- Booking method: [online/onsite/agency]

Seasonal Restrictions:
- Open months: [list of months]
- Closed months: [list of months]
- Reason for closure: [explanation]

Special Requirements:
- [Any special requirements]
- [Guide requirements]
- [Equipment requirements]

Fees and Costs:
- Entry fee: [if applicable]
- Guide fee: [if applicable]
- Other costs: [if applicable]
`,
  source: '[Official source URL]',
  countryCode: '[ISO country code]',
  tags: ['[country]', '[trail-name]', 'permit', 'access-rules'],
}
```

## 标签使用参考

### 国家标签
- `iceland` - 冰岛
- `nepal` - 尼泊尔
- `norway` - 挪威
- `switzerland` - 瑞士
- `peru` - 秘鲁
- `china` - 中国

### 路线类型标签
- `f-road` - F 级道路（冰岛）
- `highlands` - 高地
- `ring-road` - 环线
- `ebc` - 珠峰大本营
- `abc` - 安纳普尔纳大本营
- `alpine` - 阿尔卑斯

### 活动类型标签
- `hiking` - 徒步
- `trekking` - 长途徒步
- `driving` - 自驾
- `camping` - 露营
- `wild-camp` - 野营
- `mountaineering` - 登山

### 文档类型标签
- `travel-guide` - 游记攻略
- `local-insights` - 当地洞察
- `rail-pass` - 铁路通票
- `access-rules` - 准入规则
- `tips` - 实用建议

## 快速检查清单

在添加文档前，确认：

- [ ] 标题清晰描述内容
- [ ] 内容完整且结构化
- [ ] 标签准确（3-6 个标签）
- [ ] 国家代码正确（ISO 2 位代码）
- [ ] 来源 URL 有效（如果有）
- [ ] 内容长度适中（300-5000 字）
- [ ] 信息准确且最新
- [ ] 没有重复内容

