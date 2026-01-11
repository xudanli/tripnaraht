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
          '''
        }
      }
    }

    stage('Build') {
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
          ${DOCKER_COMPOSE_CMD} build
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
          ${DOCKER_COMPOSE_CMD} up -d --remove-orphans
          ${DOCKER_COMPOSE_CMD} ps
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