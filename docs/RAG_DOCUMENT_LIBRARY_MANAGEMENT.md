# RAG 文档库管理操作指南

## 概述

本文档提供 RAG 文档库的完整管理操作指南，包括如何添加、更新、删除和查询文档。

## 文档集合类型

### 1. `rail_pass_rules` - Rail Pass 规则文档
**用途**: 存储 Eurail、Interrail 等铁路通票的规则和条款

**文档结构**:
- 标题: 清晰描述规则类型（如 "Eurail Global Pass - Iceland Rules"）
- 内容: 完整的规则文本，包括：
  - 适用人群
  - 有效国家/地区
  - 预订要求
  - 季节性限制
  - 费用信息
- 标签: `['eurail', 'global', 'iceland', 'rail-pass']`
- 国家代码: 相关国家代码（如 'IS', 'NO', 'CH'）

**示例**:
```typescript
{
  collection: 'rail_pass_rules',
  title: 'Eurail Global Pass - Iceland Rules',
  content: `Eurail Global Pass is valid in Iceland...`,
  source: 'https://www.eurail.com/...',
  countryCode: 'IS',
  tags: ['eurail', 'global', 'iceland', 'rail-pass'],
}
```

### 2. `travel_guides` - 游记和攻略
**用途**: 存储路线相关的游记、攻略、体验分享

**文档结构**:
- 标题: 路线名称 + 类型（如 "Iceland Highlands F-Road Experience Guide"）
- 内容: 详细的游记内容，包括：
  - 路线描述
  - 实用建议
  - 注意事项
  - 最佳时间
  - 装备建议
- 标签: `['iceland', 'highlands', 'f-road', 'travel-guide', 'driving']`
- 国家代码: 路线所在国家

**示例**:
```typescript
{
  collection: 'travel_guides',
  title: 'Iceland Highlands F-Road Experience Guide',
  content: `The Iceland Highlands offer...`,
  source: 'https://www.icelandtravel.is/...',
  countryCode: 'IS',
  tags: ['iceland', 'highlands', 'f-road', 'travel-guide'],
}
```

### 3. `local_insights` - 当地洞察
**用途**: 存储当地实用信息、不成文规则、文化提示

**文档结构**:
- 标题: 地区 + 主题（如 "Iceland F-Road Local Insights"）
- 内容: 实用的当地知识，包括：
  - 实用建议
  - 文化注意事项
  - 不成文规则
  - 常见错误
- 标签: `['iceland', 'f-road', 'highlands', 'local-insights', 'tips']`
- 国家代码: 相关国家
- 地区: 可选，具体地区名称

**示例**:
```typescript
{
  collection: 'local_insights',
  title: 'Iceland F-Road Local Insights',
  content: `Local knowledge about Iceland's F-roads...`,
  source: 'Local knowledge compilation',
  countryCode: 'IS',
  tags: ['iceland', 'f-road', 'highlands', 'local-insights'],
}
```

### 4. `trail_access_rules` - 徒步路线准入规则
**用途**: 存储国家公园、徒步路线的准入规则、许可要求

**文档结构**:
- 标题: 路线名称 + "Access Rules"（如 "Everest Base Camp Access Rules"）
- 内容: 准入规则详情，包括：
  - 是否需要许可
  - 许可类型和费用
  - 预订要求
  - 季节性限制
- 标签: `['nepal', 'ebc', 'permit', 'access-rules']`
- 国家代码: 相关国家

## 添加文档的方法

### 方法 1: 通过脚本批量添加（推荐）

编辑 `scripts/index-rag-documents.ts`，在 `documents` 数组中添加新文档：

```typescript
const documents: DocumentIndexItem[] = [
  // ... 现有文档
  {
    collection: 'travel_guides',
    title: '新游记标题',
    content: '完整的游记内容...',
    source: 'https://...',
    countryCode: 'IS',
    tags: ['iceland', 'highlands'],
  },
];
```

然后运行：
```bash
npm run rag:index
```

### 方法 2: 通过 API 单个添加

```bash
curl -X POST "http://localhost:3000/rag/index" \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "travel_guides",
    "title": "新游记标题",
    "content": "完整的游记内容...",
    "source": "https://...",
    "countryCode": "IS",
    "tags": ["iceland", "highlands"]
  }'
```

### 方法 3: 通过 API 批量添加

```bash
curl -X POST "http://localhost:3000/rag/index/batch" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "collection": "travel_guides",
      "title": "文档1",
      "content": "...",
      "countryCode": "IS",
      "tags": ["iceland"]
    },
    {
      "collection": "travel_guides",
      "title": "文档2",
      "content": "...",
      "countryCode": "NP",
      "tags": ["nepal"]
    }
  ]'
```

## 文档内容编写规范

### 1. 内容质量要求

**必须包含**:
- ✅ 清晰的结构（使用标题、段落）
- ✅ 具体的信息（避免模糊描述）
- ✅ 实用的建议（可操作的内容）
- ✅ 准确的事实（验证过的信息）

**避免**:
- ❌ 过于简短的描述
- ❌ 主观性过强的观点
- ❌ 过时的信息
- ❌ 重复的内容

### 2. 内容长度建议

- **Rail Pass 规则**: 500-2000 字
- **游记和攻略**: 1000-5000 字
- **当地洞察**: 300-1500 字
- **准入规则**: 300-1000 字

### 3. 标签使用规范

**标签命名**:
- 使用小写字母
- 使用连字符分隔多词（如 `f-road`）
- 保持一致性（同一概念使用相同标签）

**常用标签**:
- 国家: `iceland`, `nepal`, `norway`, `switzerland`
- 路线类型: `f-road`, `highlands`, `ebc`, `alpine`
- 活动类型: `hiking`, `driving`, `camping`, `trekking`
- 文档类型: `travel-guide`, `local-insights`, `rail-pass`, `access-rules`

**标签组合示例**:
```typescript
// 冰岛高地 F-road 游记
tags: ['iceland', 'highlands', 'f-road', 'travel-guide', 'driving']

// 尼泊尔 EBC 徒步攻略
tags: ['nepal', 'ebc', 'everest', 'hiking', 'trekking', 'travel-guide']

// 冰岛当地洞察
tags: ['iceland', 'f-road', 'highlands', 'local-insights', 'tips']
```

## 更新和维护文档

### 1. 更新现有文档

**通过 API 更新**:
```bash
# 注意：需要先获取文档 ID
curl -X PUT "http://localhost:3000/rag/documents/{id}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新后的标题",
    "content": "更新后的内容..."
  }'
```

**通过脚本更新**:
编辑 `scripts/index-rag-documents.ts`，修改对应文档内容，然后重新运行索引脚本（会创建新文档，旧文档需要手动删除）。

### 2. 删除文档

```bash
# 通过 API 删除（需要实现删除端点）
curl -X DELETE "http://localhost:3000/rag/documents/{id}"
```

### 3. 查询文档

```bash
# 检索文档
curl "http://localhost:3000/rag/retrieve?query=iceland highlands&collection=travel_guides&countryCode=IS&limit=10"
```

## 文档库组织建议

### 按国家组织

为每个支持的国家建立文档库：

**冰岛 (IS)**:
- Rail Pass 规则: Eurail/Interrail 在冰岛的使用规则
- 游记: 高地 F-road、Ring Road、黄金圈等
- 当地洞察: F-road 驾驶、高地露营、温泉文化

**尼泊尔 (NP)**:
- 准入规则: EBC、ABC 等路线的许可要求
- 游记: EBC 徒步、ABC 徒步、文化体验
- 当地洞察: 茶屋文化、夏尔巴文化、高海拔适应

**挪威 (NO)**:
- Rail Pass 规则: Eurail/Interrail 在挪威的使用规则
- 游记: 峡湾、极光、徒步路线
- 当地洞察: 公共交通、住宿、天气

### 按主题组织

**交通相关**:
- Rail Pass 规则文档
- 公共交通使用指南
- 租车和驾驶规则

**路线相关**:
- 具体路线的游记和攻略
- 路线准入规则
- 路线难度和准备

**文化相关**:
- 当地洞察
- 文化注意事项
- 实用建议

## 文档质量检查清单

在添加文档前，检查以下项目：

- [ ] 标题清晰且描述性强
- [ ] 内容完整且结构化
- [ ] 标签准确且完整
- [ ] 国家代码正确
- [ ] 来源 URL 有效（如果有）
- [ ] 内容长度适中（不要太短或太长）
- [ ] 信息准确且最新
- [ ] 没有重复内容

## 批量操作工作流

### 1. 准备文档数据

创建文档数据文件（JSON 格式）:

```json
// documents/iceland-travel-guides.json
[
  {
    "collection": "travel_guides",
    "title": "Iceland Ring Road Guide",
    "content": "...",
    "source": "https://...",
    "countryCode": "IS",
    "tags": ["iceland", "ring-road", "travel-guide"]
  }
]
```

### 2. 编写索引脚本

创建专门的索引脚本:

```typescript
// scripts/index-iceland-documents.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RagService } from '../src/rag/services/rag.service';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ragService = app.get(RagService);

  // 读取文档数据
  const documents = JSON.parse(
    fs.readFileSync('documents/iceland-travel-guides.json', 'utf-8')
  );

  // 批量索引
  const ids = await ragService.indexDocuments(documents);
  console.log(`索引完成: ${ids.length} 个文档`);

  await app.close();
}

bootstrap();
```

### 3. 运行索引

```bash
ts-node --project tsconfig.backend.json scripts/index-iceland-documents.ts
```

## 文档来源管理

### 1. 官方文档
- Eurail/Interrail 官网
- 国家公园官网
- 旅游局官网

### 2. 游记和攻略
- 知名旅行博客
- 旅行论坛
- 用户生成内容（需验证）

### 3. 当地洞察
- 当地向导经验
- 用户反馈
- 官方建议

### 4. 文档版本管理

建议为每个文档添加版本信息：

```typescript
{
  collection: 'rail_pass_rules',
  title: 'Eurail Global Pass - Iceland Rules',
  content: '...',
  source: 'https://www.eurail.com/...',
  metadata: {
    version: '2024-01',
    lastUpdated: '2024-01-15',
    verified: true,
  },
}
```

## 定期维护任务

### 每周
- [ ] 检查 Rail Pass 规则是否有更新
- [ ] 验证文档来源链接是否有效

### 每月
- [ ] 更新过时的游记内容
- [ ] 添加新的路线游记
- [ ] 更新当地洞察

### 每季度
- [ ] 全面审查文档质量
- [ ] 删除过时或重复的文档
- [ ] 优化标签系统

## 常见问题

### Q: 如何避免重复文档？
A: 在添加前先检索相似内容：
```bash
curl "http://localhost:3000/rag/retrieve?query=iceland highlands&collection=travel_guides&limit=5"
```

### Q: 文档内容太长怎么办？
A: 可以拆分成多个文档，每个文档聚焦一个主题，使用相关标签关联。

### Q: 如何确保文档质量？
A: 
1. 使用质量检查清单
2. 定期审查和更新
3. 验证信息来源
4. 测试检索效果

### Q: 文档索引失败怎么办？
A: 
1. 检查文档格式是否正确
2. 检查 API 密钥是否配置
3. 查看服务器日志
4. 尝试单个文档索引定位问题

## 最佳实践

1. **保持文档更新**: 定期检查和更新文档内容
2. **使用一致的标签**: 建立标签规范并遵循
3. **验证信息来源**: 确保文档来源可靠
4. **结构化内容**: 使用清晰的标题和段落结构
5. **测试检索效果**: 添加后测试检索是否有效
6. **文档版本管理**: 记录文档版本和更新历史
7. **定期清理**: 删除过时或重复的文档

## 相关文档

- [RAG 融合架构设计](./RAG_FUSION_ARCHITECTURE.md)
- [RAG API 使用指南](./RAG_API_USAGE.md)
- [RAG 设置和使用指南](./RAG_SETUP_GUIDE.md)
- [RAG 实现状态](./RAG_IMPLEMENTATION_STATUS.md)

