# ROLL 架构 CI/CD 集成指南

**版本**: v1.0  
**日期**: 2026-01-21

---

## 📋 CI/CD 选项

### 1. Jenkins Pipeline

**适用场景**: 
- 企业级 CI/CD
- 需要复杂的工作流
- 需要与现有 Jenkins 基础设施集成

**配置文件**: `Jenkinsfile`

**Pipeline 阶段**:
1. **Checkout** - 代码检出
2. **Precheck** - 环境预检查
3. **Build** - 构建 Docker 镜像
4. **Test** - 运行测试
5. **Push Image** - 推送镜像到仓库（可选）
6. **Deploy to Kubernetes** - 部署到 Kubernetes（可选）

**使用步骤**:

```bash
# 1. 在 Jenkins 中创建 Pipeline Job
# 2. 配置 Git 仓库
# 3. 设置 Pipeline script from SCM
# 4. 指定 Jenkinsfile 路径: scripts/rl-infra/roll/Jenkinsfile
# 5. 配置环境变量（可选）:
#    - DOCKER_REGISTRY: 镜像仓库地址
#    - KUBECONFIG: Kubernetes 配置路径
#    - DEPLOY_ENV: 部署环境（production/staging）
```

**环境变量配置**:

```bash
# Jenkins Credentials
DOCKER_REGISTRY=your-registry.com
DOCKER_USERNAME=your-username
DOCKER_PASSWORD=your-password

# Kubernetes
KUBECONFIG=/path/to/kubeconfig
DEPLOY_ENV=production
```

---

### 2. GitHub Actions

**适用场景**:
- GitHub 仓库
- 需要简单的 CI/CD 流程
- 开源项目

**配置文件**: `.github/workflows/roll-ci.yml`

**工作流**:
1. **Test** - 运行测试
2. **Build** - 构建 Docker 镜像
3. **Deploy** - 部署到 Kubernetes

**使用步骤**:

```bash
# 1. 在 GitHub 仓库中创建 Secrets:
#    - DOCKER_USERNAME: Docker Hub 用户名
#    - DOCKER_PASSWORD: Docker Hub 密码
#    - KUBECONFIG: Kubernetes 配置（base64 编码）

# 2. 推送代码到 main/master 分支
git push origin main

# 3. GitHub Actions 自动触发
```

**Secrets 配置**:

```bash
# GitHub Repository Settings > Secrets > New secret
DOCKER_USERNAME=your-username
DOCKER_PASSWORD=your-password
KUBECONFIG=<base64-encoded-kubeconfig>
```

---

## 🔧 集成到现有 Jenkins Pipeline

### 在主 Jenkinsfile 中添加 ROLL 构建阶段

```groovy
pipeline {
  // ... 现有配置 ...
  
  stages {
    // ... 现有阶段 ...
    
    // ROLL Bridge Service 构建阶段
    stage('Build ROLL Bridge Service') {
      when {
        anyOf {
          changeset "scripts/rl-infra/roll/**"
          expression { env.BUILD_ROLL == 'true' }
        }
      }
      steps {
        dir('scripts/rl-infra/roll') {
          sh '''
            docker build -t roll-bridge-service:${BUILD_NUMBER} .
            docker tag roll-bridge-service:${BUILD_NUMBER} roll-bridge-service:latest
          '''
        }
      }
    }
    
    // ROLL Bridge Service 测试阶段
    stage('Test ROLL Bridge Service') {
      when {
        anyOf {
          changeset "scripts/rl-infra/roll/**"
          expression { env.BUILD_ROLL == 'true' }
        }
      }
      steps {
        dir('scripts/rl-infra/roll') {
          sh '''
            docker-compose up -d
            sleep 10
            curl -f http://localhost:8001/health || exit 1
            ./test_e2e_integration.sh || exit 1
            docker-compose down
          '''
        }
      }
    }
    
    // ROLL Bridge Service 部署阶段
    stage('Deploy ROLL Bridge Service') {
      when {
        branch 'main'
        anyOf {
          changeset "scripts/rl-infra/roll/**"
          expression { env.DEPLOY_ROLL == 'true' }
        }
      }
      steps {
        dir('scripts/rl-infra/roll') {
          sh '''
            kubectl set image deployment/roll-bridge-service \
              bridge-service=roll-bridge-service:${BUILD_NUMBER}
            kubectl rollout status deployment/roll-bridge-service
          '''
        }
      }
    }
  }
}
```

---

## 📊 CI/CD 流程

### 开发流程

```
开发者提交代码
  ↓
Git Push
  ↓
CI Pipeline 触发
  ↓
构建 Docker 镜像
  ↓
运行测试
  ↓
测试通过？
  ├─ 是 → 推送镜像到仓库
  └─ 否 → 通知开发者
```

### 部署流程

```
代码合并到 main/master
  ↓
CI Pipeline 触发
  ↓
构建生产镜像
  ↓
推送镜像到仓库
  ↓
部署到 Kubernetes
  ↓
健康检查
  ↓
部署成功？
  ├─ 是 → 通知团队
  └─ 否 → 自动回滚
```

---

## 🔄 回滚策略

### 自动回滚

**Jenkins Pipeline**:
```groovy
stage('Deploy') {
  steps {
    sh '''
      kubectl set image deployment/roll-bridge-service \
        bridge-service=roll-bridge-service:${BUILD_NUMBER}
      
      # 等待部署完成，如果失败则回滚
      if ! kubectl rollout status deployment/roll-bridge-service --timeout=300s; then
        echo "❌ 部署失败，执行回滚..."
        kubectl rollout undo deployment/roll-bridge-service
        exit 1
      fi
    '''
  }
}
```

**GitHub Actions**:
```yaml
- name: Deploy and Rollback on Failure
  run: |
    kubectl set image deployment/roll-bridge-service bridge-service=roll-bridge-service:${{ github.sha }}
    kubectl rollout status deployment/roll-bridge-service || {
      echo "部署失败，执行回滚..."
      kubectl rollout undo deployment/roll-bridge-service
      exit 1
    }
```

### 手动回滚

```bash
# 查看部署历史
kubectl rollout history deployment/roll-bridge-service

# 回滚到上一个版本
kubectl rollout undo deployment/roll-bridge-service

# 回滚到指定版本
kubectl rollout undo deployment/roll-bridge-service --to-revision=2
```

---

## 📈 监控和告警

### CI/CD 指标

- 构建时间
- 测试通过率
- 部署成功率
- 回滚次数

### 告警规则

- 构建失败 → 通知开发团队
- 测试失败 → 通知开发团队
- 部署失败 → 通知运维团队
- 回滚触发 → 通知运维团队

---

## ✅ CI/CD 检查清单

### Jenkins Pipeline

- [ ] Jenkinsfile 配置正确
- [ ] Docker 构建成功
- [ ] 测试通过
- [ ] 镜像推送成功（如配置）
- [ ] Kubernetes 部署成功（如配置）
- [ ] 健康检查通过
- [ ] 回滚机制测试通过

### GitHub Actions

- [ ] Workflow 文件配置正确
- [ ] Secrets 配置完成
- [ ] 测试通过
- [ ] 镜像推送成功
- [ ] Kubernetes 部署成功
- [ ] 健康检查通过

---

## 🚀 最佳实践

1. **版本标签**: 使用 Git commit SHA 或构建号作为镜像标签
2. **并行构建**: 测试和构建可以并行执行
3. **缓存优化**: 使用 Docker 层缓存加速构建
4. **测试隔离**: 每个测试使用独立的容器
5. **渐进式部署**: 先部署到测试环境，再部署到生产环境

---

**最后更新**: 2026-01-21  
**负责人**: RL Infrastructure 团队
