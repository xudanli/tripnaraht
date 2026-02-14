"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DataUpdateSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataUpdateSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const data_collection_service_1 = require("./data-collection.service");
const data_quality_alert_service_1 = require("./data-quality-alert.service");
const geographic_data_update_config_1 = require("../config/geographic-data-update.config");
let DataUpdateSchedulerService = DataUpdateSchedulerService_1 = class DataUpdateSchedulerService {
    constructor(prisma, dataCollection, alertService) {
        this.prisma = prisma;
        this.dataCollection = dataCollection;
        this.alertService = alertService;
        this.logger = new common_1.Logger(DataUpdateSchedulerService_1.name);
        this.maxConcurrent = 5;
        this.maxRetries = 3;
    }
    async runUpdateTasks() {
        this.logger.log('开始执行数据自动更新任务...');
        try {
            const tasks = await this.getUpdateTasks();
            this.logger.log(`找到 ${tasks.length} 个需要更新的任务`);
            if (tasks.length === 0) {
                this.logger.log('没有需要更新的任务');
                return;
            }
            await this.executeUpdateTasksInParallel(tasks);
            this.logger.log('数据自动更新任务完成');
        }
        catch (error) {
            this.logger.error(`数据自动更新任务失败: ${error.message}`, error.stack);
        }
    }
    async getUpdateTasks() {
        const tasks = [];
        const knowledgeFiles = await this.prisma.knowledgeFile.findMany({
            where: {
                category: 'PHYSICAL_REALITY',
            },
            select: {
                filename: true,
                category: true,
                updatedAt: true,
            },
        });
        for (const file of knowledgeFiles) {
            const filename = file.filename;
            let dataType = 'unknown';
            let countryCode = 'UNKNOWN';
            if (filename.includes('road-status')) {
                dataType = 'road_status';
            }
            else if (filename.includes('ferry')) {
                dataType = 'ferry_schedules';
            }
            else if (filename.includes('weather')) {
                dataType = 'weather_windows';
            }
            const countryMatch = filename.match(/(ch|no|pe|is|gl|fo|nz|sj|ar)/i);
            if (countryMatch) {
                countryCode = countryMatch[1].toUpperCase();
            }
            let frequency;
            if (dataType === 'road_status' || dataType === 'weather_windows') {
                frequency = geographic_data_update_config_1.UpdateFrequency.DAILY;
            }
            else if (dataType === 'ferry_schedules') {
                frequency = geographic_data_update_config_1.UpdateFrequency.WEEKLY;
            }
            else {
                frequency = geographic_data_update_config_1.UpdateFrequency.MONTHLY;
            }
            if ((0, geographic_data_update_config_1.shouldUpdate)(file.updatedAt, frequency)) {
                tasks.push({
                    dataSource: file.filename,
                    dataType,
                    countryCode,
                    frequency,
                    lastUpdated: file.updatedAt,
                    priority: this.determinePriority(dataType, countryCode),
                });
            }
        }
        const geographicMonitors = await this.prisma.geographicDataQualityMonitor.findMany({
            select: {
                dataSource: true,
                dataType: true,
                countryCode: true,
                lastUpdated: true,
            },
        });
        for (const monitor of geographicMonitors) {
            let frequency;
            if (monitor.dataType === 'DEM') {
                frequency = geographic_data_update_config_1.GEOGRAPHIC_DATA_UPDATE_CONFIG.DEM.frequency;
            }
            else {
                frequency = geographic_data_update_config_1.GEOGRAPHIC_DATA_UPDATE_CONFIG.GEOGRAPHIC_FEATURES.frequency;
            }
            if ((0, geographic_data_update_config_1.shouldUpdate)(monitor.lastUpdated, frequency)) {
                tasks.push({
                    dataSource: monitor.dataSource,
                    dataType: monitor.dataType,
                    countryCode: monitor.countryCode,
                    frequency,
                    lastUpdated: monitor.lastUpdated,
                    priority: this.determinePriority(monitor.dataType, monitor.countryCode),
                });
            }
        }
        tasks.sort((a, b) => {
            const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        return tasks;
    }
    async executeUpdateTasksInParallel(tasks) {
        for (let i = 0; i < tasks.length; i += this.maxConcurrent) {
            const batch = tasks.slice(i, i + this.maxConcurrent);
            await Promise.all(batch.map(task => this.executeUpdateTask(task)));
            if (i + this.maxConcurrent < tasks.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    async executeUpdateTask(task) {
        const startTime = Date.now();
        this.logger.log(`执行更新任务: ${task.dataSource} (${task.dataType})`);
        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const collectedData = await this.dataCollection.collectData(task.dataSource, task.dataType, {
                    countryCode: task.countryCode,
                    source: this.determineSource(task.dataType),
                });
                const validationResult = await this.dataCollection.validateData(collectedData, task.dataType);
                if (!validationResult.valid) {
                    throw new Error(`数据验证失败: ${validationResult.errors.map(e => e.message).join(', ')}`);
                }
                const recordsUpdated = await this.dataCollection.indexData(collectedData, task.dataSource, task.dataType);
                const duration = Date.now() - startTime;
                this.logger.log(`更新任务成功: ${task.dataSource}，更新 ${recordsUpdated} 条记录，耗时 ${duration}ms`);
                return {
                    success: true,
                    dataSource: task.dataSource,
                    dataType: task.dataType,
                    recordsUpdated,
                    duration,
                };
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`更新任务失败 (尝试 ${attempt}/${this.maxRetries}): ${task.dataSource} - ${error.message}`);
                if (attempt < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        const duration = Date.now() - startTime;
        this.logger.error(`更新任务最终失败: ${task.dataSource} - ${lastError === null || lastError === void 0 ? void 0 : lastError.message}`);
        await this.alertService.createAlert({
            severity: 'HIGH',
            alertType: 'UPDATE_FAILED',
            message: `数据更新失败: ${task.dataSource} (${task.dataType})，已重试 ${this.maxRetries} 次`,
            details: {
                dataSource: task.dataSource,
                dataType: task.dataType,
                error: lastError === null || lastError === void 0 ? void 0 : lastError.message,
                attempts: this.maxRetries,
            },
        });
        return {
            success: false,
            dataSource: task.dataSource,
            dataType: task.dataType,
            error: lastError === null || lastError === void 0 ? void 0 : lastError.message,
            duration,
        };
    }
    determinePriority(dataType, countryCode) {
        const coreCountries = ['CH', 'NO', 'PE', 'IS'];
        const isCoreCountry = countryCode && coreCountries.includes(countryCode);
        const criticalTypes = ['road_status', 'weather_windows', 'DEM', 'ROADS'];
        const isCriticalType = criticalTypes.includes(dataType);
        if (isCoreCountry && isCriticalType) {
            return 'HIGH';
        }
        else if (isCoreCountry || isCriticalType) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
    determineSource(dataType) {
        const sourceMap = {
            road_status: 'road_status_api',
            ferry_schedules: 'ferry_api',
            weather_windows: 'weather_api',
            DEM: 'physical_reality_file',
            RIVERS: 'osm',
            MOUNTAINS: 'osm',
            ROADS: 'osm',
            COASTLINES: 'osm',
            PORTS: 'osm',
            RAILWAYS: 'osm',
        };
        return sourceMap[dataType] || 'unknown';
    }
};
exports.DataUpdateSchedulerService = DataUpdateSchedulerService;
__decorate([
    (0, schedule_1.Cron)('0 2 * * *', { timeZone: 'UTC' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DataUpdateSchedulerService.prototype, "runUpdateTasks", null);
exports.DataUpdateSchedulerService = DataUpdateSchedulerService = DataUpdateSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        data_collection_service_1.DataCollectionService,
        data_quality_alert_service_1.DataQualityAlertService])
], DataUpdateSchedulerService);
//# sourceMappingURL=data-update-scheduler.service.js.map