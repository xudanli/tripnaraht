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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OverpassService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverpassService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let OverpassService = OverpassService_1 = class OverpassService {
    constructor() {
        this.logger = new common_1.Logger(OverpassService_1.name);
        this.baseUrl = 'https://overpass-api.de/api/interpreter';
        this.axiosInstance = axios_1.default.create({
            timeout: 120000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'TripNARA/1.0 (tripnara@example.com)',
            },
        });
    }
    async fetchAttractionsByCountry(countryCode, tourismTypes) {
        var _a;
        try {
            const query = this.buildQuery(countryCode, tourismTypes);
            this.logger.log(`正在从 Overpass 获取 ${countryCode} 的景点数据...`);
            const response = await this.axiosInstance.post(this.baseUrl, `data=${encodeURIComponent(query)}`);
            const elements = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.elements) || [];
            this.logger.log(`成功获取 ${elements.length} 个景点`);
            return elements.map((el) => this.mapOverpassElementToPoi(el));
        }
        catch (error) {
            this.logger.error(`获取 ${countryCode} 景点数据失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildQuery(countryCode, tourismTypes) {
        const tourismFilter = tourismTypes && tourismTypes.length > 0
            ? `["tourism"~"${tourismTypes.join('|')}"]`
            : '["tourism"]';
        return `
      [out:json][timeout:60];
      area["ISO3166-1"="${countryCode}"][admin_level=2]->.searchArea;
      (
        node${tourismFilter}(area.searchArea);
        way${tourismFilter}(area.searchArea);
        relation${tourismFilter}(area.searchArea);
      );
      out center;
    `.trim();
    }
    mapOverpassElementToPoi(el) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const isArea = !!el.center;
        const lat = isArea ? el.center.lat : el.lat;
        const lng = isArea ? el.center.lon : el.lon;
        const name = ((_a = el.tags) === null || _a === void 0 ? void 0 : _a.name) || ((_b = el.tags) === null || _b === void 0 ? void 0 : _b['name:en']) || 'Unnamed place';
        const nameEn = ((_c = el.tags) === null || _c === void 0 ? void 0 : _c['name:en']) || ((_d = el.tags) === null || _d === void 0 ? void 0 : _d.name);
        const category = ((_e = el.tags) === null || _e === void 0 ? void 0 : _e.tourism) || ((_f = el.tags) === null || _f === void 0 ? void 0 : _f.amenity) || ((_g = el.tags) === null || _g === void 0 ? void 0 : _g.natural) || 'other';
        const type = ((_h = el.tags) === null || _h === void 0 ? void 0 : _h.tourism) || ((_j = el.tags) === null || _j === void 0 ? void 0 : _j.amenity) || ((_k = el.tags) === null || _k === void 0 ? void 0 : _k.natural) || 'other';
        return {
            osmId: el.id,
            osmType: el.type,
            name,
            nameEn,
            lat,
            lng,
            category,
            type,
            rawTags: el.tags || {},
        };
    }
};
exports.OverpassService = OverpassService;
exports.OverpassService = OverpassService = OverpassService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], OverpassService);
//# sourceMappingURL=overpass.service.js.map