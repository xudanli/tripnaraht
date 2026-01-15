pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  environment {
    COMPOSE_PROJECT_NAME = "tripnara"
    DOTENV_CRED_ID = "tripnara-dotenv-prod"
  }

  stages {
    stage('Precheck') {
      steps {
        sh '''
          set -e
          docker version
          # 检测 Docker Compose 命令（支持 V2 和 V1）
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

    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Write .env from Jenkins Credentials') {
      steps {
        withCredentials([string(credentialsId: "${DOTENV_CRED_ID}", variable: 'DOTENV')]) {
          sh '''
            set -eu
            umask 077
            printf "%s" "$DOTENV" > .env
            # 验证 .env 文件已写入
            if [ ! -f .env ]; then
              echo "❌ 错误: .env 文件未创建"
              exit 1
            fi
            echo "✅ .env 文件已创建"
            # 验证 SMTP 配置（不显示敏感信息）
            if grep -q "^SMTP_" .env; then
              echo "✅ .env 文件中包含 SMTP 配置"
              grep "^SMTP_" .env | sed 's/PASSWORD=.*/PASSWORD=***/' || true
            else
              echo "⚠️  警告: .env 文件中未找到 SMTP 配置"
              echo "请检查 Jenkins Credentials 配置"
            fi
          '''
        }
      }
    }

    stage('Build') {
      options {
        timeout(time: 30, unit: 'MINUTES')
      }
      steps {
        sh '''
          set -eu
          # 读取或检测 Docker Compose 命令
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
          (
            while true; do
              sleep 30
              echo "[$(date +'%H:%M:%S')] 构建仍在进行中，请稍候..."
            done
          ) &
          HEARTBEAT_PID=$!
          # 执行构建，使用 --progress=plain 确保实时输出
          if ${DOCKER_COMPOSE_CMD} build --progress=plain; then
            kill $HEARTBEAT_PID 2>/dev/null || true
            echo "✅ Docker 镜像构建完成"
          else
            kill $HEARTBEAT_PID 2>/dev/null || true
            echo "❌ Docker 镜像构建失败"
            exit 1
          fi
        '''
      }
    }

    stage('Migrate') {
      steps {
        sh '''
          set -eu
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
          if ! ${DOCKER_COMPOSE_CMD} --profile ops run --rm migrate; then
            echo "⚠️  迁移失败，尝试修复失败的迁移记录..."
            # 使用 Prisma migrate resolve 修复失败的迁移
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

    stage('Up') {
      steps {
        sh '''
          set -eu
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
          # 验证 .env 文件存在
          if [ ! -f .env ]; then
            echo "❌ 错误: .env 文件不存在，无法启动容器"
            exit 1
          fi
          echo "✅ .env 文件存在，继续启动容器..."
          # 停止并删除现有容器，确保重新加载环境变量
          ${DOCKER_COMPOSE_CMD} down 2>/dev/null || true
          # 重新创建并启动容器（强制重新创建以确保加载新的环境变量）
          ${DOCKER_COMPOSE_CMD} up -d --force-recreate --remove-orphans
          ${DOCKER_COMPOSE_CMD} ps
          # 验证环境变量是否已加载
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

  post {
    always {
      sh '''
        set +e
        # Jenkins-only 管理：部署完成删除 .env（下次部署会重新下发）
        rm -f .env
      '''
    }
  }
}