# Jenkins Docker Compose 插件安装指南

## 问题

Jenkins 容器中缺少 Docker Compose 插件，导致构建失败。

## 解决方案

通过在 Jenkins 镜像的 Dockerfile 中安装 Docker Compose 插件，确保 Jenkins 容器中始终有可用的 Docker Compose。

## 步骤

### 1. 创建 Dockerfile

在 Jenkins 部署目录（例如 `/srv/jenkins/`）创建 `Dockerfile`：

```dockerfile
FROM jenkins-with-docker:latest

USER root
ARG COMPOSE_VERSION=v2.29.7
RUN mkdir -p /usr/local/lib/docker/cli-plugins \
 && curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
 && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
 && /usr/local/lib/docker/cli-plugins/docker-compose version

USER jenkins
```

### 2. 更新 docker-compose.yml

将 Jenkins service 改为使用 `build` 而不是直接使用镜像：

```yaml
services:
  jenkins:
    build:
      context: .
      dockerfile: Dockerfile
    image: jenkins-with-docker:latest
    # ... 其他配置保持不变
```

### 3. 重建并重启 Jenkins

```bash
cd /srv/jenkins
docker compose up -d --build
docker exec -it jenkins sh -lc 'docker compose version'
```

## 验证

在 Jenkins 容器中验证 Docker Compose 是否可用：

```bash
docker exec -it jenkins sh -lc 'docker compose version'
```

应该看到类似输出：
```
Docker Compose version v2.29.7
```

## 优势

- ✅ 与系统无关，不依赖系统包管理器
- ✅ 使用官方二进制文件，稳定可靠
- ✅ 通过 Dockerfile 版本控制，易于维护
- ✅ 可以指定 Docker Compose 版本

## 注意事项

- 确保 Jenkins 容器有网络访问权限（下载二进制文件）
- 如果使用代理，需要在 Dockerfile 中配置代理环境变量
- 更新 Docker Compose 版本时，只需修改 `COMPOSE_VERSION` 参数并重新构建
