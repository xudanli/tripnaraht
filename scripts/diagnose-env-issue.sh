#!/bin/bash
# 诊断环境变量问题脚本
# 用于排查为什么配置已添加但容器中看不到环境变量

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🔍 诊断环境变量问题..."
echo ""

# 1. 检查容器状态
echo "1️⃣ 检查容器状态..."
if ! docker ps | grep -q tripnara-app; then
    echo -e "${RED}❌ 容器 tripnara-app 未运行${NC}"
    exit 1
else
    echo -e "${GREEN}✅ 容器正在运行${NC}"
    docker ps | grep tripnara-app
fi
echo ""

# 2. 检查容器中的环境变量
echo "2️⃣ 检查容器中的环境变量..."
SMTP_VARS=$(docker exec tripnara-app env 2>/dev/null | grep SMTP || echo "")
if [ -z "$SMTP_VARS" ]; then
    echo -e "${RED}❌ 容器中未找到 SMTP 环境变量${NC}"
else
    echo -e "${GREEN}✅ 找到 SMTP 环境变量：${NC}"
    echo "$SMTP_VARS" | sed 's/PASSWORD=.*/PASSWORD=***/'
fi
echo ""

# 3. 检查容器启动参数
echo "3️⃣ 检查容器启动参数..."
CONTAINER_ENV_FILE=$(docker inspect tripnara-app 2>/dev/null | grep -A 5 "EnvFile" || echo "")
if [ -z "$CONTAINER_ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  容器启动参数中未找到 EnvFile 配置${NC}"
else
    echo "容器环境文件配置："
    echo "$CONTAINER_ENV_FILE"
fi
echo ""

# 4. 检查可能的 .env 文件位置
echo "4️⃣ 检查可能的 .env 文件位置..."
echo ""

# 自动检测常见的 Jenkins 工作目录
JENKINS_WORKSPACES=(
    "/var/jenkins_home/workspace"
    "/srv/jenkins/workspace"
    "/home/jenkins/workspace"
    "/opt/jenkins/workspace"
)

# 当前目录和常见项目路径
POSSIBLE_PATHS=(
    "$(pwd)/.env"
    "$HOME/project/.env"
    "$HOME/tripnara/.env"
)

# 尝试从 Jenkins 工作目录查找
for workspace_base in "${JENKINS_WORKSPACES[@]}"; do
    if [ -d "$workspace_base" ]; then
        echo "检查 Jenkins 工作目录: $workspace_base"
        # 查找包含 tripnara 的项目目录
        for project_dir in "$workspace_base"/tripnara*; do
            if [ -d "$project_dir" ] && [ -f "$project_dir/.env" ]; then
                POSSIBLE_PATHS+=("$project_dir/.env")
            fi
        done
    fi
done

FOUND_ENV=false
for path in "${POSSIBLE_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo -e "${GREEN}✅ 找到 .env 文件: $path${NC}"
        echo ""
        echo "文件内容（SMTP 相关，隐藏密码）："
        grep "^SMTP_" "$path" | sed 's/PASSWORD=.*/PASSWORD=***/' || echo "未找到 SMTP 配置"
        FOUND_ENV=true
        echo ""
        echo "文件权限："
        ls -la "$path"
        echo ""
        break
    fi
done

if [ "$FOUND_ENV" = false ]; then
    echo -e "${YELLOW}⚠️  未找到 .env 文件${NC}"
    echo ""
    echo "可能的原因："
    echo "  1. Jenkins 构建后已删除 .env 文件（正常行为，Jenkinsfile 在 post 阶段会删除）"
    echo "  2. .env 文件在其他位置"
    echo "  3. Jenkins 构建时未正确写入 .env 文件"
    echo ""
    echo "提示："
    echo "  - 查看 Jenkins 构建日志中的 'Write .env from Jenkins Credentials' 阶段"
    echo "  - 确认 Jenkins Credentials 配置是否正确"
    echo "  - 检查 Jenkins 工作目录路径"
fi
echo ""

# 5. 检查 docker-compose.yml 配置
echo "5️⃣ 检查 docker-compose.yml 配置..."
if [ -f docker-compose.yml ]; then
    echo "env_file 配置："
    grep -A 2 "env_file:" docker-compose.yml || echo "未找到 env_file 配置"
else
    echo -e "${YELLOW}⚠️  docker-compose.yml 文件不存在${NC}"
fi
echo ""

# 6. 检查容器工作目录
echo "6️⃣ 检查容器工作目录..."
CONTAINER_PWD=$(docker exec tripnara-app pwd 2>/dev/null || echo "")
echo "容器工作目录: $CONTAINER_PWD"
echo ""

CONTAINER_ENV_FILE=$(docker exec tripnara-app ls -la .env 2>/dev/null || echo "")
if [ -z "$CONTAINER_ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  容器内未找到 .env 文件${NC}"
else
    echo -e "${GREEN}✅ 容器内存在 .env 文件${NC}"
    echo "$CONTAINER_ENV_FILE"
fi
echo ""

# 7. 检查容器启动命令
echo "7️⃣ 检查容器启动命令..."
CONTAINER_CMD=$(docker inspect tripnara-app 2>/dev/null | grep -A 10 "Cmd" | head -5 || echo "")
echo "容器启动命令："
echo "$CONTAINER_CMD"
echo ""

# 8. 检查 Jenkins 构建日志位置提示
echo "8️⃣ 诊断建议..."
echo ""
echo "如果配置已添加但容器中还是没有环境变量，请检查："
echo ""
echo "1. Jenkins 构建日志："
echo "   - 查看 'Write .env from Jenkins Credentials' 阶段的日志"
echo "   - 确认 .env 文件是否已正确写入"
echo "   - 检查是否有错误信息"
echo ""
echo "2. Jenkins 工作目录："
echo "   - 确认 Jenkins 工作目录路径"
echo "   - 确认 docker-compose 是否在正确的工作目录运行"
echo ""
echo "3. 容器启动时机："
echo "   - 确认容器是在 .env 文件写入后启动的"
echo "   - 检查 Jenkinsfile 中 'Up' 阶段是否在 'Write .env' 阶段之后"
echo ""
echo "4. 配置格式："
echo "   - 确认 Jenkins Credentials 中的配置格式正确"
echo "   - 每个变量独立一行，值用引号包裹"
echo "   - 参考 JENKINS_ENV_FORMAT.md"
echo ""

# 9. 提供解决方案
echo "9️⃣ 解决方案..."
echo ""
echo "如果确认配置已添加，但容器中还是没有："
echo ""
echo "方案 1: 重新触发 Jenkins 构建（推荐）"
echo "  1. 在 Jenkins 中触发新的构建"
echo "  2. 等待构建完成"
echo "  3. 再次检查环境变量"
echo ""
echo "方案 2: 手动验证 Jenkins 构建"
echo "  1. 查看最近一次 Jenkins 构建日志"
echo "  2. 检查 'Write .env from Jenkins Credentials' 阶段"
echo "  3. 确认 .env 文件内容是否正确"
echo ""
echo "方案 3: 临时测试（仅用于调试）"
echo "  1. 在 Jenkins 工作目录创建 .env 文件"
echo "  2. 手动添加 SMTP 配置"
echo "  3. 运行: docker compose down && docker compose up -d"
echo "  4. 检查环境变量"
echo ""

echo "📋 诊断完成！"
