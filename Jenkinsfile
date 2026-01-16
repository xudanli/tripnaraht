// Jenkins Pipeline 定义
// 这是一个声明式 Pipeline，用于自动化构建和部署 TripNara 应用
pipeline {
  // 指定在任何可用的 Jenkins agent 上运行
  agent any

  // Pipeline 选项配置
  options {
    // 禁用并发构建，确保同一时间只有一个构建在运行
    // 这对于生产环境部署很重要，避免多个部署同时进行导致冲突
    disableConcurrentBuilds()
  }

  // 全局环境变量定义
  environment {
    // Docker Compose 项目名称，用于隔离不同项目的容器
    COMPOSE_PROJECT_NAME = "tripnara"
    // Jenkins Credentials ID，用于从 Jenkins 凭证库中获取 .env 文件内容
    DOTENV_CRED_ID = "tripnara-dotenv-prod"
  }

  // Pipeline 阶段定义
  stages {
    // 阶段 1: 环境预检查
    // 检查 Docker 和 Docker Compose 是否可用，并检测使用的版本
    // 注意：此阶段在 Checkout 之前执行，因为只需要检查系统环境，不需要代码
    stage('Precheck') {
      steps {
        sh '''
          set -e  # 遇到错误立即退出
          docker version  # 检查 Docker 是否可用
          # 检测 Docker Compose 命令（支持 V2 和 V1）
          # 优先检测 Docker Compose V2（docker compose），然后是 V1（docker-compose）
          # 将检测到的命令保存到文件，供后续阶段使用
          if docker compose version >/dev/null 2>&1; then
            echo "✓ 检测到 docker compose (V2)"
            echo "docker compose" > $WORKSPACE/.docker-compose-cmd
          elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
            echo "✓ 检测到 docker-compose (V1)"
            echo "docker-compose" > $WORKSPACE/.docker-compose-cmd
          elif [ -f /usr/local/bin/docker-compose ] && /usr/local/bin/docker-compose version >/dev/null 2>&1; then
            echo "✓ 检测到 /usr/local/bin/docker-compose"
            echo "/usr/local/bin/docker-compose" > $WORKSPACE/.docker-compose-cmd
          else
            echo "⚠️  警告: 未找到 docker compose 或 docker-compose 命令"
            echo "如果后续构建失败，请安装 Docker Compose:"
            echo "  - Docker Compose V2: 通常是 Docker Desktop 的一部分，或运行 'apt-get install docker-compose-plugin'"
            echo "  - Docker Compose V1: 运行 'curl -L \"https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)\" -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose'"
            echo "" > $WORKSPACE/.docker-compose-cmd
          fi
        '''
      }
    }

    // 阶段 2: 代码检出
    // 从源代码管理（SCM）系统（如 Git）检出代码到工作空间
    stage('Checkout') {
      steps { checkout scm }
    }

    // 阶段 3: 从 Jenkins Credentials 写入 .env 文件
    // 从 Jenkins 凭证库中读取环境变量配置，并写入到 .env 文件
    // 这样可以安全地管理敏感信息（如数据库密码、API 密钥等）
    stage('Write .env from Jenkins Credentials') {
      steps {
        // 使用 Jenkins Credentials Binding 插件从凭证库中获取 .env 内容
        // credentialsId 对应 Jenkins 中配置的 Secret Text 类型凭证
        withCredentials([string(credentialsId: "${DOTENV_CRED_ID}", variable: 'DOTENV')]) {
          sh '''
            set -eu  # 遇到错误或未定义变量时立即退出
            umask 077  # 设置文件权限掩码，确保 .env 文件只有所有者可读写（安全措施）
            printf "%s" "$DOTENV" > .env  # 将凭证内容写入 .env 文件
            # 验证 .env 文件已写入
            if [ ! -f .env ]; then
              echo "❌ 错误: .env 文件未创建"
              exit 1
            fi
            echo "✅ .env 文件已创建"
            # 验证 SMTP 配置（不显示敏感信息）
            # 检查 .env 文件中是否包含 SMTP 相关配置，用于邮件服务
            if grep -q "^SMTP_" .env; then
              echo "✅ .env 文件中包含 SMTP 配置"
              grep "^SMTP_" .env | sed 's/PASSWORD=.*/PASSWORD=***/' || true  # 隐藏密码信息
            else
              echo "⚠️  警告: .env 文件中未找到 SMTP 配置"
              echo "请检查 Jenkins Credentials 配置"
            fi
          '''
        }
      }
    }

    // 阶段 4: 构建 Docker 镜像
    // 使用 Docker Compose 构建应用所需的 Docker 镜像
    stage('Build') {
      options {
        // 设置构建超时时间为 30 分钟，防止构建过程无限期挂起
        timeout(time: 30, unit: 'MINUTES')
      }
      steps {
        sh '''
          set -eu
          # 读取或检测 Docker Compose 命令
          # 优先使用 Precheck 阶段保存的命令，如果没有则重新检测
          if [ -f $WORKSPACE/.docker-compose-cmd ]; then
            DOCKER_COMPOSE_CMD=$(cat $WORKSPACE/.docker-compose-cmd | tr -d '\n')
          fi
          if [ -z "$DOCKER_COMPOSE_CMD" ]; then
            if docker compose version >/dev/null 2>&1; then
              DOCKER_COMPOSE_CMD="docker compose"
            elif command -v docker-compose >/dev/null 2>&1; then
              DOCKER_COMPOSE_CMD="docker-compose"
            elif [ -f /usr/local/bin/docker-compose ]; then
              DOCKER_COMPOSE_CMD="/usr/local/bin/docker-compose"
            else
              echo "❌ 错误: 未找到 docker compose 或 docker-compose 命令"
              echo "请安装 Docker Compose 插件或二进制文件"
              exit 1
            fi
          fi
          echo "使用命令: ${DOCKER_COMPOSE_CMD}"
          echo "开始构建 Docker 镜像..."
          echo "⏳ 这可能需要几分钟时间，请耐心等待..."
          # 使用 --progress=plain 确保输出实时显示，避免 Jenkins heartbeat 超时
          # 后台运行一个定期输出进程，保持 Jenkins heartbeat
          # 这可以防止 Jenkins 认为构建已挂起而终止构建
          (
            while true; do
              sleep 30
              echo "[$(date +'%H:%M:%S')] 构建仍在进行中，请稍候..."
            done
          ) &
          HEARTBEAT_PID=$!  # 保存后台进程的 PID
          # 执行构建，使用 --progress=plain 确保实时输出
          if ${DOCKER_COMPOSE_CMD} build --progress=plain; then
            kill $HEARTBEAT_PID 2>/dev/null || true  # 构建成功，停止心跳进程
            echo "✅ Docker 镜像构建完成"
          else
            kill $HEARTBEAT_PID 2>/dev/null || true  # 构建失败，停止心跳进程
            echo "❌ Docker 镜像构建失败"
            exit 1
          fi
        '''
      }
    }

    // 阶段 5: 数据库迁移
    // 使用 Prisma 执行数据库架构迁移，更新数据库结构
    stage('Migrate') {
      steps {
        sh '''
          set -eu
          # 读取 Docker Compose 命令（与 Build 阶段相同）
          if [ -f $WORKSPACE/.docker-compose-cmd ]; then
            DOCKER_COMPOSE_CMD=$(cat $WORKSPACE/.docker-compose-cmd | tr -d '\n')
          fi
          if [ -z "$DOCKER_COMPOSE_CMD" ]; then
            if docker compose version >/dev/null 2>&1; then
              DOCKER_COMPOSE_CMD="docker compose"
            elif command -v docker-compose >/dev/null 2>&1; then
              DOCKER_COMPOSE_CMD="docker-compose"
            elif [ -f /usr/local/bin/docker-compose ]; then
              DOCKER_COMPOSE_CMD="/usr/local/bin/docker-compose"
            else
              echo "❌ 错误: 未找到 docker compose 或 docker-compose 命令"
              exit 1
            fi
          fi
          
          # 尝试运行迁移
          # --profile ops: 使用 ops profile 中的服务（迁移服务）
          # run --rm: 运行一次性容器，执行完成后自动删除
          if ! ${DOCKER_COMPOSE_CMD} --profile ops run --rm migrate; then
            echo "⚠️  迁移失败，尝试修复失败的迁移记录..."
            # 使用 Prisma migrate resolve 修复失败的迁移
            # 这用于处理之前迁移失败但部分已应用的情况
            # 注意：这需要数据库用户有权限修改 _prisma_migrations 表
            ${DOCKER_COMPOSE_CMD} --profile ops run --rm migrate sh -c "
              node ./node_modules/.bin/prisma migrate resolve --rolled-back 20251225191251_add_route_directions || true
            " || echo "⚠️  自动修复失败，请手动在数据库中执行修复 SQL（见 JENKINS_DATABASE_SETUP.md）"
            
            # 重新尝试迁移
            echo "🔄 重新尝试迁移..."
            if ! ${DOCKER_COMPOSE_CMD} --profile ops run --rm migrate; then
              echo ""
              echo "❌ 迁移仍然失败。可能的原因："
              echo "1. PostGIS 扩展未安装在正确的数据库中（请确认是在 tripnara_prod 数据库中安装）"
              echo "2. 数据库用户权限不足，无法使用 PostGIS 扩展"
              echo "3. DATABASE_URL 格式问题，导致连接到错误的数据库"
              echo ""
              echo "请检查："
              echo "- 确认 PostGIS 扩展已安装在 tripnara_prod 数据库"
              echo "- 执行: SELECT * FROM pg_extension WHERE extname = 'postgis';"
              echo "- 检查 DATABASE_URL 是否正确指向 tripnara_prod 数据库"
              exit 1
            fi
          fi
        '''
      }
    }

    // 阶段 6: 启动应用容器
    // 停止旧容器并启动新构建的容器，应用新的代码和配置
    stage('Up') {
      steps {
        sh '''
          set -eu
          # 读取 Docker Compose 命令（与之前阶段相同）
          if [ -f $WORKSPACE/.docker-compose-cmd ]; then
            DOCKER_COMPOSE_CMD=$(cat $WORKSPACE/.docker-compose-cmd | tr -d '\n')
          fi
          if [ -z "$DOCKER_COMPOSE_CMD" ]; then
            if docker compose version >/dev/null 2>&1; then
              DOCKER_COMPOSE_CMD="docker compose"
            elif command -v docker-compose >/dev/null 2>&1; then
              DOCKER_COMPOSE_CMD="docker-compose"
            elif [ -f /usr/local/bin/docker-compose ]; then
              DOCKER_COMPOSE_CMD="/usr/local/bin/docker-compose"
            else
              echo "❌ 错误: 未找到 docker compose 或 docker-compose 命令"
              exit 1
            fi
          fi
          # 验证 .env 文件存在（容器启动需要环境变量）
          if [ ! -f .env ]; then
            echo "❌ 错误: .env 文件不存在，无法启动容器"
            exit 1
          fi
          echo "✅ .env 文件存在，继续启动容器..."
          # 停止并删除现有容器，确保重新加载环境变量
          # 2>/dev/null || true: 忽略错误（如果容器不存在）
          ${DOCKER_COMPOSE_CMD} down 2>/dev/null || true
          # 重新创建并启动容器（强制重新创建以确保加载新的环境变量）
          # -d: 后台运行（detached mode）
          # --force-recreate: 强制重新创建容器，即使配置未改变
          # --remove-orphans: 删除不再在 compose 文件中定义的容器
          ${DOCKER_COMPOSE_CMD} up -d --force-recreate --remove-orphans
          ${DOCKER_COMPOSE_CMD} ps  # 显示容器状态
          # 验证环境变量是否已加载
          # 检查 SMTP 相关环境变量，确认配置已正确加载到容器中
          echo "验证环境变量..."
          sleep 2  # 等待容器完全启动
          SMTP_HOST=$(docker exec tripnara-app sh -c 'echo $SMTP_HOST' 2>/dev/null || echo "")
          SMTP_USER=$(docker exec tripnara-app sh -c 'echo $SMTP_USER' 2>/dev/null || echo "")
          if [ -n "$SMTP_HOST" ] && [ -n "$SMTP_USER" ]; then
            echo "✅ SMTP 环境变量已加载"
            echo "  SMTP_HOST: $SMTP_HOST"
            echo "  SMTP_USER: $SMTP_USER"
          else
            echo "⚠️  警告: SMTP 环境变量未加载"
            echo "检查 .env 文件内容（前10行，隐藏敏感信息）："
            head -10 .env | sed 's/PASSWORD=.*/PASSWORD=***/' || echo "无法读取 .env 文件"
            echo ""
            echo "检查容器环境变量："
            docker exec tripnara-app env | grep SMTP || echo "未找到 SMTP 环境变量"
            echo ""
            echo "可能的原因："
            echo "  1. Jenkins Credentials 中未配置 SMTP 变量"
            echo "  2. .env 文件格式不正确"
            echo "  3. docker-compose.yml 中的 env_file 配置有问题"
          fi
        '''
      }
    }
  }

  // Pipeline 后置操作
  // 无论构建成功或失败，都会执行这些清理操作
  post {
    always {
      sh '''
        set +e  # 允许命令失败而不退出（清理操作不应该影响构建状态）
        # Jenkins-only 管理：部署完成删除 .env（下次部署会重新下发）
        # 这是安全措施，防止敏感信息残留在工作空间中
        rm -f .env
      '''
    }
  }
}