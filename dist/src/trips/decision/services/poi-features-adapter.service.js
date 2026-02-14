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
var PoiFeaturesAdapterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoiFeaturesAdapterService = void 0;
const common_1 = require("@nestjs/common");
const svalbard_poi_features_service_1 = require("../../../places/services/svalbard-poi-features.service");
const iceland_poi_features_service_1 = require("../../../places/services/iceland-poi-features.service");
let PoiFeaturesAdapterService = PoiFeaturesAdapterService_1 = class PoiFeaturesAdapterService {
    constructor(svalbardFeatures, icelandFeatures) {
        this.svalbardFeatures = svalbardFeatures;
        this.icelandFeatures = icelandFeatures;
        this.logger = new common_1.Logger(PoiFeaturesAdapterService_1.name);
    }
    async getPoiFeatures(context) {
        const { destination, region } = context;
        if (destination.startsWith('IS-') || destination === 'IS' || destination.includes('ICELAND')) {
            const regionKey = region || this.inferIcelandRegion(destination);
            this.logger.log(`获取冰岛 POI Features: ${regionKey}`);
            return await this.icelandFeatures.getIcelandFeatures(regionKey);
        }
        else if (destination.startsWith('SVALBARD') || destination.includes('LONGYEARBYEN')) {
            const regionKey = region || 'SVALBARD_LONGYEARBYEN';
            this.logger.log(`获取斯瓦尔巴 POI Features: ${regionKey}`);
            return await this.svalbardFeatures.getSvalbardFeatures(regionKey);
        }
        this.logger.warn(`未找到 POI Features 服务: ${destination}`);
        return null;
    }
    inferIcelandRegion(destination) {
        if (destination.includes('REYKJAVIK')) {
            return 'IS_REYKJAVIK';
        }
        else if (destination.includes('KEFLAVIK') || destination.includes('AIRPORT')) {
            return 'IS_KEFLAVIK_AIRPORT';
        }
        else if (destination.includes('GOLDEN_CIRCLE') || destination.includes('GOLDEN')) {
            return 'IS_GOLDEN_CIRCLE';
        }
        else if (destination.includes('SOUTH_COAST') || destination.includes('SOUTH')) {
            return 'IS_SOUTH_COAST';
        }
        else if (destination.includes('VIK')) {
            return 'IS_VIK';
        }
        else if (destination.includes('HOFN')) {
            return 'IS_HOFN';
        }
        return 'IS_REYKJAVIK';
    }
    isIcelandFeatures(features) {
        return 'attractions' in features && 'services' in features;
    }
    isSvalbardFeatures(features) {
        return 'ports' in features && 'trail' in features;
    }
};
exports.PoiFeaturesAdapterService = PoiFeaturesAdapterService;
exports.PoiFeaturesAdapterService = PoiFeaturesAdapterService = PoiFeaturesAdapterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [svalbard_poi_features_service_1.SvalbardPoiFeaturesService,
        iceland_poi_features_service_1.IcelandPoiFeaturesService])
], PoiFeaturesAdapterService);
//# sourceMappingURL=poi-features-adapter.service.js.map