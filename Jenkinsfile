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
          set -eu
          docker version
          # 检测 Docker Compose 命令（支持 V2 和 V1）
          if docker compose version >/dev/null 2>&1; then
            echo "使用 docker compose (V2)"
            echo "DOCKER_COMPOSE_CMD=docker compose" >> $WORKSPACE/.docker-compose-cmd
          elif docker-compose version >/dev/null 2>&1; then
            echo "使用 docker-compose (V1)"
            echo "DOCKER_COMPOSE_CMD=docker-compose" >> $WORKSPACE/.docker-compose-cmd
          else
            echo "错误: 未找到 docker compose 或 docker-compose 命令"
            exit 1
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
          # 检测并使用正确的 Docker Compose 命令
          if docker compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker compose"
          elif docker-compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker-compose"
          else
            echo "错误: 未找到 docker compose 或 docker-compose 命令"
            exit 1
          fi
          ${DOCKER_COMPOSE_CMD} build
        '''
      }
    }

    stage('Migrate') {
      steps {
        sh '''
          set -eu
          # 检测并使用正确的 Docker Compose 命令
          if docker compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker compose"
          elif docker-compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker-compose"
          else
            echo "错误: 未找到 docker compose 或 docker-compose 命令"
            exit 1
          fi
          ${DOCKER_COMPOSE_CMD} --profile ops run --rm migrate
        '''
      }
    }

    stage('Up') {
      steps {
        sh '''
          set -eu
          # 检测并使用正确的 Docker Compose 命令
          if docker compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker compose"
          elif docker-compose version >/dev/null 2>&1; then
            DOCKER_COMPOSE_CMD="docker-compose"
          else
            echo "错误: 未找到 docker compose 或 docker-compose 命令"
            exit 1
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