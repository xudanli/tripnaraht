"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WeatherDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherDirectService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
let WeatherDirectService = WeatherDirectService_1 = class WeatherDirectService {
    constructor() {
        this.logger = new common_1.Logger(WeatherDirectService_1.name);
        this.baseUrl = 'https://api.open-meteo.com/v1';
        this.isAvailable = true;
        this.axiosInstance = null;
    }
    async onModuleInit() {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.ALL_PROXY ||
            process.env.all_proxy;
        const httpsAgent = proxyUrl
            ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
            : new https.Agent({
                keepAlive: true,
                family: 4,
                rejectUnauthorized: true,
            });
        this.axiosInstance = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            httpsAgent,
            proxy: false,
            headers: {
                'User-Agent': 'TripNARA/1.0',
            },
        });
        this.isAvailable = true;
        this.logger.log('Weather Direct Service initialized (Open-Meteo API)');
    }
    async onModuleDestroy() {
        this.logger.log('Weather Direct Service destroyed');
    }
    isServiceAvailable() {
        return this.isAvailable;
    }
    async geocode(city) {
        try {
            const response = await this.axiosInstance.get('https://geocoding-api.open-meteo.com/v1/search', {
                params: {
                    name: city,
                    count: 1,
                    language: 'en',
                    format: 'json',
                },
            });
            const results = response.data.results;
            if (!results || results.length === 0) {
                throw new Error(`City "${city}" not found`);
            }
            return results[0];
        }
        catch (error) {
            this.logger.error(`Geocoding failed for "${city}": ${error.message}`);
            throw new Error(`Failed to geocode city "${city}": ${error.message}`);
        }
    }
    async getCurrentWeather(city) {
        try {
            const location = await this.geocode(city);
            const response = await this.axiosInstance.get('/forecast', {
                params: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    current: [
                        'temperature_2m',
                        'relative_humidity_2m',
                        'apparent_temperature',
                        'weather_code',
                        'wind_speed_10m',
                        'wind_direction_10m',
                    ].join(','),
                    timezone: 'auto',
                },
            });
            const data = response.data;
            const weatherCode = this.mapWeatherCode(data.current.weather_code);
            return {
                city: location.name,
                country: location.country,
                latitude: location.latitude,
                longitude: location.longitude,
                timezone: data.timezone,
                current: {
                    time: data.current.time,
                    temperature: data.current.temperature_2m,
                    apparent_temperature: data.current.apparent_temperature,
                    humidity: data.current.relative_humidity_2m,
                    weather_code: data.current.weather_code,
                    weather_description: weatherCode.description,
                    wind_speed: data.current.wind_speed_10m,
                    wind_direction: data.current.wind_direction_10m,
                },
                units: {
                    temperature: data.current_units.temperature_2m,
                    wind_speed: data.current_units.wind_speed_10m,
                },
            };
        }
        catch (error) {
            this.logger.error(`Failed to get current weather for "${city}": ${error.message}`);
            throw error;
        }
    }
    async getWeatherByDatetimeRange(city, startDate, endDate) {
        try {
            const location = await this.geocode(city);
            const response = await this.axiosInstance.get('/forecast', {
                params: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    hourly: [
                        'temperature_2m',
                        'weather_code',
                        'precipitation',
                        'wind_speed_10m',
                    ].join(','),
                    start_date: startDate,
                    end_date: endDate,
                    timezone: 'auto',
                },
            });
            const data = response.data;
            const hourlyData = data.hourly.time.map((time, index) => ({
                time,
                temperature: data.hourly.temperature_2m[index],
                weather_code: data.hourly.weather_code[index],
                weather_description: this.mapWeatherCode(data.hourly.weather_code[index]).description,
                precipitation: data.hourly.precipitation[index],
                wind_speed: data.hourly.wind_speed_10m[index],
            }));
            return {
                city: location.name,
                country: location.country,
                latitude: location.latitude,
                longitude: location.longitude,
                timezone: data.timezone,
                start_date: startDate,
                end_date: endDate,
                hourly: hourlyData,
                summary: {
                    min_temperature: Math.min(...data.hourly.temperature_2m),
                    max_temperature: Math.max(...data.hourly.temperature_2m),
                    avg_temperature: data.hourly.temperature_2m.reduce((a, b) => a + b, 0) /
                        data.hourly.temperature_2m.length,
                    total_precipitation: data.hourly.precipitation.reduce((a, b) => a + b, 0),
                },
            };
        }
        catch (error) {
            this.logger.error(`Failed to get weather forecast for "${city}" (${startDate} to ${endDate}): ${error.message}`);
            throw error;
        }
    }
    async getCurrentDateTime(timezone) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const tz = timezone || 'UTC';
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            const parts = formatter.formatToParts(now);
            const dateTimeStr = `${(_a = parts.find((p) => p.type === 'year')) === null || _a === void 0 ? void 0 : _a.value}-${(_b = parts.find((p) => p.type === 'month')) === null || _b === void 0 ? void 0 : _b.value}-${(_c = parts.find((p) => p.type === 'day')) === null || _c === void 0 ? void 0 : _c.value}T${(_d = parts.find((p) => p.type === 'hour')) === null || _d === void 0 ? void 0 : _d.value}:${(_e = parts.find((p) => p.type === 'minute')) === null || _e === void 0 ? void 0 : _e.value}:${(_f = parts.find((p) => p.type === 'second')) === null || _f === void 0 ? void 0 : _f.value}`;
            return {
                timezone: tz,
                current_time: dateTimeStr,
                utc_time: now.toISOString(),
                timestamp: now.getTime(),
            };
        }
        catch (error) {
            this.logger.error(`Failed to get current datetime for timezone "${timezone}": ${error.message}`);
            throw error;
        }
    }
    mapWeatherCode(code) {
        const weatherCodes = {
            0: { description: 'Clear sky', icon: '☀️' },
            1: { description: 'Mainly clear', icon: '🌤️' },
            2: { description: 'Partly cloudy', icon: '⛅' },
            3: { description: 'Overcast', icon: '☁️' },
            45: { description: 'Foggy', icon: '🌫️' },
            48: { description: 'Depositing rime fog', icon: '🌫️' },
            51: { description: 'Light drizzle', icon: '🌦️' },
            53: { description: 'Moderate drizzle', icon: '🌦️' },
            55: { description: 'Dense drizzle', icon: '🌦️' },
            56: { description: 'Light freezing drizzle', icon: '🌨️' },
            57: { description: 'Dense freezing drizzle', icon: '🌨️' },
            61: { description: 'Slight rain', icon: '🌧️' },
            63: { description: 'Moderate rain', icon: '🌧️' },
            65: { description: 'Heavy rain', icon: '🌧️' },
            66: { description: 'Light freezing rain', icon: '🌨️' },
            67: { description: 'Heavy freezing rain', icon: '🌨️' },
            71: { description: 'Slight snow fall', icon: '❄️' },
            73: { description: 'Moderate snow fall', icon: '❄️' },
            75: { description: 'Heavy snow fall', icon: '❄️' },
            77: { description: 'Snow grains', icon: '❄️' },
            80: { description: 'Slight rain showers', icon: '🌦️' },
            81: { description: 'Moderate rain showers', icon: '🌦️' },
            82: { description: 'Violent rain showers', icon: '🌦️' },
            85: { description: 'Slight snow showers', icon: '🌨️' },
            86: { description: 'Heavy snow showers', icon: '🌨️' },
            95: { description: 'Thunderstorm', icon: '⛈️' },
            96: { description: 'Thunderstorm with slight hail', icon: '⛈️' },
            99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
        };
        return (weatherCodes[code] || {
            description: `Unknown weather code: ${code}`,
            icon: '❓',
        });
    }
};
exports.WeatherDirectService = WeatherDirectService;
exports.WeatherDirectService = WeatherDirectService = WeatherDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], WeatherDirectService);
//# sourceMappingURL=weather-direct.service.js.map