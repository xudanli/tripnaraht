# 修复 "Could not read package.json" 错误

## 🔍 问题分析

从日志可以看到关键错误：

```
npm error path /package.json
npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/package.json'
```

**问题原因**:
1. npm 在根目录 `/` 下查找 `package.json`，而不是在项目目录
2. 配置文件中的 `cwd` 可能没有正确设置
3. 您使用的是 macOS (`/Users/gaozitai`)，但配置可能指向了 Linux 路径

## ✅ 解决方案

### 步骤 1: 找到您的实际项目路径

在终端中运行：

```bash
# 如果项目在 macOS 上
cd /path/to/your/project
pwd

# 或者如果项目在远程服务器上，需要找到正确的路径
```

### 步骤 2: 更新配置文件（macOS）

**macOS 配置文件位置**:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**正确的配置**（使用 `npx tsx` 而不是 `npm run`）:

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/path/to/your/actual/project"
    }
  }
}
```

**重要**: 
- 将 `/path/to/your/actual/project` 替换为您的**实际项目绝对路径**
- 使用 `npx tsx` 而不是 `npm run`，这样可以避免 `cwd` 问题

### 步骤 3: 如果项目在远程服务器上

如果您的项目在远程服务器（如 `/home/devbox/project`），但 Claude Desktop 在本地 macOS 上运行，您需要：

#### 选项 A: 使用 SSH 执行（推荐）

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "devbox@your-server",
        "cd /home/devbox/project && npx tsx src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/tmp"
    }
  }
}
```

#### 选项 B: 在本地 macOS 上克隆项目

如果可能，在本地 macOS 上克隆项目：

```bash
# 在 macOS 上
cd ~/Projects
git clone <your-repo-url> tripnara
cd tripnara
npm install
```

然后配置：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/Users/gaozitai/Projects/tripnara"
    }
  }
}
```

### 步骤 4: 验证配置

创建/更新配置文件后，验证 JSON 格式：

```bash
# macOS
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
```

如果 JSON 格式正确，应该能看到格式化的输出。

### 步骤 5: 完全重启 Claude Desktop

1. 完全退出 Claude Desktop
2. 重新启动
3. 检查连接状态

## 🔧 替代方案：使用完整路径的 npm

如果必须使用 `npm run`，确保 `cwd` 正确设置：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "/Users/gaozitai/.nvm/versions/node/v20.19.5/bin/npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/path/to/your/actual/project"
    }
  }
}
```

## 🐛 调试步骤

### 1. 确认项目路径存在

```bash
# 在 macOS 上
ls -la /path/to/your/project/package.json

# 应该能看到 package.json 文件
```

### 2. 测试命令是否工作

```bash
# 在项目目录下
cd /path/to/your/project
npx tsx src/mcp/mcp-skills-server.ts
```

如果这个命令可以工作，说明服务器本身没问题。

### 3. 检查配置文件

确保配置文件中的路径是**绝对路径**，不是相对路径。

## ✅ 成功标志

配置正确后，您应该看到：

1. ✅ 不再出现 "Could not read package.json" 错误
2. ✅ 服务器成功启动
3. ✅ Claude Desktop 显示 "Connected" 状态
4. ✅ 可以使用 TripNARA Skills

## 📝 快速修复命令（macOS）

如果您知道项目路径，可以快速创建配置文件：

```bash
# 替换 YOUR_PROJECT_PATH 为实际路径
PROJECT_PATH="/Users/gaozitai/Projects/tripnara"  # 修改这里

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
      "cwd": "${PROJECT_PATH}"
    }
  }
}
EOF

# 验证配置
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
```

