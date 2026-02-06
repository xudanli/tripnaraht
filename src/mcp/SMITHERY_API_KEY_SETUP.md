# Smithery API Key 申请步骤指南

## 📋 完整申请流程

### 步骤 1: 访问 Smithery 网站

1. **打开浏览器**
2. **访问 Smithery 官网**: https://smithery.ai
3. **点击右上角的 "Login" 或 "Sign Up"**

---

### 步骤 2: 注册账户（如果还没有账户）

#### 方式 1: 使用邮箱注册

1. **点击 "Sign Up" 或 "Create Account"**
2. **填写注册信息**:
   - Email（邮箱地址）
   - Password（密码）
   - 确认密码
3. **点击 "Sign Up" 或 "Create Account"**
4. **检查邮箱**，点击验证链接（如果需要）

#### 方式 2: 使用第三方登录（如果支持）

- Google 账户
- GitHub 账户
- 其他支持的第三方登录方式

---

### 步骤 3: 登录账户

1. **访问登录页面**: https://smithery.ai/login
2. **输入邮箱和密码**
3. **点击 "Login" 或 "Sign In"**

---

### 步骤 4: 访问 API Keys 页面

登录后，有以下几种方式访问 API Keys 页面：

#### 方式 1: 直接访问 URL

在浏览器地址栏输入：

```
https://smithery.ai/account/api-keys
```

#### 方式 2: 通过账户菜单

1. **点击右上角的用户头像或账户图标**
2. **选择 "Account" 或 "Settings"**
3. **在左侧菜单中找到 "API Keys" 或 "API"**
4. **点击进入 API Keys 页面**

#### 方式 3: 通过导航菜单

1. **查看页面顶部或侧边栏的导航菜单**
2. **找到 "Account"、"Settings" 或 "API" 相关选项**
3. **点击进入 API Keys 页面**

---

### 步骤 5: 创建 API Key

1. **在 API Keys 页面，找到 "Create API Key" 或 "New API Key" 按钮**
2. **点击按钮**

3. **填写 API Key 信息**:
   - **Name（名称）**: 输入一个描述性的名称，例如：
     - `TripNara Development`
     - `TripNara Production`
     - `Airbnb MCP Integration`
   - **Description（描述）**: （可选）添加说明，例如：
     - `用于连接 Airbnb MCP 服务`
     - `开发环境使用`

4. **选择权限范围**（如果有选项）:
   - 通常默认权限即可
   - 确保有访问 Connect API 的权限

5. **点击 "Create" 或 "Generate" 按钮**

---

### 步骤 6: 复制并保存 API Key

**⚠️ 重要**: API Key 通常只显示一次，请立即复制保存！

1. **API Key 生成后，会显示在页面上**
   - 格式类似: `sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - 或类似: `v4.local.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

2. **立即复制 API Key**:
   - 点击复制按钮（如果有）
   - 或手动选中并复制（Ctrl+C / Cmd+C）

3. **安全保存 API Key**:
   - ✅ 保存到密码管理器（推荐）
   - ✅ 保存到项目的 `.env` 文件（不要提交到 Git）
   - ❌ 不要保存到代码文件中
   - ❌ 不要提交到版本控制系统
   - ❌ 不要分享给他人

---

### 步骤 7: 验证 API Key

#### 方式 1: 在项目中测试

1. **设置环境变量**:
   ```bash
   export SMITHERY_API_KEY="your-api-key-here"
   ```

2. **运行测试脚本**:
   ```bash
   npm run mcp:test:airbnb:connect
   ```

3. **如果连接成功，说明 API Key 有效**

#### 方式 2: 查看 API Key 状态

在 API Keys 页面，可以看到：
- API Key 列表
- 创建时间
- 最后使用时间
- 状态（Active / Inactive）

---

## 🔒 安全最佳实践

### ✅ 应该做的

1. **使用不同的 API Key 用于不同环境**
   - 开发环境: `TripNara Development`
   - 生产环境: `TripNara Production`

2. **定期轮换 API Key**
   - 每 3-6 个月更换一次
   - 删除不再使用的旧 Key

3. **限制 API Key 权限**
   - 只授予必要的权限
   - 使用最小权限原则

4. **监控 API Key 使用**
   - 定期检查使用情况
   - 发现异常立即撤销

### ❌ 不应该做的

1. **不要提交 API Key 到版本控制**
   - 确保 `.env` 在 `.gitignore` 中
   - 不要在代码中硬编码 API Key

2. **不要分享 API Key**
   - 不要通过邮件、聊天工具分享
   - 不要公开在文档或论坛中

3. **不要使用同一个 API Key 用于多个项目**
   - 为每个项目创建独立的 Key

---

## 🔄 管理 API Key

### 查看所有 API Keys

在 API Keys 页面可以看到：
- 所有已创建的 API Keys
- 创建时间
- 最后使用时间
- 状态

### 撤销/删除 API Key

如果需要撤销某个 API Key：

1. **在 API Keys 页面找到要删除的 Key**
2. **点击 "Delete" 或 "Revoke" 按钮**
3. **确认删除操作**

**注意**: 删除后，使用该 Key 的应用将无法继续工作。

### 重新生成 API Key

如果需要重新生成：

1. **删除旧的 API Key**
2. **创建新的 API Key**
3. **更新所有使用该 Key 的环境变量**

---

## ❓ 常见问题

### Q: 找不到 API Keys 页面？

A: 
- 确保已登录账户
- 尝试直接访问: https://smithery.ai/account/api-keys
- 检查账户权限，可能需要升级账户类型

### Q: API Key 格式是什么？

A: 
- 格式可能类似: `sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- 或: `v4.local.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- 长度通常在 32-64 个字符之间

### Q: API Key 丢失了怎么办？

A: 
- 在 API Keys 页面查看是否还能看到（但可能无法查看完整 Key）
- 如果无法查看，需要删除旧 Key 并创建新的
- 更新所有使用该 Key 的环境变量

### Q: API Key 有使用限制吗？

A: 
- 查看 Smithery 的定价页面了解限制
- 免费账户可能有请求频率限制
- 付费账户通常有更高的限制

### Q: 可以创建多个 API Key 吗？

A: 
- 通常可以创建多个 API Key
- 建议为不同环境创建不同的 Key
- 便于管理和追踪使用情况

---

## 📚 相关资源

- **Smithery 官网**: https://smithery.ai
- **API Keys 页面**: https://smithery.ai/account/api-keys
- **Connect API 文档**: https://smithery.ai/docs/use/connect-api
- **支持**: support@smithery.ai
- **Discord**: https://discord.gg/Afd38S5p9A

---

## 🎯 快速检查清单

完成以下步骤后，您就可以使用 Connect API 了：

- [ ] 注册/登录 Smithery 账户
- [ ] 访问 API Keys 页面
- [ ] 创建新的 API Key
- [ ] 复制并保存 API Key
- [ ] 设置环境变量 `SMITHERY_API_KEY`
- [ ] 运行测试脚本验证

---

**提示**: 如果遇到任何问题，可以：
1. 查看 Smithery 文档
2. 联系 Smithery 支持: support@smithery.ai
3. 加入 Discord 社区获取帮助
