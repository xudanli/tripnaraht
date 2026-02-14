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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DataQualityMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQualityMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const data_quality_framework_service_1 = require("./data-quality-framework.service");
const data_quality_alert_service_1 = require("./data-quality-alert.service");
const postgresql_mcp_service_1 = require("../../mcp/postgresql-mcp.service");
let DataQualityMonitoringService = DataQualityMonitoringService_1 = class DataQualityMonitoringService {
    constructor(prisma, dataQualityFramework, alertService, postgresqlMcp) {
        this.prisma = prisma;
        this.dataQualityFramework = dataQualityFramework;
        this.alertService = alertService;
        this.postgresqlMcp = postgresqlMcp;
        this.logger = new common_1.Logger(DataQualityMonitoringService_1.name);
    }
    async runMonitoringTask() {
        this.logger.log('开始执行数据质量监控任务...');
        try {
            await this.monitorAllSources();
            const now = new Date();
            if (now.getMinutes() === 0) {
                await this.alertService.checkDataExpiry();
            }
            this.logger.log('数据质量监控任务完成');
        }
        catch (error) {
            this.logger.error(`数据质量监控任务失败: ${error.message}`, error.stack);
        }
    }
    async monitorAllSources() {
        const dataSources = await this.getDataSourceConfigs();
        const batchSize = 10;
        for (let i = 0; i < dataSources.length; i += batchSize) {
            const batch = dataSources.slice(i, i + batchSize);
            await Promise.all(batch.map(config => this.monitorSource(config)));
        }
    }
    async monitorSource(config) {
        try {
            this.logger.debug(`监控数据源: ${config.dataSource} (${config.dataType})`);
            const assessment = await this.assessSourceQuality(config);
            await this.upsertMonitorRecord(config, assessment);
            const alerts = await this.checkAlertRules(config, assessment);
            if (alerts.length > 0) {
                await Promise.all(alerts.map(alert => this.alertService.createAlert(alert)));
            }
        }
        catch (error) {
            this.logger.error(`监控数据源失败: ${config.dataSource} - ${error.message}`, error.stack);
        }
    }
    async assessSourceQuality(config) {
        const data = await this.fetchDataSourceData(config);
        const completeness = await this.assessCompleteness(config, data);
        const accuracy = await this.assessAccuracy(config, data);
        const consistency = await this.assessConsistency(config, data);
        const timeliness = await this.assessTimeliness(config, data);
        const traceability = await this.assessTraceability(config, data);
        const overallScore = this.calculateOverallScore({
            completeness,
            accuracy,
            consistency,
            timeliness,
            traceability,
        });
        return {
            completeness,
            accuracy,
            consistency,
            timeliness,
            traceability,
            overallScore,
            recordCount: data.recordCount,
            lastUpdated: data.lastUpdated,
        };
    }
    async assessCompleteness(config, data) {
        const requiredFields = this.getRequiredFields(config.dataType);
        const metric = this.dataQualityFramework.assessCompleteness(data, requiredFields, []);
        return metric.currentValue;
    }
    async assessAccuracy(config, data) {
        const validationRules = this.getValidationRules(config.dataType);
        const metric = this.dataQualityFramework.assessAccuracy(data, validationRules);
        return metric.currentValue;
    }
    async assessConsistency(config, data) {
        const metric = this.dataQualityFramework.assessConsistency(data);
        return metric.currentValue;
    }
    async checkDataIntegrity() {
        if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
            this.logger.warn('PostgreSQL MCP service not available, skipping data integrity check');
            return { issues: [], overallHealth: 1.0 };
        }
        try {
            const tripsWithoutDaysQuery = `
        SELECT 
          'trips_without_days' as issue_type,
          COUNT(*) as count
        FROM "Trip" t
        WHERE NOT EXISTS (
          SELECT 1 FROM "TripDay" td WHERE td.trip_id = t.id
        )
      `;
            const daysWithoutItemsQuery = `
        SELECT 
          'days_without_items' as issue_type,
          COUNT(*) as count
        FROM "TripDay" td
        WHERE NOT EXISTS (
          SELECT 1 FROM "ItineraryItem" ii WHERE ii.trip_day_id = td.id
        )
      `;
            const itemsWithoutPlacesQuery = `
        SELECT 
          'items_without_places' as issue_type,
          COUNT(*) as count
        FROM "ItineraryItem" ii
        WHERE ii.place_id IS NULL
      `;
            const orphanedPlacesQuery = `
        SELECT 
          'orphaned_places' as issue_type,
          COUNT(*) as count
        FROM "Place" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "ItineraryItem" ii WHERE ii.place_id = p.id
        )
      `;
            const [tripsWithoutDays, daysWithoutItems, itemsWithoutPlaces, orphanedPlaces] = await Promise.all([
                this.postgresqlMcp.query(tripsWithoutDaysQuery),
                this.postgresqlMcp.query(daysWithoutItemsQuery),
                this.postgresqlMcp.query(itemsWithoutPlacesQuery),
                this.postgresqlMcp.query(orphanedPlacesQuery),
            ]);
            const issues = [];
            if (tripsWithoutDays && tripsWithoutDays.length > 0 && tripsWithoutDays[0].count > 0) {
                issues.push({
                    issueType: 'trips_without_days',
                    count: Number(tripsWithoutDays[0].count),
                    description: '存在没有关联任何天的行程',
                });
            }
            if (daysWithoutItems && daysWithoutItems.length > 0 && daysWithoutItems[0].count > 0) {
                issues.push({
                    issueType: 'days_without_items',
                    count: Number(daysWithoutItems[0].count),
                    description: '存在没有关联任何行程项的天',
                });
            }
            if (itemsWithoutPlaces && itemsWithoutPlaces.length > 0 && itemsWithoutPlaces[0].count > 0) {
                issues.push({
                    issueType: 'items_without_places',
                    count: Number(itemsWithoutPlaces[0].count),
                    description: '存在没有关联地点的行程项',
                });
            }
            if (orphanedPlaces && orphanedPlaces.length > 0 && orphanedPlaces[0].count > 0) {
                issues.push({
                    issueType: 'orphaned_places',
                    count: Number(orphanedPlaces[0].count),
                    description: '存在没有被任何行程项引用的孤立地点',
                });
            }
            const totalIssues = issues.reduce((sum, issue) => sum + issue.count, 0);
            const overallHealth = totalIssues === 0 ? 1.0 : Math.max(0, 1.0 - totalIssues / 1000);
            return { issues, overallHealth };
        }
        catch (error) {
            this.logger.error(`数据完整性检查失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async assessTimeliness(config, data) {
        const now = new Date();
        const lastUpdated = data.lastUpdated;
        const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
        const threshold = config.freshnessThresholdHours;
        if (hoursSinceUpdate <= threshold) {
            return 1.0;
        }
        else {
            const penalty = Math.min((hoursSinceUpdate - threshold) * 0.1, 1.0);
            return Math.max(1.0 - penalty, 0.0);
        }
    }
    async assessTraceability(config, data) {
        let traceableFields = 0;
        let totalFields = 0;
        if (data.metadata) {
            totalFields++;
            if (data.metadata.source)
                traceableFields++;
            if (data.metadata.timestamp)
                traceableFields++;
            if (data.metadata.version)
                traceableFields++;
        }
        return totalFields > 0 ? traceableFields / totalFields : 1.0;
    }
    calculateOverallScore(metrics) {
        const weights = {
            completeness: 0.3,
            accuracy: 0.3,
            consistency: 0.2,
            timeliness: 0.15,
            traceability: 0.05,
        };
        return (metrics.completeness * weights.completeness +
            metrics.accuracy * weights.accuracy +
            metrics.consistency * weights.consistency +
            metrics.timeliness * weights.timeliness +
            metrics.traceability * weights.traceability);
    }
    async checkAlertRules(config, assessment) {
        const alerts = [];
        const monitor = await this.prisma.dataQualityMonitor.findUnique({
            where: {
                dataSource_dataType: {
                    dataSource: config.dataSource,
                    dataType: config.dataType,
                },
            },
        });
        if (!monitor) {
            return alerts;
        }
        if (assessment.overallScore < 0.6) {
            alerts.push({
                monitorId: monitor.id,
                severity: 'CRITICAL',
                alertType: 'QUALITY_CRITICAL',
                message: `数据质量严重不足: ${(assessment.overallScore * 100).toFixed(1)}%`,
                details: { overallScore: assessment.overallScore },
            });
        }
        if (assessment.overallScore < 0.8) {
            alerts.push({
                monitorId: monitor.id,
                severity: 'HIGH',
                alertType: 'QUALITY_LOW',
                message: `数据质量不足: ${(assessment.overallScore * 100).toFixed(1)}%`,
                details: { overallScore: assessment.overallScore },
            });
        }
        if (assessment.timeliness < 0.5) {
            alerts.push({
                monitorId: monitor.id,
                severity: 'HIGH',
                alertType: 'DATA_EXPIRED',
                message: '数据已过期，需要更新',
                details: { timeliness: assessment.timeliness },
            });
        }
        if (assessment.completeness < 0.9) {
            alerts.push({
                monitorId: monitor.id,
                severity: 'MEDIUM',
                alertType: 'COMPLETENESS_LOW',
                message: `数据完整性不足: ${(assessment.completeness * 100).toFixed(1)}%`,
                details: { completeness: assessment.completeness },
            });
        }
        return alerts;
    }
    async upsertMonitorRecord(config, assessment) {
        let status = 'HEALTHY';
        if (assessment.overallScore < 0.6) {
            status = 'CRITICAL';
        }
        else if (assessment.overallScore < 0.8) {
            status = 'WARNING';
        }
        await this.prisma.dataQualityMonitor.upsert({
            where: {
                dataSource_dataType: {
                    dataSource: config.dataSource,
                    dataType: config.dataType,
                },
            },
            create: {
                dataSource: config.dataSource,
                dataType: config.dataType,
                countryCode: config.countryCode,
                completeness: assessment.completeness,
                accuracy: assessment.accuracy,
                consistency: assessment.consistency,
                timeliness: assessment.timeliness,
                traceability: assessment.traceability,
                overallScore: assessment.overallScore,
                lastUpdated: assessment.lastUpdated,
                lastVerified: new Date(),
                recordCount: assessment.recordCount,
                status,
            },
            update: {
                completeness: assessment.completeness,
                accuracy: assessment.accuracy,
                consistency: assessment.consistency,
                timeliness: assessment.timeliness,
                traceability: assessment.traceability,
                overallScore: assessment.overallScore,
                lastUpdated: assessment.lastUpdated,
                lastVerified: new Date(),
                recordCount: assessment.recordCount,
                status,
            },
        });
    }
    async getDataSourceConfigs() {
        const knowledgeFiles = await this.prisma.knowledgeFile.findMany({
            where: {
                category: 'PHYSICAL_REALITY',
                filename: {
                    contains: 'road-status',
                },
            },
            select: {
                filename: true,
                category: true,
                updatedAt: true,
            },
        });
        return knowledgeFiles.map(file => {
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
            return {
                dataSource: file.filename,
                dataType,
                countryCode,
                freshnessThresholdHours: this.getFreshnessThreshold(dataType),
                qualityThreshold: 0.8,
            };
        });
    }
    async fetchDataSourceData(config) {
        const knowledgeFile = await this.prisma.knowledgeFile.findFirst({
            where: {
                filename: config.dataSource,
                category: 'PHYSICAL_REALITY',
            },
            include: {
                chunks: {
                    select: {
                        id: true,
                        metadata: true,
                    },
                    take: 1,
                },
            },
        });
        if (!knowledgeFile) {
            return {
                recordCount: 0,
                lastUpdated: new Date(),
            };
        }
        return {
            recordCount: knowledgeFile.chunks.length,
            lastUpdated: knowledgeFile.updatedAt,
            metadata: {
                filename: knowledgeFile.filename,
                category: knowledgeFile.category,
            },
            sampleData: {},
        };
    }
    getRequiredFields(dataType) {
        const fieldMap = {
            road_status: ['segments', 'region', 'countryCode'],
            ferry_schedules: ['routes', 'origin', 'destination'],
            weather_windows: ['regions', 'center', 'countryCode'],
        };
        return fieldMap[dataType] || [];
    }
    getValidationRules(dataType) {
        const rules = {
            road_status: {
                'segments[].start.lat': (v) => typeof v === 'number' && v >= -90 && v <= 90,
                'segments[].start.lng': (v) => typeof v === 'number' && v >= -180 && v <= 180,
            },
            ferry_schedules: {
                'routes[].origin.lat': (v) => typeof v === 'number' && v >= -90 && v <= 90,
                'routes[].origin.lng': (v) => typeof v === 'number' && v >= -180 && v <= 180,
            },
            weather_windows: {
                'regions[].center.lat': (v) => typeof v === 'number' && v >= -90 && v <= 90,
                'regions[].center.lng': (v) => typeof v === 'number' && v >= -180 && v <= 180,
            },
        };
        return rules[dataType] || {};
    }
    getFreshnessThreshold(dataType) {
        const thresholds = {
            road_status: 24,
            ferry_schedules: 168,
            weather_windows: 6,
        };
        return thresholds[dataType] || 24;
    }
};
exports.DataQualityMonitoringService = DataQualityMonitoringService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DataQualityMonitoringService.prototype, "runMonitoringTask", null);
exports.DataQualityMonitoringService = DataQualityMonitoringService = DataQualityMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        data_quality_framework_service_1.DataQualityFrameworkService,
        data_quality_alert_service_1.DataQualityAlertService,
        postgresql_mcp_service_1.PostgreSQLMcpService])
], DataQualityMonitoringService);
//# sourceMappingURL=data-quality-monitoring.service.js.map