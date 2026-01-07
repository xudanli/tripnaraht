# MCP Server 连接问题故障排除

## ❌ 错误: "Server disconnected"

这个错误表示 Claude Desktop 无法连接到 MCP Server。让我们逐步排查。

---

## 🔍 诊断步骤

### 步骤 1: 检查配置文件

```bash
# Linux
cat ~/.config/Claude/claude_desktop_config.json

# 确保文件存在且格式正确
```

**正确的配置格式**:
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

**常见问题**:
- ❌ 路径使用相对路径（应该使用绝对路径）
- ❌ JSON 格式错误（缺少逗号、引号等）
- ❌ 路径不存在

### 步骤 2: 验证 npm 可用

```bash
which npm
# 应该输出: /usr/bin/npm 或类似路径

npm --version
# 应该输出版本号
```

如果 `which npm` 返回空，说明 npm 不在 PATH 中。

**解决方案**: 使用完整路径或修复 PATH。

### 步骤 3: 手动测试服务器启动

```bash
cd /home/devbox/project
npm run mcp:skills
```

**如果服务器启动失败**，您会看到错误信息。常见错误：

1. **依赖未安装**
   ```
   Error: Cannot find module 'xxx'
   ```
   解决: `npm install`

2. **TypeScript 错误**
   ```
   Error: Type error...
   ```
   解决: 检查代码错误

3. **环境变量问题**
   ```
   Error: ConfigService...
   ```
   解决: 检查 `.env` 文件

### 步骤 4: 检查项目路径

```bash
ls -la /home/devbox/project/package.json
# 应该能看到文件

ls -la /home/devbox/project/src/mcp/mcp-skills-server.ts
# 应该能看到文件
```

如果文件不存在，说明路径配置错误。

### 步骤 5: 检查权限

```bash
# 确保有执行权限
chmod +x /home/devbox/project/node_modules/.bin/tsx
```

---

## 🔧 解决方案

### 方案 1: 使用完整路径（如果 npm 不在 PATH 中）

找到 npm 的完整路径：
```bash
which npm
# 例如: /usr/bin/npm
```

然后修改配置文件：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "/usr/bin/npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project"
    }
  }
}
```

### 方案 2: 直接使用 npx tsx

如果 `npm run` 有问题，可以直接使用 `npx tsx`：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npx",
      "args": [
        "tsx",
        "src/mcp/mcp-skills-server.ts"
      ],
      "cwd": "/home/devbox/project"
    }
  }
}
```

### 方案 3: 使用 node 直接运行（需要先编译）

```bash
# 先编译
cd /home/devbox/project
npm run build
```

然后配置：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "node",
      "args": [
        "dist/src/mcp/mcp-skills-server.js"
      ],
      "cwd": "/home/devbox/project"
    }
  }
}
```

### 方案 4: 添加环境变量

如果服务器需要环境变量，可以在配置中添加：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## 🐛 常见错误和解决方案

### 错误 1: "Cannot find module"

**原因**: 依赖未安装

**解决**:
```bash
cd /home/devbox/project
npm install
```

### 错误 2: "Command not found: npm"

**原因**: npm 不在 PATH 中

**解决**: 
- 使用完整路径（见方案 1）
- 或修复系统 PATH

### 错误 3: "Server disconnected" 但手动运行正常

**原因**: 可能是权限问题或环境变量问题

**解决**:
1. 检查 Claude Desktop 是否有执行权限
2. 尝试使用方案 2（npx tsx）
3. 检查日志文件

### 错误 4: 服务器启动后立即退出

**原因**: 服务器在初始化时遇到错误

**解决**:
1. 手动运行服务器查看错误信息
2. 检查所有依赖是否正确安装
3. 检查 `.env` 文件是否存在

---

## 📋 检查清单

在报告问题前，请确认：

- [ ] 配置文件存在且格式正确
- [ ] 使用绝对路径（不是相对路径）
- [ ] npm 在系统 PATH 中或使用完整路径
- [ ] 项目路径正确且存在
- [ ] `package.json` 存在
- [ ] `src/mcp/mcp-skills-server.ts` 存在
- [ ] 依赖已安装（`npm install`）
- [ ] 服务器可以手动启动（`npm run mcp:skills`）
- [ ] Claude Desktop 已完全重启

---

## 🔍 获取更多信息

### 查看 Claude Desktop 日志

**Linux**:
```bash
# 查找日志文件
find ~/.config/Claude -name "*.log" -type f

# 查看最新日志
tail -f ~/.config/Claude/logs/*.log
```

### 启用详细日志

在配置文件中添加：
```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/home/devbox/project",
      "env": {
        "DEBUG": "*"
      }
    }
  }
}
```

### 测试服务器输出

手动运行服务器并观察输出：
```bash
cd /home/devbox/project
npm run mcp:skills 2>&1 | tee server.log
```

---

## 💡 调试技巧

1. **使用开发者设置**: 在 Claude Desktop 中点击 "Open developer settings" 查看详细错误信息

2. **分步测试**:
   - 先测试服务器能否手动启动
   - 再测试配置文件格式
   - 最后测试 Claude Desktop 连接

3. **简化配置**: 如果复杂配置不工作，尝试最简单的配置：
   ```json
   {
     "mcpServers": {
       "test": {
         "command": "echo",
         "args": ["hello"],
         "cwd": "/tmp"
       }
     }
   }
   ```
   如果这个也不工作，可能是 Claude Desktop 配置问题。

---

## 📞 需要帮助？

如果以上步骤都无法解决问题，请提供：

1. 操作系统版本
2. Node.js 和 npm 版本（`node --version`, `npm --version`）
3. 配置文件内容（隐藏敏感信息）
4. 手动运行服务器的完整输出
5. Claude Desktop 日志（如果有）

---

## ✅ 成功标志

配置成功后，您应该看到：

1. Claude Desktop 中 MCP Server 状态显示为 "Connected"
2. 可以使用 `tripnara.listSkills` 列出所有工具
3. 可以调用其他 TripNARA Skills

