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
var RoadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
const road_conditions_dto_1 = require("../dto/road-conditions.dto");
let RoadService = RoadService_1 = class RoadService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RoadService_1.name);
        this.baseURL = 'https://www.road.is';
        this.httpClient = http_client_factory_1.HttpClientFactory.create({
            baseURL: this.baseURL,
            timeout: 10000,
        });
    }
    async getRoadConditions(query) {
        try {
            try {
                const fRoads = query.fRoads ? query.fRoads.split(',') : [];
                const response = await this.httpClient.get('/api/roads', {
                    params: {
                        type: 'f-road',
                        roads: fRoads.join(','),
                        status: query.status,
                    },
                });
                return this.parseRoadResponse(response.data, query);
            }
            catch (apiError) {
                this.logger.warn(`road.is API调用失败: ${apiError.message}，使用模拟数据`);
                return this.getMockRoadData(query);
            }
        }
        catch (error) {
            this.logger.error(`获取road.is路况信息失败: ${error.message}`);
            throw error;
        }
    }
    parseRoadResponse(data, query) {
        const fRoads = (data.roads || []).map((road) => ({
            id: road.id || `road-${road.fRoadNumber}`,
            name: road.name || road.fRoadNumber,
            fRoadNumber: road.fRoadNumber || '',
            startPoint: road.startPoint || { lat: 0, lng: 0 },
            endPoint: road.endPoint || { lat: 0, lng: 0 },
            status: road.status || road_conditions_dto_1.RoadStatus.OPEN,
            condition: road.condition || road_conditions_dto_1.RoadCondition.DRY,
            isOpen: road.isOpen !== undefined ? road.isOpen : road.status === road_conditions_dto_1.RoadStatus.OPEN,
            description: road.description || '',
            lastUpdated: road.lastUpdated || new Date().toISOString(),
            expectedOpenTime: road.expectedOpenTime,
            expectedCloseTime: road.expectedCloseTime,
        }));
        return {
            fRoads: fRoads.filter((road) => {
                if (query.fRoads) {
                    const requestedRoads = query.fRoads.split(',');
                    if (!requestedRoads.includes(road.fRoadNumber)) {
                        return false;
                    }
                }
                if (query.status && road.status !== query.status) {
                    return false;
                }
                return true;
            }),
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            source: 'road.is',
        };
    }
    getMockRoadData(query) {
        const allFRoads = [
            {
                id: 'f208',
                name: 'F208 Landmannalaugar',
                fRoadNumber: 'F208',
                startPoint: { lat: 63.9330, lng: -21.0023 },
                endPoint: { lat: 63.9930, lng: -19.0618 },
                status: road_conditions_dto_1.RoadStatus.OPEN,
                condition: road_conditions_dto_1.RoadCondition.DRY,
                isOpen: true,
                description: 'F208开放，路况良好',
                lastUpdated: new Date().toISOString(),
            },
            {
                id: 'f225',
                name: 'F225 Landmannalaugar - Þórsmörk',
                fRoadNumber: 'F225',
                startPoint: { lat: 63.9930, lng: -19.0618 },
                endPoint: { lat: 63.6800, lng: -19.4800 },
                status: road_conditions_dto_1.RoadStatus.CAUTION,
                condition: road_conditions_dto_1.RoadCondition.WET,
                isOpen: true,
                description: 'F225开放，但需要谨慎驾驶，部分路段湿滑',
                lastUpdated: new Date().toISOString(),
            },
            {
                id: 'f26',
                name: 'F26 Sprengisandur',
                fRoadNumber: 'F26',
                startPoint: { lat: 64.0000, lng: -19.0000 },
                endPoint: { lat: 65.0000, lng: -18.0000 },
                status: road_conditions_dto_1.RoadStatus.OPEN,
                condition: road_conditions_dto_1.RoadCondition.DRY,
                isOpen: true,
                description: 'F26开放，路况良好',
                lastUpdated: new Date().toISOString(),
            },
            {
                id: 'f910',
                name: 'F910 Askja',
                fRoadNumber: 'F910',
                startPoint: { lat: 65.0000, lng: -16.8500 },
                endPoint: { lat: 65.0300, lng: -16.7500 },
                status: road_conditions_dto_1.RoadStatus.CAUTION,
                condition: road_conditions_dto_1.RoadCondition.MUDDY,
                isOpen: true,
                description: 'F910开放，但路况较差，需要4x4车辆',
                lastUpdated: new Date().toISOString(),
            },
            {
                id: 'f88',
                name: 'F88 Askja - North',
                fRoadNumber: 'F88',
                startPoint: { lat: 65.0300, lng: -16.7500 },
                endPoint: { lat: 65.5000, lng: -16.5000 },
                status: road_conditions_dto_1.RoadStatus.OPEN,
                condition: road_conditions_dto_1.RoadCondition.DRY,
                isOpen: true,
                description: 'F88开放，路况良好',
                lastUpdated: new Date().toISOString(),
            },
            {
                id: 'f249',
                name: 'F249 Þórsmörk',
                fRoadNumber: 'F249',
                startPoint: { lat: 63.7000, lng: -19.6000 },
                endPoint: { lat: 63.6800, lng: -19.4800 },
                status: road_conditions_dto_1.RoadStatus.CAUTION,
                condition: road_conditions_dto_1.RoadCondition.WET,
                isOpen: true,
                description: 'F249开放，需要渡河，水位较高',
                lastUpdated: new Date().toISOString(),
            },
        ];
        let filteredRoads = allFRoads;
        if (query.fRoads) {
            const requestedRoads = query.fRoads.split(',').map(r => r.trim().toUpperCase());
            filteredRoads = filteredRoads.filter(road => requestedRoads.includes(road.fRoadNumber.toUpperCase()));
        }
        if (query.status) {
            filteredRoads = filteredRoads.filter(road => road.status === query.status);
        }
        return {
            fRoads: filteredRoads,
            lastUpdated: new Date().toISOString(),
            source: 'road.is (mock)',
        };
    }
};
exports.RoadService = RoadService;
exports.RoadService = RoadService = RoadService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RoadService);
//# sourceMappingURL=road.service.js.map