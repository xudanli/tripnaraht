#!/bin/bash
# 清除环境变量
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_MODEL
unset ANTHROPIC_AUTH_TOKEN

# 进入项目目录
cd /home/devbox/project

# 启动服务
npm run dev
