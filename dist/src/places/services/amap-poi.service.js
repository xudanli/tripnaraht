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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AmapPOIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmapPOIService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let AmapPOIService = AmapPOIService_1 = class AmapPOIService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(AmapPOIService_1.name);
        this.baseUrl = 'https://restapi.amap.com/v3';
        this.apiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('AMAP_API_KEY');
        this.axiosInstance = axios_1.default.create({
            timeout: 10000,
            params: {
                key: this.apiKey || '',
            },
        });
    }
    async getPOIDetails(name, lat, lng) {
        if (!this.apiKey) {
            this.logger.warn('高德地图 API Key 未配置，无法获取 POI 详情');
            return null;
        }
        try {
            const searchResult = await this.searchPOI(name, lat, lng);
            if (!searchResult || !searchResult.id) {
                this.logger.warn(`未找到 POI: ${name} (${lat}, ${lng})`);
                return null;
            }
            const detailResult = await this.getPOIDetail(searchResult.id);
            if (!detailResult) {
                return this.parseSearchResult(searchResult);
            }
            return this.parseDetailResult(detailResult);
        }
        catch (error) {
            this.logger.error(`获取 POI 详情失败: ${name} (${lat}, ${lng}) - ${error.message}`, error.stack);
            return null;
        }
    }
    async searchPOIByName(name, city) {
        if (!this.apiKey) {
            this.logger.warn('高德地图 API Key 未配置，无法搜索 POI');
            return null;
        }
        try {
            let keywords = name;
            if (city) {
                keywords = `${city} ${name}`;
            }
            let params = {
                keywords,
                offset: 1,
                page: 1,
                extensions: 'base',
            };
            let response = await this.axiosInstance.get(`${this.baseUrl}/place/text`, { params });
            let data = response.data;
            if (data.status === '1' && data.pois && data.pois.length > 0) {
                const poi = data.pois[0];
                const [lng, lat] = poi.location.split(',').map(parseFloat);
                this.logger.debug(`找到POI (名称搜索): ${name} -> ${poi.name}`);
                return {
                    lat,
                    lng,
                    amapId: poi.id,
                    address: poi.address,
                    name: poi.name,
                };
            }
            const simplifiedName = this.simplifyName(name);
            if (simplifiedName !== name) {
                keywords = city ? `${city} ${simplifiedName}` : simplifiedName;
                params = {
                    ...params,
                    keywords,
                };
                response = await this.axiosInstance.get(`${this.baseUrl}/place/text`, { params });
                data = response.data;
                if (data.status === '1' && data.pois && data.pois.length > 0) {
                    const poi = data.pois[0];
                    const [lng, lat] = poi.location.split(',').map(parseFloat);
                    this.logger.debug(`找到POI (简化名称): ${name} -> ${poi.name}`);
                    return {
                        lat,
                        lng,
                        amapId: poi.id,
                        address: poi.address,
                        name: poi.name,
                    };
                }
            }
            if (data.status !== '1') {
                const errorInfo = data.info || 'N/A';
                this.logger.warn(`名称搜索失败: status=${data.status}, info=${errorInfo}, 景点=${name}`);
                if (errorInfo === 'USER_DAILY_QUERY_OVER_LIMIT' || errorInfo.includes('QUERY_OVER_LIMIT')) {
                    return {
                        lat: 0,
                        lng: 0,
                        error: 'USER_DAILY_QUERY_OVER_LIMIT',
                    };
                }
            }
            else if (!data.pois || data.pois.length === 0) {
                this.logger.debug(`名称搜索失败: 未找到匹配的POI, 景点=${name}`);
            }
            return null;
        }
        catch (error) {
            this.logger.error(`名称搜索POI失败: ${name} - ${error.message}`);
            if (error.response) {
                this.logger.error(`API响应: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }
    async searchPOI(name, lat, lng) {
        try {
            let params = {
                keywords: name,
                location: `${lng},${lat}`,
                radius: 1000,
                offset: 1,
                page: 1,
                extensions: 'base',
            };
            let response = await this.axiosInstance.get(`${this.baseUrl}/place/text`, { params });
            let data = response.data;
            if (data.status === '1' && data.pois && data.pois.length > 0) {
                this.logger.debug(`找到POI (策略1-精确匹配): ${name}`);
                return data.pois[0];
            }
            if (data.status !== '1') {
                this.logger.debug(`策略1失败: status=${data.status}, info=${data.info || 'N/A'}, count=${data.count || 0}`);
            }
            else if (!data.pois || data.pois.length === 0) {
                this.logger.debug(`策略1失败: 未找到匹配的POI (count=${data.count || 0})`);
            }
            const simplifiedName = this.simplifyName(name);
            if (simplifiedName !== name) {
                params = {
                    ...params,
                    keywords: simplifiedName,
                    radius: 3000,
                };
                response = await this.axiosInstance.get(`${this.baseUrl}/place/text`, { params });
                data = response.data;
                if (data.status === '1' && data.pois && data.pois.length > 0) {
                    this.logger.debug(`找到POI (策略2-简化名称): ${name} -> ${simplifiedName}`);
                    return data.pois[0];
                }
                if (data.status !== '1') {
                    this.logger.debug(`策略2失败: status=${data.status}, info=${data.info || 'N/A'}, count=${data.count || 0}`);
                }
                else if (!data.pois || data.pois.length === 0) {
                    this.logger.debug(`策略2失败: 未找到匹配的POI (count=${data.count || 0})`);
                }
            }
            params = {
                ...params,
                keywords: simplifiedName,
                radius: 5000,
            };
            response = await this.axiosInstance.get(`${this.baseUrl}/place/text`, { params });
            data = response.data;
            if (data.status === '1' && data.pois && data.pois.length > 0) {
                this.logger.debug(`找到POI (策略3-扩大半径): ${name} -> ${simplifiedName}`);
                return data.pois[0];
            }
            if (data.status !== '1') {
                this.logger.warn(`所有策略失败: status=${data.status}, info=${data.info || 'N/A'}, count=${data.count || 0}, 景点=${name}`);
            }
            else if (!data.pois || data.pois.length === 0) {
                this.logger.debug(`所有策略失败: 未找到匹配的POI (count=${data.count || 0}), 景点=${name}`);
            }
            return null;
        }
        catch (error) {
            this.logger.error(`搜索 POI 失败: ${name} (${lat}, ${lng}) - ${error.message}`);
            if (error.response) {
                this.logger.error(`API响应: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }
    simplifyName(name) {
        const patterns = [
            /^北京市[^市]*?区?/,
            /^上海市[^市]*?区?/,
            /^天津市[^市]*?区?/,
            /^重庆市[^市]*?区?/,
            /^[^省]+省[^市]+市[^区]*?区?/,
            /^[^市]+市[^区]*?区?/,
            /^[^自治区]+自治区[^市]+市/,
            /^[^自治区]+自治区[^盟]+盟/,
        ];
        let simplified = name;
        for (const pattern of patterns) {
            simplified = simplified.replace(pattern, '');
        }
        simplified = simplified.replace(/^[\s、，,]+/, '');
        return simplified || name;
    }
    async getPOIDetail(poiId) {
        try {
            const params = {
                id: poiId,
                extensions: 'all',
            };
            const response = await this.axiosInstance.get(`${this.baseUrl}/place/detail`, { params });
            const data = response.data;
            if (data.status === '1' && data.pois && data.pois.length > 0) {
                this.logger.debug(`成功获取POI详情: ${poiId}`);
                return data.pois[0];
            }
            if (data.status !== '1') {
                this.logger.warn(`获取POI详情失败: status=${data.status}, info=${data.info || 'N/A'}, poiId=${poiId}`);
            }
            else if (!data.pois || data.pois.length === 0) {
                this.logger.warn(`获取POI详情失败: 未找到POI详情, poiId=${poiId}`);
            }
            return null;
        }
        catch (error) {
            this.logger.error(`获取 POI 详情失败: poiId=${poiId}, ${error.message}`);
            if (error.response) {
                this.logger.error(`API响应: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
            }
            return null;
        }
    }
    parseSearchResult(poi) {
        return {
            type: poi.type || undefined,
            address: poi.address || undefined,
            tel: poi.tel || undefined,
            amapId: poi.id || undefined,
        };
    }
    parseDetailResult(poi) {
        const result = {
            amapId: poi.id,
            address: poi.address,
            tel: poi.tel,
            website: poi.website,
            email: poi.email,
            postcode: poi.postcode,
        };
        if (poi.business_time) {
            result.openingHours = poi.business_time;
            result.openingHoursStructured = this.parseOpeningHours(poi.business_time);
        }
        if (poi.cost) {
            result.ticketPrice = poi.cost;
            result.ticketPriceStructured = this.parseTicketPrice(poi.cost);
        }
        if (poi.type) {
            result.type = poi.type;
        }
        if (poi.tag) {
            if (typeof poi.tag === 'string') {
                result.highlights = poi.tag.split(',').map((t) => t.trim()).filter(Boolean);
            }
            else if (Array.isArray(poi.tag)) {
                result.highlights = poi.tag;
            }
        }
        const interestDimensions = [];
        if (poi.type) {
            const typeParts = poi.type.split(';');
            if (typeParts.length > 1) {
                interestDimensions.push(typeParts[1]);
            }
        }
        if (poi.tag) {
            const tags = typeof poi.tag === 'string'
                ? poi.tag.split(',').map((t) => t.trim())
                : poi.tag;
            interestDimensions.push(...tags);
        }
        if (poi.indoor_map === '1') {
            interestDimensions.push('室内导航');
        }
        if (interestDimensions.length > 0) {
            result.interestDimensions = interestDimensions.filter((value, index, self) => self.indexOf(value) === index);
        }
        return result;
    }
    parseOpeningHours(businessTime) {
        if (!businessTime)
            return undefined;
        const result = {};
        if (businessTime.includes('全天') || businessTime.includes('24小时')) {
            result.alwaysOpen = true;
            return result;
        }
        const weekdayMatch = businessTime.match(/周一至周五[：:]([^；;]+)/);
        if (weekdayMatch) {
            const timeRange = this.parseTimeRange(weekdayMatch[1]);
            if (timeRange) {
                result.weekday = timeRange;
            }
        }
        const saturdayMatch = businessTime.match(/周六[^：:]*[：:]([^；;]+)/);
        if (saturdayMatch) {
            const timeRange = this.parseTimeRange(saturdayMatch[1]);
            if (timeRange) {
                result.saturday = timeRange;
            }
        }
        const sundayMatch = businessTime.match(/周日[^：:]*[：:]([^；;]+)/);
        if (sundayMatch) {
            const timeRange = this.parseTimeRange(sundayMatch[1]);
            if (timeRange) {
                result.sunday = timeRange;
            }
        }
        if (!result.weekday && !result.saturday && !result.sunday) {
            const timeRange = this.parseTimeRange(businessTime);
            if (timeRange) {
                result.uniform = timeRange;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }
    parseTimeRange(timeStr) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*[-~至]\s*(\d{1,2}):(\d{2})/);
        if (match) {
            return {
                open: `${match[1].padStart(2, '0')}:${match[2]}`,
                close: `${match[3].padStart(2, '0')}:${match[4]}`,
            };
        }
        return null;
    }
    parseTicketPrice(cost) {
        if (!cost)
            return undefined;
        const result = {};
        if (cost.includes('免费') || cost.includes('0元')) {
            result.free = true;
            return result;
        }
        const priceMatch = cost.match(/(\d+(?:\.\d+)?)\s*元/);
        if (priceMatch) {
            result.basePrice = parseFloat(priceMatch[1]);
            result.currency = 'CNY';
        }
        const adultMatch = cost.match(/成人[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
        if (adultMatch) {
            result.adult = parseFloat(adultMatch[1]);
        }
        else if (result.basePrice) {
            result.adult = result.basePrice;
        }
        const childMatch = cost.match(/儿童[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
        if (childMatch) {
            result.child = parseFloat(childMatch[1]);
        }
        const studentMatch = cost.match(/学生[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
        if (studentMatch) {
            result.student = parseFloat(studentMatch[1]);
        }
        const seniorMatch = cost.match(/(老人|长者|优惠)[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
        if (seniorMatch) {
            result.senior = parseFloat(seniorMatch[2]);
        }
        result.raw = cost;
        return Object.keys(result).length > 0 ? result : undefined;
    }
    async batchGetPOIDetails(pois, batchSize = 10, delay = 200) {
        const results = [];
        for (let i = 0; i < pois.length; i += batchSize) {
            const batch = pois.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (poi) => {
                const data = await this.getPOIDetails(poi.name, poi.lat, poi.lng);
                return {
                    name: poi.name,
                    lat: poi.lat,
                    lng: poi.lng,
                    data,
                };
            }));
            results.push(...batchResults);
            if (i + batchSize < pois.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return results;
    }
};
exports.AmapPOIService = AmapPOIService;
exports.AmapPOIService = AmapPOIService = AmapPOIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AmapPOIService);
//# sourceMappingURL=amap-poi.service.js.map