# Jenkins 插件推荐清单

基于本项目技术栈（NestJS + TypeScript + Prisma + PostgreSQL + Jest），以下是推荐的 Jenkins 插件列表。

## 🔧 核心构建插件

### 1. **Pipeline 相关**
- **Pipeline** - 核心 Pipeline 插件
- **Pipeline: Stage View** - Pipeline 阶段视图
- **Pipeline: Build Step** - Pipeline 构建步骤
- **Pipeline: API** - Pipeline API 支持
- **Workflow Aggregator** - 工作流聚合器

### 2. **Node.js 支持**
- **NodeJS Plugin** - Node.js 环境管理
  - 支持多版本 Node.js 切换
  - 自动安装 npm/pnpm/yarn

### 3. **Git 集成**
- **Git Plugin** - Git 版本控制
- **GitHub Plugin** - GitHub 集成（如果使用 GitHub）
- **GitLab Plugin** - GitLab 集成（如果使用 GitLab）
- **Git Parameter Plugin** - Git 参数化构建

## 🧪 测试和代码质量

### 4. **测试报告**
- **JUnit Plugin** - JUnit 测试报告（Jest 可生成 JUnit 格式）
- **HTML Publisher Plugin** - 发布 HTML 报告（测试覆盖率报告）
- **Test Results Analyzer Plugin** - 测试结果分析

### 5. **代码覆盖率**
- **Cobertura Plugin** - 代码覆盖率报告（Jest 支持 lcov 格式）
- **JaCoCo Plugin** - Java 代码覆盖率（如果不需要可跳过）

### 6. **代码质量检查**
- **Warnings Next Generation Plugin** - 代码警告和错误聚合
  - 支持 ESLint 输出解析
  - 支持 TypeScript 编译错误

## 🗄️ 数据库支持

### 7. **数据库迁移**
- **Prisma** - 通过 Node.js 脚本执行，无需特殊插件
- 确保 Jenkins 节点可以访问 PostgreSQL 数据库

## 📦 依赖管理

### 8. **包管理器**
- **npm** - 通过 NodeJS Plugin 自动支持
- 如需 pnpm，需要在构建脚本中安装：`npm install -g pnpm`

## 🔐 安全和凭证管理

### 9. **凭证管理**
- **Credentials Binding Plugin** - 凭证绑定
- **Credentials Plugin** - 凭证管理
- **Secret Source Plugin** - 密钥源管理

### 10. **环境变量**
- **Environment Injector Plugin** - 环境变量注入
- **Config File Provider Plugin** - 配置文件提供

## 📊 通知和报告

### 11. **通知**
- **Email Extension Plugin** - 邮件通知扩展
- **Slack Notification Plugin** - Slack 通知（如果使用）
- **Telegram Notifications Plugin** - Telegram 通知（如果使用）

### 12. **构建历史**
- **Build History Plugin** - 构建历史管理
- **Timestamper** - 时间戳显示

## 🚀 部署相关

### 13. **部署工具**
- **SSH Pipeline Steps** - SSH 远程执行
- **Publish Over SSH** - SSH 文件传输
- **Docker Pipeline Plugin** - Docker 支持（如果使用容器化）

## 🔍 监控和日志

### 14. **日志和监控**
- **Console Column Plugin** - 控制台列显示
- **Build Monitor Plugin** - 构建监控视图
- **Blue Ocean** - 现代化 Pipeline UI（可选）

## 📝 其他实用插件

### 15. **工具集成**
- **AnsiColor Plugin** - ANSI 颜色支持
- **Workspace Cleanup Plugin** - 工作空间清理
- **Copy Artifact Plugin** - 复制构建产物
- **Archive Artifacts Plugin** - 归档构建产物

### 16. **Python 支持**（项目中有 Python 脚本）
- **Python Plugin** - Python 环境管理（如果需要运行 Python 脚本）

## 📋 最小必需插件列表

如果只想安装最核心的插件，以下是**最小必需列表**：

1. **Pipeline** - 核心 Pipeline
2. **NodeJS Plugin** - Node.js 支持
3. **Git Plugin** - Git 集成
4. **JUnit Plugin** - 测试报告
5. **HTML Publisher Plugin** - HTML 报告发布
6. **Cobertura Plugin** - 代码覆盖率
7. **Warnings Next Generation Plugin** - 代码质量
8. **Credentials Plugin** - 凭证管理
9. **Email Extension Plugin** - 邮件通知

## 🔧 Jenkinsfile 示例

基于本项目的 Jenkinsfile 示例：

```groovy
pipeline {
    agent any
    
    tools {
        nodejs 'nodejs-20' // 需要在 Jenkins 中配置 Node.js 版本
    }
    
    environment {
        NODE_ENV = 'test'
        DATABASE_URL = credentials('database-url')
        REDIS_URL = credentials('redis-url')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Prisma Generate') {
            steps {
                sh 'npm run prisma:generate'
            }
        }
        
        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
            post {
                always {
                    recordIssues(
                        tools: [eslint(id: 'eslint', name: 'ESLint')],
                        enabledForFailure: true
                    )
                }
            }
        }
        
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
        
        stage('Test') {
            steps {
                sh 'npm run test:coverage'
            }
            post {
                always {
                    junit 'coverage/junit.xml' // 如果配置了 JUnit 输出
                    publishHTML([
                        reportDir: 'coverage',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                    cobertura coberturaReportFile: 'coverage/cobertura-coverage.xml'
                }
            }
        }
        
        stage('Database Migration') {
            steps {
                sh 'npm run prisma:migrate'
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        success {
            emailext(
                subject: "构建成功: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                body: "构建成功！",
                to: "${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
        failure {
            emailext(
                subject: "构建失败: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
                body: "构建失败，请检查日志。",
                to: "${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
    }
}
```

## 📝 安装说明

1. **通过 Jenkins Web UI 安装**：
   - 进入 `Jenkins > Manage Jenkins > Manage Plugins`
   - 在 "Available" 标签页搜索插件名称
   - 勾选需要的插件并点击 "Install without restart"

2. **通过 Jenkins CLI 安装**：
   ```bash
   jenkins-plugin-cli --plugins pipeline nodejs git junit htmlpublisher cobertura warnings-ng
   ```

3. **通过配置文件安装**（推荐）：
   创建 `plugins.txt` 文件，列出所有需要的插件，然后使用插件安装工具批量安装。

## ⚙️ 配置建议

### Node.js 配置
1. 进入 `Manage Jenkins > Global Tool Configuration`
2. 配置 Node.js 版本（如 Node.js 20.x）
3. 确保 npm/pnpm/yarn 可用

### 凭证配置
1. 进入 `Manage Jenkins > Manage Credentials`
2. 添加以下凭证：
   - `database-url` - PostgreSQL 数据库连接字符串
   - `redis-url` - Redis 连接字符串
   - 其他环境变量和密钥

### 邮件配置
1. 进入 `Manage Jenkins > Configure System`
2. 配置 SMTP 服务器信息
3. 测试邮件发送

## 🔗 相关资源

- [Jenkins Pipeline 文档](https://www.jenkins.io/doc/book/pipeline/)
- [NodeJS Plugin 文档](https://plugins.jenkins.io/nodejs/)
- [Jest JUnit 报告配置](https://jestjs.io/docs/configuration#reporters-arraymodulename--modulename--options)
