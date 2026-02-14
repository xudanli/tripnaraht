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
var McpToolDispatcherService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpToolDispatcherService = void 0;
const common_1 = require("@nestjs/common");
const airbnb_service_1 = require("../../../../mcp/airbnb.service");
const weather_direct_service_1 = require("../../../../mcp/weather-direct.service");
const exa_service_1 = require("../../../../mcp/exa.service");
const google_calendar_service_1 = require("../../../../mcp/google-calendar.service");
const google_maps_direct_service_1 = require("../../../../mcp/google-maps-direct.service");
const hotel_direct_service_1 = require("../../../../mcp/hotel-direct.service");
const advanced_geocoding_service_1 = require("./advanced-geocoding.service");
let McpToolDispatcherService = McpToolDispatcherService_1 = class McpToolDispatcherService {
    constructor(airbnbService, weatherDirectService, exaService, googleCalendarService, googleMapsDirectService, hotelDirectService, advancedGeocodingService) {
        this.airbnbService = airbnbService;
        this.weatherDirectService = weatherDirectService;
        this.exaService = exaService;
        this.googleCalendarService = googleCalendarService;
        this.googleMapsDirectService = googleMapsDirectService;
        this.hotelDirectService = hotelDirectService;
        this.advancedGeocodingService = advancedGeocodingService;
        this.logger = new common_1.Logger(McpToolDispatcherService_1.name);
        this.locationNameMap = new Map([
            ['冰岛', 'Iceland'],
            ['日本', 'Japan'],
            ['韩国', 'South Korea'],
            ['泰国', 'Thailand'],
            ['新加坡', 'Singapore'],
            ['马来西亚', 'Malaysia'],
            ['印度尼西亚', 'Indonesia'],
            ['菲律宾', 'Philippines'],
            ['越南', 'Vietnam'],
            ['美国', 'United States'],
            ['加拿大', 'Canada'],
            ['澳大利亚', 'Australia'],
            ['新西兰', 'New Zealand'],
            ['英国', 'United Kingdom'],
            ['法国', 'France'],
            ['德国', 'Germany'],
            ['意大利', 'Italy'],
            ['西班牙', 'Spain'],
            ['挪威', 'Norway'],
            ['瑞典', 'Sweden'],
            ['芬兰', 'Finland'],
            ['丹麦', 'Denmark'],
            ['瑞士', 'Switzerland'],
            ['奥地利', 'Austria'],
            ['荷兰', 'Netherlands'],
            ['比利时', 'Belgium'],
            ['葡萄牙', 'Portugal'],
            ['希腊', 'Greece'],
            ['土耳其', 'Turkey'],
            ['北京', 'Beijing'],
            ['北京市', 'Beijing'],
            ['上海', 'Shanghai'],
            ['上海市', 'Shanghai'],
            ['广州', 'Guangzhou'],
            ['广州市', 'Guangzhou'],
            ['深圳', 'Shenzhen'],
            ['深圳市', 'Shenzhen'],
            ['杭州', 'Hangzhou'],
            ['杭州市', 'Hangzhou'],
            ['南京', 'Nanjing'],
            ['南京市', 'Nanjing'],
            ['苏州', 'Suzhou'],
            ['苏州市', 'Suzhou'],
            ['成都', 'Chengdu'],
            ['成都市', 'Chengdu'],
            ['重庆', 'Chongqing'],
            ['重庆市', 'Chongqing'],
            ['武汉', 'Wuhan'],
            ['武汉市', 'Wuhan'],
            ['西安', 'Xi\'an'],
            ['西安市', 'Xi\'an'],
            ['天津', 'Tianjin'],
            ['天津市', 'Tianjin'],
            ['厦门', 'Xiamen'],
            ['厦门市', 'Xiamen'],
            ['青岛', 'Qingdao'],
            ['青岛市', 'Qingdao'],
            ['大连', 'Dalian'],
            ['大连市', 'Dalian'],
            ['宁波', 'Ningbo'],
            ['宁波市', 'Ningbo'],
            ['无锡', 'Wuxi'],
            ['无锡市', 'Wuxi'],
            ['长沙', 'Changsha'],
            ['长沙市', 'Changsha'],
            ['郑州', 'Zhengzhou'],
            ['郑州市', 'Zhengzhou'],
            ['济南', 'Jinan'],
            ['济南市', 'Jinan'],
            ['合肥', 'Hefei'],
            ['合肥市', 'Hefei'],
            ['昆明', 'Kunming'],
            ['昆明市', 'Kunming'],
            ['哈尔滨', 'Harbin'],
            ['哈尔滨市', 'Harbin'],
            ['长春', 'Changchun'],
            ['长春市', 'Changchun'],
            ['沈阳', 'Shenyang'],
            ['沈阳市', 'Shenyang'],
            ['香港', 'Hong Kong'],
            ['香港特别行政区', 'Hong Kong'],
            ['澳门', 'Macau'],
            ['澳门特别行政区', 'Macau'],
            ['台北', 'Taipei'],
            ['台北市', 'Taipei'],
            ['东京', 'Tokyo'],
            ['东京都', 'Tokyo'],
            ['大阪', 'Osaka'],
            ['大阪市', 'Osaka'],
            ['京都', 'Kyoto'],
            ['京都市', 'Kyoto'],
            ['横滨', 'Yokohama'],
            ['名古屋', 'Nagoya'],
            ['福冈', 'Fukuoka'],
            ['札幌', 'Sapporo'],
            ['首尔', 'Seoul'],
            ['釜山', 'Busan'],
            ['济州', 'Jeju'],
            ['济州岛', 'Jeju'],
            ['曼谷', 'Bangkok'],
            ['清迈', 'Chiang Mai'],
            ['普吉', 'Phuket'],
            ['普吉岛', 'Phuket'],
            ['吉隆坡', 'Kuala Lumpur'],
            ['槟城', 'Penang'],
            ['雅加达', 'Jakarta'],
            ['巴厘岛', 'Bali'],
            ['马尼拉', 'Manila'],
            ['河内', 'Hanoi'],
            ['胡志明市', 'Ho Chi Minh City'],
            ['伦敦', 'London'],
            ['巴黎', 'Paris'],
            ['罗马', 'Rome'],
            ['米兰', 'Milan'],
            ['威尼斯', 'Venice'],
            ['佛罗伦萨', 'Florence'],
            ['柏林', 'Berlin'],
            ['慕尼黑', 'Munich'],
            ['马德里', 'Madrid'],
            ['巴塞罗那', 'Barcelona'],
            ['阿姆斯特丹', 'Amsterdam'],
            ['布鲁塞尔', 'Brussels'],
            ['维也纳', 'Vienna'],
            ['苏黎世', 'Zurich'],
            ['日内瓦', 'Geneva'],
            ['哥本哈根', 'Copenhagen'],
            ['斯德哥尔摩', 'Stockholm'],
            ['奥斯陆', 'Oslo'],
            ['赫尔辛基', 'Helsinki'],
            ['雷克雅未克', 'Reykjavik'],
            ['都柏林', 'Dublin'],
            ['爱丁堡', 'Edinburgh'],
            ['里斯本', 'Lisbon'],
            ['雅典', 'Athens'],
            ['伊斯坦布尔', 'Istanbul'],
            ['纽约', 'New York'],
            ['洛杉矶', 'Los Angeles'],
            ['旧金山', 'San Francisco'],
            ['三藩市', 'San Francisco'],
            ['芝加哥', 'Chicago'],
            ['波士顿', 'Boston'],
            ['华盛顿', 'Washington'],
            ['华盛顿特区', 'Washington DC'],
            ['西雅图', 'Seattle'],
            ['拉斯维加斯', 'Las Vegas'],
            ['迈阿密', 'Miami'],
            ['多伦多', 'Toronto'],
            ['温哥华', 'Vancouver'],
            ['蒙特利尔', 'Montreal'],
            ['悉尼', 'Sydney'],
            ['墨尔本', 'Melbourne'],
            ['布里斯班', 'Brisbane'],
            ['珀斯', 'Perth'],
            ['奥克兰', 'Auckland'],
            ['惠灵顿', 'Wellington'],
            ['基督城', 'Christchurch'],
        ]);
        this.geocodeCache = new Map();
        this.GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000;
        this.logger.log('🚀 MCP Tool Dispatcher Service 初始化');
        this.logger.log(`服务注入状态: Airbnb=${!!airbnbService}, Weather=${!!weatherDirectService}, Exa=${!!exaService}, GoogleCalendar=${!!googleCalendarService}, GoogleMaps=${!!googleMapsDirectService}, Hotel=${!!hotelDirectService}, AdvancedGeocoding=${!!advancedGeocodingService}`);
        if (!airbnbService) {
            this.logger.warn('⚠️ AirbnbService 未注入！');
        }
        if (!weatherDirectService) {
            this.logger.warn('⚠️ WeatherDirectService 未注入！');
        }
        if (!exaService) {
            this.logger.warn('⚠️ ExaService 未注入！');
        }
        if (!googleCalendarService) {
            this.logger.warn('⚠️ GoogleCalendarService 未注入！');
        }
        if (!googleMapsDirectService) {
            this.logger.warn('⚠️ GoogleMapsDirectService 未注入！');
        }
        if (!hotelDirectService) {
            this.logger.warn('⚠️ HotelDirectService 未注入！');
        }
        if (!advancedGeocodingService) {
            this.logger.warn('⚠️ AdvancedGeocodingService 未注入！');
        }
    }
    onModuleInit() {
        setInterval(() => {
            this.cleanExpiredGeocodeCache();
        }, 60 * 60 * 1000);
        this.logger.debug('地理编码缓存清理定时器已启动（每小时清理一次）');
    }
    async executeTool(serviceName, toolName, params, retries = 1) {
        let actualToolName = toolName;
        if (toolName.startsWith(`${serviceName}.`)) {
            actualToolName = toolName.substring(serviceName.length + 1);
        }
        this.logger.debug(`执行工具调用: ${serviceName}.${actualToolName} (原始: ${toolName}), params=${JSON.stringify(params)}`);
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                switch (serviceName) {
                    case 'airbnb':
                        return await this.executeAirbnbTool(actualToolName.startsWith('airbnb.') ? actualToolName : `airbnb.${actualToolName}`, params);
                    case 'weather':
                        return await this.executeWeatherTool(actualToolName.startsWith('weather.') ? actualToolName : `weather.${actualToolName}`, params);
                    case 'exa':
                        return await this.executeExaTool(actualToolName.startsWith('exa.') ? actualToolName : `exa.${actualToolName}`, params);
                    case 'google-calendar':
                        return await this.executeGoogleCalendarTool(actualToolName.startsWith('google-calendar.') ? actualToolName : `google-calendar.${actualToolName}`, params);
                    case 'hotel':
                        return await this.executeHotelTool(actualToolName.startsWith('hotel.') ? actualToolName : `hotel.${actualToolName}`, params);
                    default:
                        throw new Error(`未知的服务: ${serviceName}`);
                }
            }
            catch (error) {
                lastError = error;
                if (attempt === retries || !this.isRetryableError(error)) {
                    this.logger.error(`工具调用失败: ${serviceName}.${toolName}, error=${error.message}`, error.stack);
                    throw error;
                }
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                this.logger.warn(`工具调用失败，${delay}ms 后重试 (${attempt + 1}/${retries}): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    }
    isRetryableError(error) {
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            return true;
        }
        if (error.response && error.response.status >= 500 && error.response.status < 600) {
            return true;
        }
        if (error.response && error.response.status === 429) {
            return true;
        }
        return false;
    }
    async executeAirbnbTool(toolName, params) {
        if (!this.airbnbService) {
            throw new Error('AirbnbService 不可用');
        }
        switch (toolName) {
            case 'airbnb.search':
                return await this.airbnbService.searchListings({
                    location: params.location,
                    adults: params.adults || 1,
                    checkin: params.checkin,
                    checkout: params.checkout,
                });
            case 'airbnb.listingDetails':
                return await this.airbnbService.getListingDetails({
                    listingId: params.listingId,
                    checkin: params.checkin,
                    checkout: params.checkout,
                });
            default:
                throw new Error(`未知的 Airbnb 工具: ${toolName}`);
        }
    }
    async executeWeatherTool(toolName, params) {
        if (!this.weatherDirectService) {
            throw new Error('WeatherDirectService 不可用');
        }
        switch (toolName) {
            case 'weather.getCurrentWeather':
                const city = params.location || params.destination;
                const normalizedCity = await this.normalizeLocationName(city, {
                    selectedDestination: params.destination,
                    language: params.language,
                });
                return await this.weatherDirectService.getCurrentWeather(normalizedCity);
            case 'weather.getWeatherByDatetimeRange':
                const location = params.location || params.destination;
                const normalizedLocation = await this.normalizeLocationName(location, {
                    selectedDestination: params.destination,
                    language: params.language,
                });
                const startDate = params.startDate || this.getDefaultStartDate();
                const endDate = params.endDate || this.getDefaultEndDate(startDate);
                return await this.weatherDirectService.getWeatherByDatetimeRange(normalizedLocation, startDate, endDate);
            default:
                throw new Error(`未知的 Weather 工具: ${toolName}`);
        }
    }
    async executeHotelTool(toolName, params) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        switch (toolName) {
            case 'hotel.search':
                let location;
                if (params.location) {
                    if (typeof params.location === 'string') {
                        const normalizedLocation = await this.normalizeLocationName(params.location, {
                            selectedDestination: params.destination,
                            language: params.language,
                        });
                        if (this.advancedGeocodingService) {
                            const geocodeResult = await this.advancedGeocodingService.geocode(normalizedLocation, {
                                selectedDestination: params.destination,
                                language: params.language,
                            });
                            if (geocodeResult.coordinates) {
                                location = geocodeResult.coordinates;
                            }
                        }
                        else if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                address: normalizedLocation,
                                language: params.language || 'en',
                            });
                            if (geocodeResult.success && ((_b = (_a = geocodeResult.data) === null || _a === void 0 ? void 0 : _a.results) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                                const result = geocodeResult.data.results[0];
                                const coords = (_c = result.geometry) === null || _c === void 0 ? void 0 : _c.location;
                                if (coords) {
                                    location = { lat: coords.lat, lng: coords.lng };
                                }
                            }
                        }
                        if (!location) {
                            throw new Error(`无法解析位置: ${params.location}`);
                        }
                    }
                    else if (params.location.lat && params.location.lng) {
                        location = params.location;
                    }
                }
                if (!location && params.countryCode) {
                    this.logger.debug(`使用 countryCode 进行地理编码: ${params.countryCode}`);
                    const countryName = this.getCountryNameFromCode(params.countryCode);
                    if (this.advancedGeocodingService) {
                        try {
                            const geocodeResult = await this.advancedGeocodingService.geocode(countryName, {
                                selectedDestination: params.destination,
                                language: params.language,
                            });
                            if (geocodeResult.coordinates) {
                                location = geocodeResult.coordinates;
                                this.logger.debug(`通过 countryCode (高级地理编码) 获取坐标成功: ${countryName} -> (${location.lat}, ${location.lng})`);
                            }
                        }
                        catch (error) {
                            this.logger.warn(`高级地理编码失败: ${error.message}，尝试 Google Maps 或预定义坐标`);
                        }
                    }
                    if (!location && this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
                        try {
                            const geocodeResult = await this.googleMapsDirectService.geocode({
                                address: countryName,
                                language: params.language || 'en',
                            });
                            if (geocodeResult.success && ((_e = (_d = geocodeResult.data) === null || _d === void 0 ? void 0 : _d.results) === null || _e === void 0 ? void 0 : _e.length) > 0) {
                                const result = geocodeResult.data.results[0];
                                const coords = (_f = result.geometry) === null || _f === void 0 ? void 0 : _f.location;
                                if (coords) {
                                    location = { lat: coords.lat, lng: coords.lng };
                                    this.logger.debug(`通过 countryCode (Google Maps) 获取坐标成功: ${countryName} -> (${location.lat}, ${location.lng})`);
                                }
                            }
                        }
                        catch (error) {
                            this.logger.warn(`Google Maps 地理编码失败: ${error.message}，使用预定义坐标作为降级方案`);
                        }
                    }
                    if (!location) {
                        const predefinedCoords = this.getCountryCenterCoordinates(params.countryCode);
                        if (predefinedCoords) {
                            location = predefinedCoords;
                            this.logger.debug(`使用预定义国家中心坐标作为降级方案: ${params.countryCode} -> (${location.lat}, ${location.lng})`);
                        }
                        else {
                            this.logger.warn(`无法获取 ${params.countryCode} 的坐标（地理编码失败且无预定义坐标）`);
                        }
                    }
                }
                if (!location && params.destination) {
                    this.logger.debug(`使用 destination 进行地理编码: ${params.destination}`);
                    if (this.advancedGeocodingService) {
                        const geocodeResult = await this.advancedGeocodingService.geocode(params.destination, {
                            selectedDestination: params.destination,
                            language: params.language,
                        });
                        if (geocodeResult.coordinates) {
                            location = geocodeResult.coordinates;
                            this.logger.debug(`通过 destination 获取坐标成功: ${params.destination} -> (${location.lat}, ${location.lng})`);
                        }
                    }
                    else if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
                        const geocodeResult = await this.googleMapsDirectService.geocode({
                            address: params.destination,
                            language: params.language || 'en',
                        });
                        if (geocodeResult.success && ((_h = (_g = geocodeResult.data) === null || _g === void 0 ? void 0 : _g.results) === null || _h === void 0 ? void 0 : _h.length) > 0) {
                            const result = geocodeResult.data.results[0];
                            const coords = (_j = result.geometry) === null || _j === void 0 ? void 0 : _j.location;
                            if (coords) {
                                location = { lat: coords.lat, lng: coords.lng };
                                this.logger.debug(`通过 destination 获取坐标成功: ${params.destination} -> (${location.lat}, ${location.lng})`);
                            }
                        }
                    }
                }
                if (!location && params.naturalLanguage) {
                    this.logger.debug(`尝试从 naturalLanguage 提取位置: ${params.naturalLanguage}`);
                    const cleanedText = params.naturalLanguage.replace(/推荐|酒店|hotel|找|搜索/gi, '').trim();
                    if (cleanedText && cleanedText.length > 0) {
                        if (this.advancedGeocodingService) {
                            const geocodeResult = await this.advancedGeocodingService.geocode(cleanedText, {
                                selectedDestination: params.destination,
                                language: params.language,
                            });
                            if (geocodeResult.coordinates) {
                                location = geocodeResult.coordinates;
                                this.logger.debug(`通过 naturalLanguage 获取坐标成功: ${cleanedText} -> (${location.lat}, ${location.lng})`);
                            }
                        }
                    }
                }
                if (!location) {
                    throw new Error('缺少必需参数: location。请提供位置信息（location、countryCode、destination 或 naturalLanguage）');
                }
                if (this.airbnbService) {
                    try {
                        this.logger.debug('酒店搜索：优先尝试 Airbnb...');
                        const airbnbParams = {
                            location: `${location.lat},${location.lng}`,
                            adults: params.guests || params.adults || 1,
                            checkin: params.checkIn,
                            checkout: params.checkOut,
                        };
                        if (params.tripId) {
                            this.logger.debug(`Airbnb 搜索使用 tripId: ${params.tripId}`);
                        }
                        if (params.countryCode) {
                            this.logger.debug(`Airbnb 搜索使用 countryCode: ${params.countryCode}`);
                        }
                        const airbnbResult = await this.airbnbService.searchListings(airbnbParams);
                        if (airbnbResult && airbnbResult.results && airbnbResult.results.length > 0) {
                            this.logger.debug(`Airbnb 搜索成功，找到 ${airbnbResult.results.length} 个房源`);
                            return {
                                success: true,
                                results: airbnbResult.results,
                                totalResults: airbnbResult.results.length,
                                source: 'airbnb',
                            };
                        }
                        else {
                            this.logger.debug('Airbnb 搜索无结果，降级到 HotelDirectService');
                        }
                    }
                    catch (airbnbError) {
                        this.logger.warn(`Airbnb 搜索失败，降级到 HotelDirectService: ${airbnbError.message}`);
                    }
                }
                else {
                    this.logger.debug('AirbnbService 不可用，降级到 HotelDirectService');
                }
                if (!this.hotelDirectService) {
                    throw new Error('HotelDirectService 不可用: 服务未注入，请检查 HotelDirectModule 是否正确导入到 PlanningAssistantModule');
                }
                if (!this.hotelDirectService.isServiceAvailable()) {
                    throw new Error('HotelDirectService 不可用: Google Places API Key 未配置。请设置环境变量 GOOGLE_PLACES_API_KEY');
                }
                this.logger.debug('使用 HotelDirectService 搜索酒店...');
                const hotelSearchParams = {
                    query: params.query,
                    location: location,
                    radius: params.radius || 10000,
                    type: params.type || 'lodging',
                    priceLevel: params.priceLevel,
                    minRating: params.minRating,
                    checkIn: params.checkIn,
                    checkOut: params.checkOut,
                    guests: params.guests,
                    language: params.language || 'en',
                };
                if (params.tripId) {
                    this.logger.debug(`HotelDirectService 搜索使用 tripId: ${params.tripId}`);
                }
                if (params.countryCode) {
                    this.logger.debug(`HotelDirectService 搜索使用 countryCode: ${params.countryCode}`);
                }
                const hotelResult = await this.hotelDirectService.searchHotels(hotelSearchParams);
                return {
                    ...hotelResult,
                    source: 'hotel',
                };
            case 'hotel.getDetails':
                if (!params.placeId) {
                    throw new Error('缺少必需参数: placeId');
                }
                return await this.hotelDirectService.getHotelDetails(params.placeId, params.language || 'en');
            default:
                throw new Error(`未知的 Hotel 工具: ${toolName}`);
        }
    }
    async executeExaTool(toolName, params) {
        if (!this.exaService) {
            throw new Error('ExaService 不可用');
        }
        switch (toolName) {
            case 'exa.webSearch':
                return await this.exaService.webSearch(params.query, {
                    numResults: params.numResults || 5,
                });
            case 'exa.webSearchAdvanced':
                return await this.exaService.webSearchAdvanced(params.query, {
                    numResults: params.numResults || 5,
                    category: params.category,
                });
            case 'exa.deepSearch':
                return await this.exaService.deepSearch(params.query, {
                    numResults: params.numResults || 5,
                });
            case 'exa.crawlUrl':
                return await this.exaService.crawlUrl(params.url, {
                    text: params.text !== false,
                    html: params.html === true,
                    markdown: params.markdown === true,
                });
            default:
                throw new Error(`未知的 Exa 工具: ${toolName}`);
        }
    }
    async executeGoogleCalendarTool(toolName, params) {
        if (!this.googleCalendarService) {
            throw new Error('GoogleCalendarService 不可用');
        }
        switch (toolName) {
            case 'google-calendar.createEvent':
                return await this.googleCalendarService.createEvent({
                    summary: params.summary,
                    start: this.parseDateTime(params.start),
                    end: this.parseDateTime(params.end),
                    description: params.description,
                    location: params.location,
                    calendarId: params.calendarId,
                });
            case 'google-calendar.findFreeSlots':
                return await this.googleCalendarService.findFreeSlots({
                    timeMin: params.timeMin,
                    timeMax: params.timeMax,
                    durationMinutes: params.durationMinutes || 60,
                    calendarId: params.calendarId,
                });
            case 'google-calendar.quickAdd':
                return await this.googleCalendarService.quickAdd({
                    text: params.text,
                    calendarId: params.calendarId,
                });
            case 'google-calendar.listEvents':
                return await this.googleCalendarService.listEvents({
                    timeMin: params.timeMin,
                    timeMax: params.timeMax,
                    maxResults: params.maxResults || 10,
                    calendarId: params.calendarId,
                });
            default:
                throw new Error(`未知的 Google Calendar 工具: ${toolName}`);
        }
    }
    parseDateTime(dateTimeStr) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
            return { date: dateTimeStr };
        }
        return { dateTime: dateTimeStr };
    }
    isServiceAvailable(serviceName) {
        switch (serviceName) {
            case 'airbnb':
                return !!this.airbnbService;
            case 'weather':
                return !!this.weatherDirectService;
            case 'exa':
                return !!this.exaService;
            case 'google-calendar':
                return !!this.googleCalendarService;
            default:
                return false;
        }
    }
    getDefaultStartDate() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }
    getDefaultEndDate(startDate) {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return end.toISOString().split('T')[0];
    }
    async normalizeLocationName(location, context) {
        if (!location || typeof location !== 'string') {
            return location;
        }
        if (this.advancedGeocodingService) {
            try {
                const locationContext = {
                    selectedDestination: context === null || context === void 0 ? void 0 : context.selectedDestination,
                    language: (context === null || context === void 0 ? void 0 : context.language) || 'en',
                };
                const geocodeResult = await this.advancedGeocodingService.geocode(location, locationContext);
                if (geocodeResult.confidence >= 0.6) {
                    this.logger.debug(`高级地理编码成功: "${location}" -> "${geocodeResult.normalizedName}" (confidence=${geocodeResult.confidence}, source=${geocodeResult.source})`);
                    if (geocodeResult.coordinates) {
                        return geocodeResult.normalizedName;
                    }
                    return geocodeResult.normalizedName;
                }
                else {
                    this.logger.debug(`高级地理编码置信度较低(${geocodeResult.confidence})，降级到基础策略`);
                }
            }
            catch (error) {
                this.logger.warn(`高级地理编码失败: "${location}", error: ${error.message}，降级到基础策略`);
            }
        }
        return this.normalizeLocationNameBasic(location);
    }
    async normalizeLocationNameBasic(location) {
        var _a, _b, _c, _d, _e, _f;
        const cleanedLocation = location.trim().replace(/[，,。.？?！!]/g, '');
        if (this.locationNameMap.has(cleanedLocation)) {
            const mappedName = this.locationNameMap.get(cleanedLocation);
            this.logger.debug(`位置名称映射: "${cleanedLocation}" -> "${mappedName}"`);
            return mappedName;
        }
        if (/^[\d\s.,-]+$/.test(cleanedLocation) || /^[A-Za-z\s,.-]+$/.test(cleanedLocation)) {
            return cleanedLocation;
        }
        const cachedResult = this.geocodeCache.get(cleanedLocation);
        if (cachedResult && Date.now() - cachedResult.timestamp < this.GEOCODE_CACHE_TTL) {
            this.logger.debug(`使用缓存的地理编码结果: "${cleanedLocation}" -> "${cachedResult.result}"`);
            return cachedResult.result;
        }
        if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
            try {
                this.logger.debug(`尝试使用 Google Maps 地理编码: "${cleanedLocation}"`);
                const geocodeResult = await this.googleMapsDirectService.geocode({
                    address: cleanedLocation,
                    language: 'en',
                });
                if (geocodeResult.success && ((_b = (_a = geocodeResult.data) === null || _a === void 0 ? void 0 : _a.results) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                    const result = geocodeResult.data.results[0];
                    const cityName = (_d = (_c = result.address_components) === null || _c === void 0 ? void 0 : _c.find((comp) => comp.types.includes('locality'))) === null || _d === void 0 ? void 0 : _d.long_name;
                    const countryName = (_f = (_e = result.address_components) === null || _e === void 0 ? void 0 : _e.find((comp) => comp.types.includes('country'))) === null || _f === void 0 ? void 0 : _f.long_name;
                    const normalizedName = cityName || countryName || result.formatted_address || cleanedLocation;
                    this.geocodeCache.set(cleanedLocation, {
                        result: normalizedName,
                        timestamp: Date.now(),
                    });
                    this.logger.debug(`Google Maps 地理编码成功: "${cleanedLocation}" -> "${normalizedName}"`);
                    return normalizedName;
                }
            }
            catch (error) {
                this.logger.warn(`Google Maps 地理编码失败: "${cleanedLocation}", error: ${error.message}`);
            }
        }
        this.logger.debug(`位置名称标准化失败，使用原始名称: "${cleanedLocation}"`);
        return cleanedLocation;
    }
    cleanExpiredGeocodeCache() {
        const now = Date.now();
        for (const [key, value] of this.geocodeCache.entries()) {
            if (now - value.timestamp >= this.GEOCODE_CACHE_TTL) {
                this.geocodeCache.delete(key);
            }
        }
    }
    getCountryNameFromCode(countryCode) {
        const countryCodeMap = {
            'IS': 'Iceland',
            'JP': 'Japan',
            'TH': 'Thailand',
            'IT': 'Italy',
            'NZ': 'New Zealand',
            'ES': 'Spain',
            'CH': 'Switzerland',
            'MV': 'Maldives',
            'CN': 'China',
            'US': 'United States',
            'GB': 'United Kingdom',
            'FR': 'France',
            'DE': 'Germany',
            'AU': 'Australia',
            'CA': 'Canada',
            'KR': 'South Korea',
            'SG': 'Singapore',
            'MY': 'Malaysia',
            'VN': 'Vietnam',
            'GL': 'Greenland',
            'SJ': 'Svalbard',
            'AR': 'Argentina',
            'NO': 'Norway',
            'NP': 'Nepal',
        };
        return countryCodeMap[countryCode.toUpperCase()] || countryCode;
    }
    getCountryCenterCoordinates(countryCode) {
        const countryCenters = {
            'IS': { lat: 64.9631, lng: -19.0208 },
            'JP': { lat: 35.6762, lng: 139.6503 },
            'TH': { lat: 13.7563, lng: 100.5018 },
            'IT': { lat: 41.9028, lng: 12.4964 },
            'NZ': { lat: -36.8485, lng: 174.7633 },
            'ES': { lat: 40.4168, lng: -3.7038 },
            'CH': { lat: 47.3769, lng: 8.5417 },
            'MV': { lat: 4.1755, lng: 73.5093 },
            'CN': { lat: 39.9042, lng: 116.4074 },
            'US': { lat: 40.7128, lng: -74.0060 },
            'GB': { lat: 51.5074, lng: -0.1278 },
            'FR': { lat: 48.8566, lng: 2.3522 },
            'DE': { lat: 52.5200, lng: 13.4050 },
            'AU': { lat: -33.8688, lng: 151.2093 },
            'CA': { lat: 43.6532, lng: -79.3832 },
            'KR': { lat: 37.5665, lng: 126.9780 },
            'SG': { lat: 1.3521, lng: 103.8198 },
            'MY': { lat: 3.1390, lng: 101.6869 },
            'VN': { lat: 21.0285, lng: 105.8542 },
            'GL': { lat: 64.1814, lng: -51.6941 },
            'SJ': { lat: 78.2232, lng: 15.6267 },
            'AR': { lat: -34.6037, lng: -58.3816 },
            'NO': { lat: 59.9139, lng: 10.7522 },
            'NP': { lat: 27.7172, lng: 85.3240 },
        };
        const coords = countryCenters[countryCode.toUpperCase()];
        if (coords) {
            this.logger.debug(`使用预定义国家中心坐标: ${countryCode} -> (${coords.lat}, ${coords.lng})`);
            return coords;
        }
        return null;
    }
};
exports.McpToolDispatcherService = McpToolDispatcherService;
exports.McpToolDispatcherService = McpToolDispatcherService = McpToolDispatcherService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [airbnb_service_1.AirbnbService,
        weather_direct_service_1.WeatherDirectService,
        exa_service_1.ExaService,
        google_calendar_service_1.GoogleCalendarService,
        google_maps_direct_service_1.GoogleMapsDirectService,
        hotel_direct_service_1.HotelDirectService,
        advanced_geocoding_service_1.AdvancedGeocodingService])
], McpToolDispatcherService);
//# sourceMappingURL=mcp-tool-dispatcher.service.js.map