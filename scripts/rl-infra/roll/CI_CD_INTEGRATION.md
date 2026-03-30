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

## 🧪 Staging 严格验收 Gate（禁模拟/禁静默降级）

为确保 staging 使用真实 ROLL 链路，建议在 pipeline 中增加强制 gate：

- 使用 `docker-compose.yml + docker-compose.staging.yml`
- 使用 `.env.staging`
- 执行 `verify-staging-no-simulation.sh`
- 若出现模拟响应（如“模拟策略推理”）则立即失败

### Jenkins 示例（新增 stage）

```groovy
stage('Staging Strict Gate') {
  when {
    anyOf {
      changeset "scripts/rl-infra/roll/**"
      expression { env.DEPLOY_ENV == 'staging' }
    }
  }
  steps {
    dir('scripts/rl-infra/roll') {
      sh '''
        set -e
        docker compose --env-file .env.staging \
          -f docker-compose.yml -f docker-compose.staging.yml up -d
        sleep 10
        ./verify-staging-no-simulation.sh
      '''
    }
  }
  post {
    always {
      dir('scripts/rl-infra/roll') {
        sh 'docker compose -f docker-compose.yml -f docker-compose.staging.yml down || true'
      }
    }
  }
}
```

### GitHub Actions 示例（新增 job/step）

```yaml
- name: Start ROLL staging stack
  run: |
    cd scripts/rl-infra/roll
    docker compose --env-file .env.staging \
      -f docker-compose.yml -f docker-compose.staging.yml up -d

- name: Verify no simulation response
  run: |
    cd scripts/rl-infra/roll
    ./verify-staging-no-simulation.sh

- name: Teardown ROLL staging stack
  if: always()
  run: |
    cd scripts/rl-infra/roll
    docker compose -f docker-compose.yml -f docker-compose.staging.yml down || true
```

### Gate 通过标准（建议）

- `.env.staging` 中存在 `ROLL_BRIDGE_TIMEOUT_MS` 且为数字
- `ROLL_STRICT_MODE=true`
- `ROLL_ALLOW_SIMULATION=false`
- `ROLL_ALLOW_FALLBACK=false`
- `/health` 正常
- `/api/workers/status` 能看到 policy worker
- `verify-staging-no-simulation.sh` 返回 0

---

## 🛡️ Prod 放量守门 Gate（禁模拟 + 受控 Fallback）

已落地文件：

- `.github/workflows/roll-prod-guardrails-gate.yml`
- `scripts/rl-infra/roll/docker-compose.prod.yml`
- `scripts/rl-infra/roll/.env.prod`
- `scripts/rl-infra/roll/verify-prod-guardrails.sh`

### Prod Guardrail 目标

- 禁止模拟路径进入生产验收链路
- 允许受控 fallback（用于可用性保护），但必须可观测
- 发布前执行完整 guardrail 检查

### Prod Guardrail 默认配置

- `ROLL_BRIDGE_TIMEOUT_MS=10000`（可按环境调整，但必须显式配置）
- `ROLL_STRICT_MODE=true`
- `ROLL_ALLOW_SIMULATION=false`
- `ROLL_ALLOW_FALLBACK=true`

### GitHub Actions（已落地）

`roll-prod-guardrails-gate.yml` 包含双层检查：

- `prod-fast-gate`：配置与文件快速校验
- `prod-strict-gate`：compose 启动 + `/health` + `verify-prod-guardrails.sh`

### 可观测事件（日志建议接入告警）

- `event=simulation_blocked`
- `event=policy_fallback_used`
- `event=policy_fallback_blocked`

---

## ✅ Required Status Checks（分支保护建议）

### Staging / PR

- `staging-fast-gate`
- `staging-strict-gate`

### Main / Prod 发布前

- `prod-fast-gate`
- `prod-strict-gate`

---

## Week3 扩展（动态阈值 + 自动回滚）

已落地能力：

- 按流量档位动态阈值：
  - `scripts/rl-infra/roll/resolve-ramp-threshold-profile.sh`
  - `roll-prod-ramp-gate.yml` 在执行阈值检查前自动加载档位阈值
- 自动回滚触发工作流：
  - `.github/workflows/roll-auto-rollback.yml`
  - 支持 `workflow_dispatch` 与 `repository_dispatch(type=roll_auto_rollback)`
  - 支持 cool-down 防抖（默认 10 分钟，`ROLLBACK_COOLDOWN_MINUTES` 可调）
  - 支持连续窗口防抖（默认连续 2 个异常窗口，`ROLLBACK_MIN_CONSECUTIVE_WINDOWS` 可调）
  - cool-down 状态文件：
    - `scripts/rl-infra/roll/rollback-cooldown-state.env`
  - 连续窗口状态文件：
    - `scripts/rl-infra/roll/rollback-consecutive-state.env`
  - 触发条件（默认）：
    - `simulation_rate > 0`
    - `fallback_rate > 0.03`
    - `error_rate > 0.03`
- 发布健康评分：
  - `scripts/rl-infra/roll/generate-release-health-score.sh`
  - `.github/workflows/roll-release-health-score.yml`
  - 示例输入：
    - `scripts/rl-infra/roll/sample-release-health-metrics.json`
- Week1-3 总验收自动化：
  - `scripts/rl-infra/roll/verify-week1-3-readiness.sh`
  - `.github/workflows/roll-readiness-check.yml`
  - 触发方式：
    - 修改 `scripts/rl-infra/roll/**` 自动触发（push/PR）
    - `workflow_dispatch` 手动触发
  - 产物：
    - `week1-3-readiness-report.json`

建议：

- 每周例会统一产出 `release-health-score.json`，用于治理趋势跟踪。
- 监控系统可通过 `repository_dispatch` 直连回滚触发，示例见：
  - `scripts/rl-infra/roll/sample-roll-auto-rollback-payload.json`
  - `scripts/rl-infra/roll/ALERTMANAGER_GITHUB_DISPATCH.md`
  - `scripts/rl-infra/roll/trigger-roll-auto-rollback-dispatch.sh`

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

---

## 📎 RACI 参考（中文）

为统一发布责任边界，请将以下文件作为 Week1-3 发布期的责任与审批基准：

- `scripts/rl-infra/roll/RACI_WEEK1_3.md`

建议将下列事项纳入 CI/CD 发布前检查：

- 关键流（staging/prod/canary/rollback/ramp/readiness）RACI 无冲突
- Go/No-Go 审批链（A/C/R）明确且可执行
- 回滚流存在主 DRI 与备援 DRI
