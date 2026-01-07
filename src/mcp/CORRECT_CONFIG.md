# 正确的配置步骤（使用远程服务器）

## ⚠️ 重要提示

配置文件必须在**本地 macOS**上创建，不是在远程服务器上！

---

## 📝 在本地 macOS 上执行以下命令

### 方法 1: 使用 SSH 别名（推荐，如果已配置）

如果您已经在 `~/.ssh/config` 中配置了 `tripnara` 别名：

```bash
# 在 macOS 终端执行（不是远程服务器）
mkdir -p ~/Library/Application\ Support/Claude

cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "tripnara",
        "bash -c 'source ~/.nvm/nvm.sh && cd /srv/tripnaraht && npx tsx src/mcp/mcp-skills-server.ts'"
      ]
    }
  }
}
EOF
```

### 方法 2: 直接使用 IP 地址

```bash
# 在 macOS 终端执行（不是远程服务器）
mkdir -p ~/Library/Application\ Support/Claude

cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "deploy@47.253.148.159",
        "bash -c 'source ~/.nvm/nvm.sh && cd /srv/tripnaraht && npx tsx src/mcp/mcp-skills-server.ts'"
      ]
    }
  }
}
EOF
```

### 方法 3: 如果使用 SSH 密钥文件

```bash
# 在 macOS 终端执行（不是远程服务器）
mkdir -p ~/Library/Application\ Support/Claude

cat > ~/Library/Application\ Support/Claude/claude_desktop_config.json << 'EOF'
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "ssh",
      "args": [
        "-i",
        "/Users/gaozitai/.ssh/id_ed25519",
        "deploy@47.253.148.159",
        "bash -c 'source ~/.nvm/nvm.sh && cd /srv/tripnaraht && npx tsx src/mcp/mcp-skills-server.ts'"
      ]
    }
  }
}
EOF
```

---

## 🔧 关键修正点

1. **去掉 `http://`**: SSH 命令不需要协议前缀
2. **使用正确的用户名**: `deploy`（不是 `devbox`）
3. **使用正确的路径**: `/srv/tripnaraht`（不是 `/home/devbox/project`）
4. **添加 nvm 加载**: 如果远程服务器使用 nvm，需要先加载
5. **在本地 macOS 执行**: 不是在远程服务器上

---

## ✅ 下一步操作

1. **在本地 macOS 终端执行上面的配置命令**（选择方法 1、2 或 3）

2. **测试 SSH 连接**（在 macOS 终端）:
   ```bash
   # 测试方法 1（如果使用别名）
   ssh tripnara "cd /srv/tripnaraht && pwd"
   
   # 或测试方法 2（直接 IP）
   ssh deploy@47.253.148.159 "cd /srv/tripnaraht && pwd"
   ```
   应该输出: `/srv/tripnaraht`

3. **测试 MCP Server 启动**（在 macOS 终端）:
   ```bash
   # 测试方法 1
   ssh tripnara "cd /srv/tripnaraht && npx tsx src/mcp/mcp-skills-server.ts"
   
   # 或测试方法 2
   ssh deploy@47.253.148.159 "cd /srv/tripnaraht && npx tsx src/mcp/mcp-skills-server.ts"
   ```
   如果看到 "MCP Skills Server ready" 或等待输入，说明正常（按 Ctrl+C 退出）

4. **完全重启 Claude Desktop**:
   - 完全退出 Claude Desktop（不是最小化）
   - 重新启动 Claude Desktop

5. **验证连接**:
   - 打开 Claude Desktop
   - 查看是否显示 "MCP tripnara-route-intel: Connected"
   - 如果显示错误，查看 Claude Desktop 的日志

---

## 🐛 如果遇到问题

### 问题 1: SSH 需要密码

**解决**: 确保已配置 SSH 密钥认证：
```bash
# 在 macOS 上测试
ssh tripnara
# 应该不需要输入密码
```

### 问题 2: nvm 未找到

**解决**: 如果远程服务器不使用 nvm，去掉 `source ~/.nvm/nvm.sh &&` 部分：
```json
"args": [
  "tripnara",
  "cd /srv/tripnaraht && npx tsx src/mcp/mcp-skills-server.ts"
]
```

### 问题 3: 路径不存在

**解决**: 确认远程服务器上的项目路径：
```bash
ssh tripnara "ls -la /srv/tripnaraht/package.json"
```

