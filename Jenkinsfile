pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
  }

  environment {
    DOCKER_USER     = 'loomtrip'
    IMAGE_NAME      = 'tripnara-backend'
    IMAGE_REPO      = "${DOCKER_USER}/${IMAGE_NAME}"
    DOCKER_CREDS_ID = 'dockerhub-creds'
    DOCKER_REGISTRY = 'https://index.docker.io/v1/'

    APP_PORT  = '3000'
    // 可选：后端 env 文件（放服务器上，不进 git）
    ENV_FILE  = '/opt/tripnara/.env'

    IMAGE_TAG = "${env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Docker Build') {
      steps {
        sh '''
          set -eux
          docker version
          docker build --pull --no-cache -t ${IMAGE_REPO}:${IMAGE_TAG} -t ${IMAGE_REPO}:latest .
        '''
      }
    }

    stage('Docker Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: "${DOCKER_CREDS_ID}",
          usernameVariable: 'DOCKERHUB_USER',
          passwordVariable: 'DOCKERHUB_PASS'
        )]) {
          sh '''
            set -eux
            echo "$DOCKERHUB_PASS" | docker login -u "$DOCKERHUB_USER" --password-stdin ${DOCKER_REGISTRY}
            docker push ${IMAGE_REPO}:${IMAGE_TAG}
            docker push ${IMAGE_REPO}:latest
            docker logout ${DOCKER_REGISTRY} || true
          '''
        }
      }
    }

    stage('Deploy') {
      steps {
        // 注意：这里假设 Jenkins Agent 就在部署的目标服务器上
        // 如果不在，需要使用 ssh 远程执行命令
        sh """
          set -eux
          # 1. 停止并删除旧容器
          docker stop ${IMAGE_NAME} || true
          docker rm ${IMAGE_NAME} || true
          
          # 2. 拉取最新镜像
          docker pull ${IMAGE_REPO}:latest
          
          # 3. 运行新容器（检查环境变量文件是否存在）
          if [ -f "${ENV_FILE}" ]; then
            echo "使用环境变量文件: ${ENV_FILE}"
            docker run -d \\
              --name ${IMAGE_NAME} \\
              --restart unless-stopped \\
              -p ${APP_PORT}:${APP_PORT} \\
              --env-file ${ENV_FILE} \\
              ${IMAGE_REPO}:latest
          else
            echo "警告: 环境变量文件 ${ENV_FILE} 不存在，将使用容器内的默认环境变量"
            echo "如需使用环境变量文件，请确保文件存在于: ${ENV_FILE}"
            docker run -d \\
              --name ${IMAGE_NAME} \\
              --restart unless-stopped \\
              -p ${APP_PORT}:${APP_PORT} \\
              ${IMAGE_REPO}:latest
          fi
        """
      }
    }
  }
}
