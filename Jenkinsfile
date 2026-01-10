pipeline {
    agent any
    
    tools {
        // 必须与您在 Manage Jenkins -> Tools 中设置的 NodeJS 名称一致
        nodejs 'node20' 
    }

    environment {
        // 【修改点】请填写您的 Docker Hub 用户名
        DOCKER_USER = 'loomtrip' 
        IMAGE_NAME = "tripnara-backend"
        // 对应您在 Jenkins 凭据中创建的 ID
        DOCKER_CREDS_ID = 'dockerhub-creds' 
    }

    stages {
        stage('Checkout') {
            steps {
                // 自动拉取当前分支代码
                checkout scm 
            }
        }

        stage('Build NestJS') {
            steps {
                sh 'npm install'
                sh 'npm run build'
            }
        }

        stage('Docker Build & Push') {
            steps {
                script {
                    // 构建镜像，包含构建 ID 标签和 latest 标签
                    def dockerImage = docker.build("${DOCKER_USER}/${IMAGE_NAME}:${env.BUILD_ID}")
                    
                    // 登录并推送至 Docker Hub
                    docker.withRegistry('', "${DOCKER_CREDS_ID}") {
                        dockerImage.push()
                        dockerImage.push('latest')
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                // 停止并清理旧容器，启动新容器
                // 注意：如果涉及 .env 变量，建议在 run 命令中通过 --env-file 挂载
                sh "docker stop ${IMAGE_NAME} || true"
                sh "docker rm ${IMAGE_NAME} || true"
                sh "docker run -d --name ${IMAGE_NAME} -p 3000:3000 ${DOCKER_USER}/${IMAGE_NAME}:latest"
            }
        }
    }
    
    post {
        success {
            echo 'TripNARA 后端部署成功！'
        }
        failure {
            echo '部署失败，请检查控制台输出。'
        }
    }
}