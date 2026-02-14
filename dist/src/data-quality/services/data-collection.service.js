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
var DataCollectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataCollectionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const geographic_data_validator_service_1 = require("./geographic-data-validator.service");
const data_quality_framework_service_1 = require("./data-quality-framework.service");
let DataCollectionService = DataCollectionService_1 = class DataCollectionService {
    constructor(prisma, geographicDataValidator, dataQualityFramework) {
        this.prisma = prisma;
        this.geographicDataValidator = geographicDataValidator;
        this.dataQualityFramework = dataQualityFramework;
        this.logger = new common_1.Logger(DataCollectionService_1.name);
    }
    async collectData(dataSource, dataType, config) {
        this.logger.log(`采集数据: ${dataSource} (${dataType}) from ${config.source}`);
        try {
            const adapter = this.getAdapter(config.source);
            const rawData = await adapter.collect(dataSource, dataType, config);
            return {
                data: rawData,
                metadata: {
                    source: config.source,
                    collectedAt: new Date(),
                    countryCode: config.countryCode,
                    dataSource,
                    dataType,
                },
            };
        }
        catch (error) {
            this.logger.error(`数据采集失败: ${dataSource} - ${error.message}`, error.stack);
            throw error;
        }
    }
    async validateData(rawData, dataType) {
        const errors = [];
        const warnings = [];
        if (!rawData.data) {
            errors.push({
                field: 'data',
                message: '数据为空',
            });
            return { valid: false, errors, warnings };
        }
        if (rawData.metadata.countryCode) {
            const coordinates = this.geographicDataValidator.extractCoordinatesFromPhysicalRealityData(rawData.data);
            if (coordinates.length > 0) {
                const coordValidation = this.geographicDataValidator.validateCoordinatesBatch(coordinates);
                if (!coordValidation.valid) {
                    errors.push(...coordValidation.errors);
                }
                warnings.push(...coordValidation.warnings);
                const spatialRangeValidation = this.geographicDataValidator.validateSpatialRange(coordinates, rawData.metadata.countryCode);
                if (!spatialRangeValidation.valid) {
                    errors.push(...spatialRangeValidation.errors);
                }
                warnings.push(...spatialRangeValidation.warnings);
            }
        }
        const requiredFields = this.getRequiredFields(dataType);
        const completeness = this.dataQualityFramework.assessCompleteness(rawData.data, requiredFields, []);
        if (completeness.currentValue < 0.8) {
            warnings.push({
                field: 'completeness',
                message: `数据完整性不足: ${(completeness.currentValue * 100).toFixed(1)}%`,
            });
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    async indexData(rawData, dataSource, dataType) {
        this.logger.log(`索引数据: ${dataSource} (${dataType})`);
        try {
            const chunks = this.chunkData(rawData.data, dataType);
            const knowledgeFile = await this.prisma.knowledgeFile.upsert({
                where: {
                    filename: dataSource,
                },
                create: {
                    filename: dataSource,
                    filepath: `data/physical-reality/${dataType}/${dataSource}`,
                    category: 'PHYSICAL_REALITY',
                    version: '1.0',
                    language: 'zh-CN',
                    credibilityScore: 0.95,
                    dataSources: [rawData.metadata.source],
                    lastUpdated: rawData.metadata.collectedAt,
                },
                update: {
                    lastUpdated: rawData.metadata.collectedAt,
                    dataSources: [rawData.metadata.source],
                },
            });
            await this.prisma.chunk.deleteMany({
                where: {
                    fileId: knowledgeFile.id,
                },
            });
            this.logger.log(`数据索引完成: ${dataSource}，生成 ${chunks.length} 个chunks`);
            return chunks.length;
        }
        catch (error) {
            this.logger.error(`数据索引失败: ${dataSource} - ${error.message}`, error.stack);
            throw error;
        }
    }
    getAdapter(source) {
        return new PhysicalRealityFileAdapter(this.prisma);
    }
    chunkData(data, dataType) {
        const chunks = [];
        if (dataType === 'road_status' && data.segments) {
            data.segments.forEach((segment, index) => {
                chunks.push({
                    content: `道路状态: ${segment.name || '未知路段'}，状态: ${segment.status || '未知'}`,
                    metadata: {
                        segmentIndex: index,
                        start: segment.start,
                        end: segment.end,
                    },
                });
            });
        }
        else if (dataType === 'ferry_schedules' && data.routes) {
            data.routes.forEach((route, index) => {
                var _a, _b;
                chunks.push({
                    content: `渡轮路线: ${((_a = route.origin) === null || _a === void 0 ? void 0 : _a.name) || '未知'} → ${((_b = route.destination) === null || _b === void 0 ? void 0 : _b.name) || '未知'}`,
                    metadata: {
                        routeIndex: index,
                        origin: route.origin,
                        destination: route.destination,
                    },
                });
            });
        }
        else if (dataType === 'weather_windows' && data.regions) {
            data.regions.forEach((region, index) => {
                chunks.push({
                    content: `天气窗口: ${region.name || '未知区域'}，最佳时间: ${region.bestTime || '未知'}`,
                    metadata: {
                        regionIndex: index,
                        center: region.center,
                    },
                });
            });
        }
        return chunks;
    }
    getRequiredFields(dataType) {
        const fieldMap = {
            road_status: ['segments', 'region', 'countryCode'],
            ferry_schedules: ['routes', 'origin', 'destination'],
            weather_windows: ['regions', 'center', 'countryCode'],
        };
        return fieldMap[dataType] || [];
    }
};
exports.DataCollectionService = DataCollectionService;
exports.DataCollectionService = DataCollectionService = DataCollectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        geographic_data_validator_service_1.GeographicDataValidatorService,
        data_quality_framework_service_1.DataQualityFrameworkService])
], DataCollectionService);
class PhysicalRealityFileAdapter {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async collect(dataSource, dataType, config) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(process.cwd(), 'data', 'physical-reality', dataType, `${dataSource}.json`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`数据文件不存在: ${filePath}`);
        }
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
    }
}
//# sourceMappingURL=data-collection.service.js.map