#!/bin/bash
# 世界模型数据校验定时任务
# 
# 使用方法：
#   1. 添加到 crontab: crontab -e
#   2. 添加以下行（每天凌晨3点执行）:
#      0 3 * * * /home/devbox/project/scripts/cron/data-validation.sh >> /var/log/tripnara/data-validation.log 2>&1

cd /home/devbox/project

# 设置环境变量
export NODE_ENV=production
export PATH=$PATH:/usr/local/bin

# 执行数据校验脚本
npx ts-node scripts/validate-world-model-data.ts --json

# 记录执行时间
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Data validation completed"
