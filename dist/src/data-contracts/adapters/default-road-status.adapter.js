"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DefaultRoadStatusAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultRoadStatusAdapter = void 0;
const common_1 = require("@nestjs/common");
let DefaultRoadStatusAdapter = DefaultRoadStatusAdapter_1 = class DefaultRoadStatusAdapter {
    constructor() {
        this.logger = new common_1.Logger(DefaultRoadStatusAdapter_1.name);
    }
    async getRoadStatus(query) {
        this.logger.debug(`获取路况状态 (${query.lat}, ${query.lng})`);
        return {
            isOpen: true,
            riskLevel: 0,
            lastUpdated: new Date(),
            source: 'default',
            metadata: {
                note: '使用默认适配器，未接入实际路况数据源',
            },
        };
    }
    async getRoadStatuses(query) {
        if (!query.segments || query.segments.length === 0) {
            return [await this.getRoadStatus(query)];
        }
        const statuses = [];
        for (const segment of query.segments) {
            const segmentQuery = {
                lat: segment.from.lat,
                lng: segment.from.lng,
                segments: [{ from: segment.from, to: segment.to }],
            };
            const status = await this.getRoadStatus(segmentQuery);
            statuses.push(status);
        }
        return statuses;
    }
    getSupportedCountries() {
        return ['*'];
    }
    getPriority() {
        return 100;
    }
    getName() {
        return 'Default Road Status';
    }
};
exports.DefaultRoadStatusAdapter = DefaultRoadStatusAdapter;
exports.DefaultRoadStatusAdapter = DefaultRoadStatusAdapter = DefaultRoadStatusAdapter_1 = __decorate([
    (0, common_1.Injectable)()
], DefaultRoadStatusAdapter);
//# sourceMappingURL=default-road-status.adapter.js.map