# 路线难度评估 - Python依赖安装指南

## ⚠️ 当前错误

```
ModuleNotFoundError: No module named 'requests'
```

这是因为Python环境缺少必要的依赖包。

## 📦 需要安装的依赖

- `requests` - 用于HTTP请求（调用Google/Mapbox API）
- `pillow` (PIL) - 用于处理Mapbox Terrain-RGB瓦片图像

## 🔧 安装方法

### 方法1: 使用pip（推荐）

```bash
# 检查pip是否可用
python3 -m pip --version

# 如果pip可用，直接安装
pip install requests pillow

# 或使用python3 -m pip
python3 -m pip install requests pillow

# 如果遇到权限问题，使用--user
python3 -m pip install --user requests pillow
```

### 方法2: 使用系统包管理器（Ubuntu/Debian）

```bash
# 安装pip（如果还没有）
sudo apt-get update
sudo apt-get install python3-pip

# 安装依赖
pip3 install requests pillow

# 或直接安装系统包
sudo apt-get install python3-requests python3-pil
```

### 方法3: 使用虚拟环境（推荐用于生产环境）

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install requests pillow

# 使用虚拟环境时，需要确保后端服务在虚拟环境中运行
```

### 方法4: 使用requirements.txt

```bash
# 安装所有依赖
pip install -r requirements.txt

# requirements.txt 内容：
# requests>=2.31.0
# pillow>=10.0.0
```

## ✅ 验证安装

安装完成后，验证是否成功：

```bash
python3 -c "import requests; from PIL import Image; print('✅ 依赖安装成功')"
```

应该看到：`✅ 依赖安装成功`

## 🔄 重启服务

安装依赖后，**必须重启后端服务**才能生效：

```bash
# 停止当前服务（Ctrl+C）
# 然后重新启动
npm run backend:dev
```

## 🐳 Docker方案（可选）

如果系统环境难以安装依赖，可以考虑使用Docker：

```dockerfile
FROM node:18
RUN apt-get update && apt-get install -y python3 python3-pip
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY requirements.txt .
RUN pip3 install -r requirements.txt
COPY . .
RUN npm run backend:build
CMD ["npm", "run", "backend:start"]
```

## 📝 检查清单

- [ ] Python 3.9+ 已安装
- [ ] pip 已安装并可正常使用
- [ ] requests 包已安装
- [ ] pillow 包已安装
- [ ] 后端服务已重启

## 🆘 常见问题

### 问题1: "No module named pip"

**解决**:
```bash
# Ubuntu/Debian
sudo apt-get install python3-pip

# 或使用get-pip.py
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
python3 get-pip.py
```

### 问题2: 权限错误

**解决**: 使用 `--user` 标志
```bash
python3 -m pip install --user requests pillow
```

### 问题3: 安装后仍然报错

**可能原因**:
- 服务未重启（环境变量只在启动时加载）
- 使用了错误的Python解释器
- 虚拟环境未激活

**解决**: 
1. 确认Python路径：`which python3`
2. 确认包已安装：`python3 -c "import requests"`
3. 重启服务

## 🎯 快速检查命令

```bash
# 检查Python版本
python3 --version

# 检查pip
python3 -m pip --version

# 检查依赖
python3 -c "import requests; import PIL; print('OK')"

# 检查服务是否在运行
ps aux | grep "node.*main"
```

安装完依赖并重启服务后，API应该可以正常工作了！

