# Next.js + Claude Code + Codex

一个开箱即用的 Next.js 14 应用，已集成 Claude Code 客户端 ([Happy](https://github.com/slopus/happy))。

## 环境搭建

### 1. 配置 Claude Code API 密钥

使用 Claude Code 前，请先设置您的 API 令牌：

```bash
# 为当前会话设置令牌
export ANTHROPIC_AUTH_TOKEN=your_token_here

# 使其持久生效（重启后依然有效）
echo 'export ANTHROPIC_AUTH_TOKEN=your_token_here' >> ~/.bashrc
source ~/.bashrc
```

**如何获取令牌：**

1.  在 [Sealos](https://cloud.sealos.run) 中打开 **AI Proxy** 应用
2.  点击左侧边栏的 **API Keys**
3.  点击【+ 新建】创建一个新的 API 密钥
4.  复制生成的令牌

### 2. 下载移动端应用

  * **iPhone/iPad**: [App Store](https://apps.apple.com/us/app/happy-claude-code-client/id6748571505)
  * **Android**: [Google Play](https://play.google.com/store/apps/details?id=com.ex3ndr.happy)
  * **Web 应用**: [app.happy.engineering](https://app.happy.engineering)

### 3. 使用移动端应用扫描二维码

```bash
happy --auth # 该命令会显示一个二维码
```

扫描成功后，您的移动应用便会连接到 DevBox 运行时。

## 自托管 Happy 服务（可选）

想自己部署？在 Sealos 上分分钟搞定 Happy 中继服务：[https://template.hzh.sealos.run/deploy?templateName=happy-server](https://template.sealos.io/deploy?templateName=happy-server)

## 功能特性

  * **Next.js 14.2.5** - 支持服务器端渲染、静态站点生成、API 路由
  * **Happy** - 适用于 Claude Code 和 Codex 的移动端与 Web 客户端
  * **TypeScript** - 完全类型安全，保障代码质量
  * **热重载** - 即时反馈，无需手动刷新
  * **生产就绪** - 优化的构建流程，随时可以上线部署

## 开发流程

```bash
npm run dev      # 启动开发服务器
npm run build    # 创建生产环境构建包
npm run start    # 运行生产服务器
npm run lint     # 代码质量检查
```

## 项目结构

```
.
├── src/              # 应用程序代码
├── public/           # 静态资源（如图片、字体）
├── package.json      # 项目依赖
├── next.config.mjs   # Next.js 配置文件
├── tsconfig.json     # TypeScript 配置文件
└── entrypoint.sh     # 应用启动脚本
```

## 生产环境部署

```bash
bash entrypoint.sh production
```

该命令会创建优化的生产构建包并启动服务，同时会自动将应用容器化，以便通过 Docker 进行部署。

## 问题排查

**端口冲突：**

```bash
lsof -ti:3000 | xargs kill -9    # 清理 3000 端口
```

**清理并重装依赖：**

```bash
rm -rf node_modules .next
npm install
```

## 技术栈

  * Next.js 14.2.5 + React 18
  * TypeScript 5
  * ESLint 8

-----

基于 **DevBox** 构建 - 您只需专注编码，其余的交给我们。