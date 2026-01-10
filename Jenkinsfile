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
          docker build -t ${IMAGE_REPO}:${IMAGE_TAG} -t ${IMAGE_REPO}:latest .
        '''
      }
    }

    stage('Docker Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKER_CREDS_ID}", usernameVariable: 'DOCKERHUB_USER', passwordVariable: 'DOCKERHUB_PASS')]) {
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
        sh '''
          set -eux
          docker pull ${IMAGE_REPO}:latest
          docker stop ${IMAGE_NAME} || true
          docker rm ${IMAGE_NAME} || true

          ENV_ARGS=""
          if [ -f "${ENV_FILE}" ]; then
            ENV_ARGS="--env-file ${ENV_FILE}"
          fi

          docker run -d --name ${IMAGE_NAME} --restart=unless-stopped \
            -p ${APP_PORT}:${APP_PORT} \
            $ENV_ARGS \
            ${IMAGE_REPO}:latest
        '''
      }
    }
  }

  post {
    success { echo 'TripNARA 后端部署成功！' }
    failure { echo '部署失败，请检查控制台输出。' }
  }
}