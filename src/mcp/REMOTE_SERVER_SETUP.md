# 远程服务器 MCP Server 配置指南

## 📋 场景说明

- **项目位置**: 远程服务器 (`/home/devbox/project`)
- **Claude Desktop**: 本地 macOS (`/Users/gaozitai`)
- **问题**: Claude Desktop 需要连接到远程服务器上的 MCP Server

---

## 🎯 解决方案

### 方案 1: 使用 SSH 执行（推荐）⭐

让 Claude Desktop 通过 SSH 在远程服务器上执行 MCP Server。

#### 步骤 1: 配置 SSH 密钥认证（如果还没有）

```bash
# 在 macOS 上生成 SSH 密钥（如果还没有）
ssh-keygen -t rsa -b 4096

# 将公钥复制到远程服务器
ssh-copy-id devbox@your-server-ip
# 或者手动复制
cat ~/.ssh/id_rsa.pub | ssh devbox@your-server-ip "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

#### 步骤 2: 测试 SSH 连接

```bash
# 在 macOS 上测试
ssh devbox@your-server-ip "cd /home/devbox/project && pwd"
# 应该输出: /home/devbox/project
```

#### 步骤 3: 创建 macOS 配置文件

```bash
# macOS 配置文件位置
mkdir -p ~/Library/Application\ Support/Claude

# 创建配置文件（替换 YOUR_SERVER_IP 和 USERNAME）
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "devbox@YOUR_SERVER_IP",
        "cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts"
      ]
    }
  }
}
EOF
```

**重要**: 将 `YOUR_SERVER_IP` 替换为您的实际服务器 IP 或域名。

#### 步骤 4: 如果使用 SSH 密钥文件

如果 SSH 使用特定的密钥文件：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "-i",
        "/Users/gaozitai/.ssh/id_rsa",
        "devbox@YOUR_SERVER_IP",
        "cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts"
      ]
    }
  }
}
```

#### 步骤 5: 如果 SSH 使用非标准端口

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "-p",
        "2222",
        "devbox@YOUR_SERVER_IP",
        "cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts"
      ]
    }
  }
}
```

---

### 方案 2: 在本地 macOS 克隆项目（更简单）⭐

如果可能，在本地 macOS 上克隆项目会更简单可靠。

#### 步骤 1: 在 macOS 上克隆项目

```bash
# 在 macOS 上
cd ~/Projects  # 或您喜欢的目录
git clone <your-repo-url> tripnara
# 或者如果使用 SSH
git clone devbox@your-server:/home/devbox/project tripnara

cd tripnara
npm install
```

#### 步骤 2: 配置本地路径

```bash
# 创建配置文件
mkdir -p ~/Library/Application\ Support/Claude
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << EOF
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "$(pwd)"
    }
  }
}
EOF
```

#### 步骤 3: 同步环境变量

如果项目需要 `.env` 文件，从远程服务器复制：

```bash
# 从远程服务器复制 .env
scp devbox@your-server:/home/devbox/project/.env ~/Projects/tripnara/.env
```

---

## 🔧 方案 1 详细配置（SSH）

### 完整配置示例

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "devbox@192.168.1.100",
        "cd /home/devbox/project && source ~/.nvm/nvm.sh && npx tsx src/mcp/mcp-skills-server.ts"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 如果使用 nvm

如果远程服务器使用 nvm，需要先加载 nvm：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "devbox@YOUR_SERVER_IP",
        "bash -c 'source ~/.nvm/nvm.sh && cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts'"
      ]
    }
  }
}
```

### 使用 SSH 配置文件

如果您的 `~/.ssh/config` 中有服务器配置：

```bash
# ~/.ssh/config
Host tripnara-server
    HostName your-server-ip
    User devbox
    IdentityFile ~/.ssh/id_rsa
    Port 22
```

那么配置可以简化为：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "tripnara-server",
        "cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts"
      ]
    }
  }
}
```

---

## 🧪 测试配置

### 测试 SSH 连接

```bash
# 在 macOS 上测试 SSH 命令
ssh devbox@YOUR_SERVER_IP "cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts"
```

如果这个命令可以启动服务器（会等待输入），说明 SSH 配置正确。

### 测试本地项目

```bash
# 在 macOS 上
cd ~/Projects/tripnara
npx tsx src/mcp/mcp-skills-server.ts
```

---

## 🐛 故障排除

### 问题 1: SSH 需要密码

**解决**: 配置 SSH 密钥认证（见方案 1 步骤 1）

### 问题 2: nvm 未加载

**解决**: 在 SSH 命令中添加 `source ~/.nvm/nvm.sh`

```json
"args": [
  "devbox@YOUR_SERVER_IP",
  "bash -c 'source ~/.nvm/nvm.sh && cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts'"
]
```

### 问题 3: 路径不存在

**解决**: 确认远程服务器上的项目路径：

```bash
ssh devbox@YOUR_SERVER_IP "ls -la /home/devbox/project/package.json"
```

### 问题 4: 权限问题

**解决**: 确保远程服务器上的文件有执行权限：

```bash
ssh devbox@YOUR_SERVER_IP "chmod +x /home/devbox/project/node_modules/.bin/tsx"
```

---

## ✅ 推荐方案

**推荐使用方案 2（本地克隆）**，因为：

1. ✅ 更简单，不需要 SSH 配置
2. ✅ 更可靠，不依赖网络连接
3. ✅ 更快，本地执行
4. ✅ 更容易调试

**如果必须使用远程服务器**，使用方案 1（SSH），但需要：

1. ✅ 配置 SSH 密钥认证
2. ✅ 确保 nvm 正确加载
3. ✅ 测试 SSH 命令可以执行

---

## 📝 快速配置脚本（方案 1 - SSH）

```bash
#!/bin/bash
# 在 macOS 上运行

SERVER_IP="your-server-ip"  # 修改这里
SERVER_USER="devbox"         # 修改这里
PROJECT_PATH="/home/devbox/project"

mkdir -p ~/Library/Application\ Support/Claude

cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << EOF
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "${SERVER_USER}@${SERVER_IP}",
        "bash -c 'source ~/.nvm/nvm.sh && cd ${PROJECT_PATH} && npx tsx src/mcp/mcp-skills-server.ts'"
      ]
    }
  }
}
EOF

echo "配置文件已创建: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "请修改 SERVER_IP 和 SERVER_USER，然后重启 Claude Desktop"
```

---

## 📝 快速配置脚本（方案 2 - 本地克隆）

```bash
#!/bin/bash
# 在 macOS 上运行

PROJECT_DIR="$HOME/Projects/tripnara"

# 克隆项目（如果还没有）
if [ ! -d "$PROJECT_DIR" ]; then
    echo "请先克隆项目到 $PROJECT_DIR"
    echo "git clone <your-repo-url> $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"
npm install

# 创建配置文件
mkdir -p ~/Library/Application\ Support/Claude
cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << EOF
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "${PROJECT_DIR}"
    }
  }
}
EOF

echo "✅ 配置完成！"
echo "配置文件: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "请重启 Claude Desktop"
```

---

## 🎯 下一步

1. 选择方案（推荐方案 2）
2. 按照步骤配置
3. 完全重启 Claude Desktop
4. 验证连接

