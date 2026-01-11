pipeline {
  agent any

  options {
    timestamps()
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
          docker compose version
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
          docker compose build
        '''
      }
    }

    stage('Migrate') {
      steps {
        sh '''
          set -eu
          docker compose --profile ops run --rm migrate
        '''
      }
    }

    stage('Up') {
      steps {
        sh '''
          set -eu
          docker compose up -d --remove-orphans
          docker compose ps
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