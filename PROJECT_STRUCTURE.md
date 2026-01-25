# 项目结构说明

本文档说明 TripNARA 项目根目录下各个文件和文件夹的用途。

## 📁 目录结构

### 核心源代码目录

#### `src/`
- **用途**: 项目的主要源代码目录
- **内容**: 
  - NestJS 应用的所有模块、服务、控制器
  - API 路由和业务逻辑
  - 数据库模型和服务
  - 工具类和辅助函数
- **说明**: 这是项目的核心代码库，包含所有业务逻辑

#### `prisma/`
- **用途**: Prisma ORM 相关文件
- **内容**:
  - `schema.prisma` - 数据库模式定义
  - `migrations/` - 数据库迁移文件
  - SQL 脚本和数据库相关文档
- **说明**: 管理数据库结构和迁移

#### `scripts/`
- **用途**: 各种工具脚本和自动化脚本
- **内容**:
  - 数据导入/导出脚本
  - 数据库迁移脚本
  - 测试脚本
  - 部署脚本
  - RL Infrastructure 相关脚本（`rl-infra/`）
- **说明**: 辅助开发和运维的脚本集合

### 配置和文档目录

#### `data/`
- **用途**: 项目数据文件
- **内容**: 
  - 地理数据（`geographic/`）
  - 国家包数据（`country-packs/`）
  - 其他静态数据文件
- **说明**: 存储项目使用的静态数据

#### `docs/`
- **用途**: 项目文档
- **内容**: API 文档、开发指南等
- **说明**: 补充文档（主要文档在根目录的 `.md` 文件中）

#### `prompts/`
- **用途**: LLM 提示词模板
- **内容**:
  - `agents/` - Agent 相关的提示词
  - `skills/` - Skill 相关的提示词
- **说明**: 存储用于 LLM 调用的提示词模板

#### `e2e-cases/`
- **用途**: 端到端测试用例
- **内容**: JSON 格式的测试用例文件
- **说明**: 用于端到端测试的测试数据

#### `tools/`
- **用途**: 工具脚本（Python 等）
- **内容**: Python 工具脚本，如路线难度计算等
- **说明**: 独立的工具脚本，不依赖主应用

#### `uploads/`
- **用途**: 上传文件存储目录
- **说明**: 运行时生成，不应提交到 git

#### `node_modules/`
- **用途**: npm 依赖包
- **说明**: 由 `npm install` 生成，不应提交到 git

### 隐藏目录

#### `.claude/`
- **用途**: Claude AI 相关的配置和角色定义
- **内容**: 角色文档、配置 JSON 等
- **说明**: 用于 Claude AI 开发辅助

#### `.cursor/`
- **用途**: Cursor IDE 配置
- **内容**: IDE 工作区配置
- **说明**: Cursor IDE 的本地配置

## 📄 配置文件

### 项目配置

#### `package.json`
- **用途**: Node.js 项目配置和依赖管理
- **内容**: 
  - 项目元数据（名称、版本等）
  - 依赖包列表
  - npm 脚本命令
- **说明**: 项目的核心配置文件，定义了所有可用的命令和依赖

#### `package-lock.json`
- **用途**: npm 依赖锁定文件
- **说明**: 锁定依赖版本，确保团队使用相同的依赖版本

#### `tsconfig.json`
- **用途**: TypeScript 主配置文件
- **说明**: TypeScript 编译配置

#### `tsconfig.backend.json`
- **用途**: TypeScript 后端专用配置
- **说明**: 后端代码的 TypeScript 配置

#### `nest-cli.json`
- **用途**: NestJS CLI 配置
- **说明**: NestJS 框架的 CLI 工具配置

#### `jest.config.js`
- **用途**: Jest 测试框架配置
- **说明**: 单元测试和集成测试的配置

#### `prisma.config.ts`
- **用途**: Prisma 配置文件
- **说明**: Prisma ORM 的自定义配置

### 环境配置

#### `.env`
- **用途**: 环境变量配置文件
- **内容**: 数据库连接、API 密钥、服务配置等
- **说明**: ⚠️ **不应提交到 git**，包含敏感信息。参考 `.env.example` 创建

#### `.env.example.mapbox`
- **用途**: Mapbox API 配置示例
- **说明**: Mapbox 相关环境变量的示例文件

#### `.gitignore`
- **用途**: Git 忽略文件配置
- **说明**: 定义哪些文件不应被 Git 跟踪

#### `.dockerignore`
- **用途**: Docker 构建忽略文件
- **说明**: 定义构建 Docker 镜像时忽略的文件

### Docker 配置

#### `Dockerfile`
- **用途**: Docker 镜像构建文件
- **说明**: 定义如何构建应用的 Docker 镜像

#### `docker-compose.yml`
- **用途**: Docker Compose 配置文件
- **说明**: 定义多容器应用的编排配置

#### `entrypoint.sh`
- **用途**: Docker 容器入口脚本
- **说明**: 容器启动时执行的脚本

### 部署配置

#### `Jenkinsfile`
- **用途**: Jenkins CI/CD 流水线配置
- **说明**: 定义自动化构建、测试、部署流程

#### `setup-jenkins-github.sh`
- **用途**: Jenkins 与 GitHub 集成设置脚本
- **说明**: 自动化设置 Jenkins 和 GitHub 的集成

#### `restart-service.sh`
- **用途**: 服务重启脚本
- **说明**: 用于重启应用服务的脚本

### Nginx 配置

#### `nginx-tripnara-api.conf`
- **用途**: Nginx 反向代理配置
- **说明**: API 服务的 Nginx 配置，用于生产环境

#### `NGINX_HTTPS_CONFIG.md`
- **用途**: Nginx HTTPS 配置文档
- **说明**: HTTPS 配置的详细说明文档

## 📚 文档文件

#### `README.md`
- **用途**: 项目主文档
- **内容**: 项目介绍、快速开始、技术栈等
- **说明**: 项目的入口文档，新开发者首先阅读的文件

#### `PROJECT_LOGIC_OVERVIEW.md`
- **用途**: 项目逻辑概览文档
- **内容**: 系统架构、核心概念、业务流程等
- **说明**: 深入理解项目逻辑的文档

#### `PROJECT_STRUCTURE.md`（本文件）
- **用途**: 项目结构说明文档
- **说明**: 说明各个文件和文件夹的用途

## 🔧 其他文件

### 构建输出（不应提交到 git）

- `dist/` - TypeScript 编译输出目录（由 `npm run build` 生成）
- `*.log` - 日志文件（如 `backend.log`, `dev.log`）
- `coverage/` - 测试覆盖率报告

### 已删除的文件（历史记录）

以下文件已被清理，不再存在于项目中：

- `pnpm-lock.yaml` - pnpm 锁定文件（项目使用 npm）
- `yarn.lock` - Yarn 锁定文件（项目使用 npm）
- `requirements.txt` - Python 依赖文件（项目主要是 Node.js）

## 📋 快速参考

### 常用命令

```bash
# 安装依赖
npm install

# 开发模式启动
npm run dev

# 构建项目
npm run build

# 运行测试
npm test

# 数据库迁移
npm run prisma:migrate

# 生成 Prisma Client
npm run prisma:generate
```

### 重要路径

- **源代码**: `src/`
- **数据库模式**: `prisma/schema.prisma`
- **环境配置**: `.env`（需要手动创建）
- **API 文档**: 启动后访问 `http://localhost:3000/api-docs`

### 注意事项

1. ⚠️ **不要提交敏感文件**: `.env` 文件包含 API 密钥等敏感信息
2. ⚠️ **不要提交构建输出**: `dist/`, `node_modules/` 等由构建工具生成
3. ⚠️ **不要提交日志文件**: `*.log` 文件不应提交到 git
4. ✅ **使用 npm**: 项目统一使用 npm 作为包管理器，不要使用 pnpm 或 yarn

## 🔄 更新日志

- **2026-01-23**: 清理了重复的包管理器锁定文件和遗留的 Python 依赖文件
- **2026-01-23**: 删除了日志文件和构建输出目录
