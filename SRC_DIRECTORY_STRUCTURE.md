# src/ 目录结构详细说明

本文档详细说明 `src/` 目录下各个模块和文件的用途。

## 📁 核心模块

### `src/agent/` - Agent 系统核心
**用途**: 智能 Agent 系统，负责决策、规划、执行等核心功能

**主要子模块**:
- `assistants/` - 各种 Assistant（规划助手、执行助手等）
  - `planning-assistant/` - 规划助手，处理用户规划请求
  - `trip-planner/` - 行程规划器
- `context-engine/` - 上下文引擎，管理 Agent 运行上下文
- `plan-execute/` - 规划执行模块
- `training/` - 模型训练相关
- `memory/` - 记忆管理，存储用户偏好、决策历史等
- `reasoning/` - 推理引擎
- `services/` - Agent 相关服务
- `infra/` - 基础设施（网关、任务管理、状态存储等）

**关键文件**:
- `agent-admin.controller.ts` - Agent 管理接口
- `planner-agent-mcp.service.ts` - Planner Agent MCP 服务

---

### `src/trips/` - 行程管理
**用途**: 行程（Trip）相关的所有功能

**主要功能**:
- 行程 CRUD 操作
- 行程指标计算（metrics）
- 决策日志（decision-log）
- 行程准备度检查（readiness）
- 行程冲突检测（conflicts）
- 行程优化

**关键文件**:
- `trips.controller.ts` - 行程 API 控制器
- `trips.service.ts` - 行程业务逻辑
- `services/trip-metrics.service.ts` - 行程指标计算
- `services/trip-conflicts.service.ts` - 冲突检测
- `decision/` - 决策相关功能

---

### `src/places/` - 地点管理
**用途**: 地点（Place）数据管理，包括 POI、地理信息等

**主要功能**:
- 地点搜索和检索
- 地点详情获取
- 地点嵌入向量生成
- 地点推荐

**关键文件**:
- `places.controller.ts` - 地点 API
- `places.service.ts` - 地点业务逻辑
- `services/place-embedding.service.ts` - 嵌入向量服务

---

### `src/route-directions/` - 路线方向
**用途**: 路线方向（RouteDirection）管理，包括路线推荐、路线详情等

**主要功能**:
- 路线推荐
- 路线详情
- 路线合规性检查
- 从模板创建行程

**关键文件**:
- `route-directions.controller.ts` - 路线 API
- `route-directions.service.ts` - 路线业务逻辑

---

### `src/itinerary-items/` - 行程项管理
**用途**: 行程项（ItineraryItem）管理，包括添加、删除、修改行程项

**主要功能**:
- 行程项 CRUD
- 交通信息计算
- 时间冲突检测
- 行程项验证

**关键文件**:
- `itinerary-items.controller.ts` - 行程项 API
- `itinerary-items.service.ts` - 行程项业务逻辑
- `validators/` - 验证器（时间、交通等）

---

### `src/rag/` - RAG 知识库
**用途**: Retrieval-Augmented Generation，知识检索和生成

**主要功能**:
- 文档检索（Chunk Retrieval）
- 合规规则提取（Compliance Rules）
- 路线知识管理
- 当地洞察（Local Insights）

**关键文件**:
- `rag.controller.ts` - RAG API
- `services/chunk-retrieval.service.ts` - Chunk 检索服务
- `services/compliance-facts-agent.service.ts` - 合规规则提取
- `RAIL_PASS_API_DOCUMENTATION.md` - Rail Pass API 文档

---

### `src/railpass/` - Rail Pass 模块
**用途**: 欧洲铁路通票（Rail Pass）合规和订座决策

**主要功能**:
- Pass 合规检查
- Pass 推荐
- 订座需求检查
- Travel Day 计算
- 规则评估

**关键文件**:
- `railpass.controller.ts` - Rail Pass API
- `railpass.service.ts` - Rail Pass 业务逻辑
- `rules/railpass-rule-engine.service.ts` - 规则引擎

---

### `src/mcp/` - MCP 服务
**用途**: Model Context Protocol，提供各种外部服务的 MCP 桥接

**主要功能**:
- Google Maps MCP 桥接
- Google Calendar MCP 桥接
- Airbnb MCP 桥接
- Rail MCP 桥接
- File Extractor MCP 桥接
- PostgreSQL MCP 桥接

**关键文件**:
- `mcp-server.ts` - MCP 服务器主入口
- `google-maps-bridge-server.ts` - Google Maps 桥接
- `airbnb-bridge-server.ts` - Airbnb 桥接

---

### `src/knowledge-base/` - 知识库
**用途**: 知识库管理，包括文档加载、分块、索引

**主要功能**:
- 文档加载（Loader）
- 文档分块（Chunking）
- 文档索引（Indexing）

**关键文件**:
- `services/loader.service.ts` - 文档加载
- `services/chunking.service.ts` - 文档分块
- `services/indexing.service.ts` - 文档索引

---

### `src/skills/` - Skills 系统
**用途**: Agent Skills，可复用的技能模块

**主要功能**:
- 各种技能实现（决策、规划、执行等）
- Skill 注册和管理

**关键文件**:
- `skills/` - 各种技能实现

---

### `src/providers/` - 外部服务提供商
**用途**: 外部服务的抽象接口和实现

**子模块**:
- `asr/` - 语音识别（Automatic Speech Recognition）
  - `asr.provider.interface.ts` - ASR 接口定义
  - `mock-asr.provider.ts` - Mock 实现
- `ocr/` - 光学字符识别（Optical Character Recognition）
  - `ocr.provider.interface.ts` - OCR 接口定义
  - `google-ocr.provider.ts` - Google OCR 实现
  - `mock-ocr.provider.ts` - Mock 实现
- `poi/` - POI 提供商
  - `poi.provider.interface.ts` - POI 接口定义
  - `google-poi.provider.ts` - Google POI 实现
- `tts/` - 文本转语音（Text-to-Speech）
  - `tts.provider.interface.ts` - TTS 接口定义
  - `mock-tts.provider.ts` - Mock 实现

**关键文件**:
- `providers.module.ts` - Providers 模块定义

---

### `src/decision-draft/` - 决策草案
**用途**: 决策草案生成和管理

**主要功能**:
- 决策草案生成
- 决策草案评估
- 决策草案管理

---

### `src/chain-of-work/` - Chain of Work
**用途**: 工作链管理，用于复杂任务的编排

**主要功能**:
- 工作链定义
- 工作链执行
- 工作链状态管理

---

### `src/planning-policy/` - 规划策略
**用途**: 规划策略管理，包括稳健度评估等

**主要功能**:
- 策略定义
- 策略评估
- 策略优化

---

### `src/itinerary-optimization/` - 行程优化
**用途**: 行程优化算法和服务

**主要功能**:
- VRPTW 优化器
- 多策略路线生成
- 场景优化
- 空间聚类

**关键文件**:
- `services/vrptw-optimizer.service.ts` - VRPTW 优化器
- `services/multi-strategy-route-generator.service.ts` - 多策略路线生成

---

### `src/schedule-action/` - 行程动作
**用途**: 行程动作管理，包括应用动作、重建时间线等

**主要功能**:
- 动作应用
- 时间线重建
- 动作验证

---

### `src/transport/` - 交通
**用途**: 交通方式管理和查询

**主要功能**:
- 交通方式查询
- 交通时间计算
- 交通路线规划

---

### `src/weather/` - 天气
**用途**: 天气信息查询和管理

**主要功能**:
- 天气查询
- 天气窗口分析
- 天气预警

---

### `src/hotels/` - 酒店
**用途**: 酒店相关功能

**主要功能**:
- 酒店价格预测
- 酒店价格查询

**关键文件**:
- `hotels.controller.ts` - 酒店 API
- `services/hotel-price-prediction.service.ts` - 价格预测

---

### `src/trails/` - 步道
**用途**: 步道（Trail）管理

**主要功能**:
- 步道推荐
- 步道跟踪
- 步道规划

---

### `src/users/` - 用户管理
**用途**: 用户账户管理

**主要功能**:
- 用户注册/登录
- 用户信息管理
- 用户偏好管理

---

### `src/auth/` - 认证授权
**用途**: 身份认证和授权

**主要功能**:
- JWT 认证
- 权限管理
- 登录/登出

---

### `src/common/` - 通用模块
**用途**: 通用工具类和 DTO

**主要功能**:
- 标准响应 DTO
- 错误处理
- 通用工具函数

**关键文件**:
- `dto/standard-response.dto.ts` - 标准响应格式
- `dto/api-response.dto.ts` - API 响应 DTO

---

### `src/prisma/` - Prisma 服务
**用途**: Prisma 数据库服务封装

**关键文件**:
- `prisma.service.ts` - Prisma 服务

---

### `src/redis/` - Redis 服务
**用途**: Redis 缓存服务

**关键文件**:
- `redis.service.ts` - Redis 服务

---

### `src/system/` - 系统管理
**用途**: 系统级别的管理和监控

**主要功能**:
- 系统指标
- 系统健康检查
- 系统配置

---

### `src/admin/` - 后台管理
**用途**: 后台管理功能

**主要功能**:
- 数据管理
- 系统监控
- 配置管理

---

### `src/upload/` - 文件上传
**用途**: 文件上传功能

**主要功能**:
- 文件上传
- 图片上传
- 文件存储

---

### `src/voice/` - 语音处理
**用途**: 语音相关功能

**主要功能**:
- 语音解析
- 语音转文本

---

### `src/vision/` - 视觉处理
**用途**: 图像处理相关功能

---

### `src/analytics/` - 数据分析
**用途**: 数据分析功能

---

### `src/cities/` - 城市管理
**用途**: 城市数据管理

---

### `src/countries/` - 国家管理
**用途**: 国家数据管理

---

### `src/data-*` - 数据相关模块
**用途**: 数据架构、融合、建模、管道、质量等

- `data-architecture/` - 数据架构
- `data-contracts/` - 数据契约
- `data-fusion/` - 数据融合
- `data-modeling/` - 数据建模
- `data-pipeline/` - 数据管道
- `data-quality/` - 数据质量
- `data-privacy/` - 数据隐私

---

### `src/kpu/` - KPU（Knowledge Processing Unit）
**用途**: 知识处理单元

---

### `src/llm/` - LLM 服务
**用途**: 大语言模型服务封装

**主要功能**:
- LLM 调用
- Prompt 管理
- Token 管理

---

### `src/poi/` - POI 管理
**用途**: POI（Point of Interest）管理

**主要功能**:
- POI 图层管理
- POI 路线关联度

---

### `src/content-strategy/` - 内容策略
**用途**: 内容策略管理

---

### `src/contact/` - 联系管理
**用途**: 联系表单和通知

**主要功能**:
- 联系表单处理
- 通知发送
- 文件存储

---

### `src/flight-prices/` - 航班价格
**用途**: 航班价格查询和预测

---

### `src/iceland-info/` - 冰岛信息
**用途**: 冰岛特定信息管理

---

### `src/trip-templates/` - 行程模板
**用途**: 行程模板管理

---

### `src/tasks/` - 任务管理
**用途**: 后台任务管理

---

## 📄 关键入口文件

### `src/main.ts`
**用途**: 应用主入口文件
**说明**: NestJS 应用的启动文件，初始化应用并启动服务器

---

## 🔧 模块组织原则

1. **按功能域划分**: 每个模块对应一个业务功能域（如 trips、places、rag）
2. **标准结构**: 每个模块通常包含：
   - `*.controller.ts` - API 控制器
   - `*.service.ts` - 业务逻辑服务
   - `*.module.ts` - 模块定义
   - `dto/` - 数据传输对象
   - `services/` - 子服务
   - `interfaces/` - 接口定义
   - `*.md` - 文档

3. **依赖关系**: 
   - `common/` - 被所有模块依赖
   - `prisma/` - 数据库访问，被业务模块依赖
   - `agent/` - 核心 Agent 系统，依赖多个业务模块

---

## 📚 相关文档

- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) - 项目根目录结构说明
- [README.md](../README.md) - 项目主文档
- [PROJECT_LOGIC_OVERVIEW.md](../PROJECT_LOGIC_OVERVIEW.md) - 项目逻辑概览
