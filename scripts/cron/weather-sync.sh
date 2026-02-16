#!/bin/bash
# 天气预警同步定时任务
# 
# 使用方法：
#   1. 添加到 crontab: crontab -e
#   2. 添加以下行（每6小时执行一次）:
#      0 */6 * * * /home/devbox/project/scripts/cron/weather-sync.sh >> /var/log/tripnara/weather-sync.log 2>&1
#
# 或者使用 systemd timer

cd /home/devbox/project

# 设置环境变量
export NODE_ENV=production
export PATH=$PATH:/usr/local/bin

# 执行天气同步脚本
npx ts-node scripts/sync-weather-alerts.ts

# 记录执行时间
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Weather sync completed"
