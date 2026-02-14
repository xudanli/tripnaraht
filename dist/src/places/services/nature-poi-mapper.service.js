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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NaturePoiMapperService = void 0;
const common_1 = require("@nestjs/common");
const nara_hint_service_1 = require("./nara-hint.service");
let NaturePoiMapperService = class NaturePoiMapperService {
    constructor(naraHintService) {
        this.naraHintService = naraHintService;
    }
    mapNaturePoiToActivitySlot(poi, options = {}) {
        var _a, _b;
        const time = options.time || '09:30';
        const language = options.language || 'zh-CN';
        const nameEn = poi.name.en || poi.name.primary;
        const nameZh = poi.name.zh || poi.name.primary;
        const title = language === 'zh-CN'
            ? (nameZh || nameEn)
            : (nameEn || nameZh);
        const type = this.mapSubCategoryToActivityType(poi.subCategory);
        const durationMinutes = (_b = (_a = poi.typicalStay) === null || _a === void 0 ? void 0 : _a.recommendedMinutes) !== null && _b !== void 0 ? _b : this.getDefaultDurationBySubCategory(poi.subCategory, options.template);
        const tags = this.buildActivityTagsFromNaturePoi(poi);
        const naraHint = this.naraHintService.generateNaraHint(poi);
        return {
            time,
            title,
            activity: title,
            type,
            durationMinutes,
            coordinates: poi.coordinates,
            notes: this.buildDefaultNotesFromNaturePoi(poi),
            details: {
                name: {
                    chinese: nameZh,
                    english: nameEn,
                    local: poi.name.local,
                },
                coordinates: poi.coordinates,
                poiRef: {
                    source: poi.externalSource,
                    externalId: poi.externalId,
                    subCategory: poi.subCategory,
                    confidence: 0.95,
                },
                tags,
                naraHint,
            },
        };
    }
    mapSubCategoryToActivityType(sub) {
        switch (sub) {
            case 'volcano':
            case 'lava_field':
            case 'geothermal_area':
            case 'glacier':
            case 'glacier_lagoon':
            case 'waterfall':
            case 'canyon':
            case 'crater_lake':
                return 'nature';
            case 'black_sand_beach':
            case 'sea_cliff':
            case 'coastline':
                return 'coastal';
            case 'national_park':
            case 'nature_reserve':
                return 'nature_park';
            case 'viewpoint':
                return 'viewpoint';
            case 'cave':
                return 'explore';
            default:
                return 'nature';
        }
    }
    getDefaultDurationBySubCategory(sub, template) {
        if (template === 'photoStop')
            return 30;
        if (template === 'shortWalk')
            return 60;
        if (template === 'halfDayHike')
            return 180;
        switch (sub) {
            case 'waterfall':
            case 'viewpoint':
            case 'black_sand_beach':
                return 45;
            case 'glacier_lagoon':
            case 'national_park':
                return 120;
            case 'glacier':
            case 'canyon':
            case 'cave':
                return 180;
            case 'volcano':
            case 'lava_field':
                return 90;
            case 'geothermal_area':
            case 'hot_spring':
                return 60;
            default:
                return 60;
        }
    }
    buildActivityTagsFromNaturePoi(poi) {
        const tags = new Set(poi.tags || []);
        tags.add('nature');
        if (poi.subCategory === 'waterfall') {
            tags.add('photography');
            tags.add('water');
        }
        if (poi.subCategory === 'glacier' || poi.subCategory === 'glacier_lagoon') {
            tags.add('ice');
            tags.add('unique-landscape');
        }
        if (poi.subCategory === 'lava_field' || poi.subCategory === 'geothermal_area') {
            tags.add('geology');
            tags.add('unique-landscape');
        }
        if (poi.subCategory === 'volcano') {
            tags.add('geology');
            tags.add('extreme');
        }
        if (poi.subCategory === 'black_sand_beach') {
            tags.add('photography');
            tags.add('coastal');
        }
        if (poi.subCategory === 'canyon') {
            tags.add('hiking');
            tags.add('adventure');
        }
        if (poi.accessType === 'hike') {
            tags.add('hiking');
        }
        if (poi.accessType === '4x4') {
            tags.add('adventure');
            tags.add('off-road');
        }
        if (poi.requiresGuide) {
            tags.add('guided');
        }
        if (poi.trailDifficulty === 'hard' || poi.trailDifficulty === 'expert') {
            tags.add('challenging');
        }
        if (poi.trailDifficulty === 'easy') {
            tags.add('family-friendly');
        }
        return Array.from(tags);
    }
    buildDefaultNotesFromNaturePoi(poi) {
        const parts = [];
        if (poi.subCategory === 'waterfall') {
            parts.push('可准备防水外套，靠近瀑布区域水汽较大。');
        }
        if (poi.subCategory === 'lava_field') {
            parts.push('地表可能不平整，建议穿防滑登山鞋，避免踩在松动岩块上。');
        }
        if (poi.subCategory === 'glacier' || poi.subCategory === 'glacier_lagoon') {
            parts.push('注意保暖，冰川区域温度较低，建议穿着防滑鞋。');
        }
        if (poi.subCategory === 'geothermal_area' || poi.subCategory === 'hot_spring') {
            parts.push('地热区域地面可能较薄，请按指定路线行走，注意安全。');
        }
        if (poi.subCategory === 'volcano') {
            parts.push('火山区域请遵守安全规定，不要进入危险区域。');
            if (poi.isActiveVolcano) {
                parts.push('这是活火山，请关注官方安全提示。');
            }
        }
        if (poi.subCategory === 'black_sand_beach') {
            parts.push('黑沙滩海浪可能较大，请保持安全距离，注意海浪。');
        }
        if (poi.hazardLevel === 'high' || poi.hazardLevel === 'extreme') {
            parts.push('⚠️ 注意安全提示，有危险区域请勿擅自进入。');
        }
        if (poi.requiresGuide) {
            parts.push('此区域建议通过正规旅行团或向导带领前往。');
        }
        if (poi.accessType === '4x4') {
            parts.push('需要四驱车才能到达，普通车辆可能无法通行。');
        }
        if (poi.accessType === 'hike') {
            const difficulty = poi.trailDifficulty || 'unknown';
            if (difficulty === 'hard' || difficulty === 'expert') {
                parts.push('徒步路线较难，需要一定体力和经验。');
            }
        }
        if (poi.bestSeasons && poi.bestSeasons.length > 0) {
            const seasonNames = {
                spring: '春季',
                summer: '夏季',
                autumn: '秋季',
                winter: '冬季',
            };
            const seasonText = poi.bestSeasons.map(s => seasonNames[s]).join('、');
            parts.push(`最佳访问季节：${seasonText}。`);
        }
        if (poi.safetyNotes && poi.safetyNotes.length > 0) {
            parts.push(...poi.safetyNotes);
        }
        return parts.join(' ');
    }
    mapMultiplePoisToActivities(pois, options = {}) {
        return pois.map(poi => this.mapNaturePoiToActivitySlot(poi, options));
    }
};
exports.NaturePoiMapperService = NaturePoiMapperService;
exports.NaturePoiMapperService = NaturePoiMapperService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nara_hint_service_1.NaraHintService])
], NaturePoiMapperService);
//# sourceMappingURL=nature-poi-mapper.service.js.map