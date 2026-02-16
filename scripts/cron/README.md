# TripNARA 定时任务配置

## 可用的定时任务

### 1. 天气预警同步 (weather-sync.sh)

同步主要旅行目的地的天气预警数据。

**执行频率建议**: 每 6 小时

**配置示例**:
```cron
0 */6 * * * /home/devbox/project/scripts/cron/weather-sync.sh >> /var/log/tripnara/weather-sync.log 2>&1
```

### 2. 数据校验 (data-validation.sh)

校验世界模型数据完整性。

**执行频率建议**: 每天凌晨 3 点

**配置示例**:
```cron
0 3 * * * /home/devbox/project/scripts/cron/data-validation.sh >> /var/log/tripnara/data-validation.log 2>&1
```

## 安装方法

### 方式一：直接使用 crontab

```bash
# 编辑 crontab
crontab -e

# 添加以下内容：
0 */6 * * * /home/devbox/project/scripts/cron/weather-sync.sh >> /var/log/tripnara/weather-sync.log 2>&1
0 3 * * * /home/devbox/project/scripts/cron/data-validation.sh >> /var/log/tripnara/data-validation.log 2>&1
```

### 方式二：使用 systemd timer

创建 `/etc/systemd/system/tripnara-weather-sync.timer`:

```ini
[Unit]
Description=TripNARA Weather Sync Timer

[Timer]
OnCalendar=*-*-* 00/6:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

创建 `/etc/systemd/system/tripnara-weather-sync.service`:

```ini
[Unit]
Description=TripNARA Weather Sync

[Service]
Type=oneshot
WorkingDirectory=/home/devbox/project
ExecStart=/usr/bin/npx ts-node scripts/sync-weather-alerts.ts
User=devbox
```

启用：
```bash
sudo systemctl enable tripnara-weather-sync.timer
sudo systemctl start tripnara-weather-sync.timer
```

## 日志位置

所有定时任务日志存储在 `/var/log/tripnara/` 目录下。

确保目录存在：
```bash
sudo mkdir -p /var/log/tripnara
sudo chown devbox:devbox /var/log/tripnara
```

## 手动执行

可以随时手动运行脚本进行测试：

```bash
# 天气同步
npx ts-node scripts/sync-weather-alerts.ts

# 数据校验
npx ts-node scripts/validate-world-model-data.ts
```
