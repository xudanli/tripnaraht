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
var TranslationDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationDirectService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
let TranslationDirectService = TranslationDirectService_1 = class TranslationDirectService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(TranslationDirectService_1.name);
        this.apiKey = null;
        this.isAvailable = false;
        this.baseUrl = 'https://translation.googleapis.com/language/translate/v2';
        this.apiKey =
            this.configService.get('GOOGLE_TRANSLATE_API_KEY') ||
                this.configService.get('GOOGLE_MAPS_API_KEY') ||
                process.env.GOOGLE_TRANSLATE_API_KEY ||
                process.env.GOOGLE_MAPS_API_KEY ||
                null;
    }
    async onModuleInit() {
        if (this.apiKey) {
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
            try {
                const testResponse = await this.axiosInstance.post('', null, {
                    params: {
                        q: 'Hello',
                        target: 'zh',
                        key: this.apiKey,
                    },
                });
                if (testResponse.data && testResponse.data.data) {
                    this.isAvailable = true;
                    this.logger.log('Translation Direct Service initialized');
                }
                else {
                    this.logger.warn('Google Translate API test returned unexpected format');
                    this.isAvailable = false;
                }
            }
            catch (error) {
                this.logger.error('Failed to initialize Translation Direct Service:', error.message);
                this.isAvailable = false;
            }
        }
        else {
            this.logger.warn('Google Translate API Key not found. Service will not be available.');
            this.isAvailable = false;
        }
    }
    async onModuleDestroy() {
        this.logger.log('Translation Direct Service destroyed');
    }
    isServiceAvailable() {
        return this.isAvailable && !!this.apiKey;
    }
    async translate(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Translate API Key not configured');
        }
        try {
            const isArray = Array.isArray(params.text);
            const texts = isArray ? params.text : [params.text];
            const requestParams = {
                q: texts,
                target: params.target,
                key: this.apiKey,
            };
            if (params.source) {
                requestParams.source = params.source;
            }
            if (params.format) {
                requestParams.format = params.format;
            }
            const response = await this.axiosInstance.post('', null, {
                params: requestParams,
            });
            if (!response.data || !response.data.data || !response.data.data.translations) {
                throw new Error('Invalid response from Google Translate API');
            }
            const translations = response.data.data.translations;
            const results = translations.map((translation, index) => ({
                translatedText: translation.translatedText,
                detectedSourceLanguage: translation.detectedSourceLanguage,
                originalText: texts[index],
            }));
            return isArray ? results : results[0];
        }
        catch (error) {
            this.logger.error('Failed to translate text:', error.message);
            throw error;
        }
    }
    async detectLanguage(text) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Translate API Key not configured');
        }
        try {
            const response = await this.axiosInstance.post('/detect', null, {
                params: {
                    q: text,
                    key: this.apiKey,
                },
            });
            if (!response.data || !response.data.data || !response.data.data.detections) {
                throw new Error('Invalid response from Google Translate API');
            }
            const detections = response.data.data.detections[0];
            if (!detections || detections.length === 0) {
                throw new Error('Language detection failed');
            }
            const detection = detections[0];
            return {
                language: detection.language,
                confidence: detection.confidence || 1.0,
            };
        }
        catch (error) {
            this.logger.error('Failed to detect language:', error.message);
            throw error;
        }
    }
    async getSupportedLanguages(targetLanguage) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Translate API Key not configured');
        }
        try {
            const params = {
                key: this.apiKey,
            };
            if (targetLanguage) {
                params.target = targetLanguage;
            }
            const response = await this.axiosInstance.get('/languages', {
                params,
            });
            if (!response.data || !response.data.data || !response.data.data.languages) {
                throw new Error('Invalid response from Google Translate API');
            }
            return response.data.data.languages;
        }
        catch (error) {
            this.logger.error('Failed to get supported languages:', error.message);
            throw error;
        }
    }
    async getUserTranslationSettings(userId) {
        var _a;
        try {
            const settings = await this.prisma.translationSettings.findUnique({
                where: { userId },
            });
            if (!settings) {
                return null;
            }
            return {
                defaultTargetLanguage: settings.defaultTargetLanguage || 'en',
                preferredLanguages: settings.preferredLanguages || [],
                autoDetect: (_a = settings.autoDetect) !== null && _a !== void 0 ? _a : true,
            };
        }
        catch (error) {
            this.logger.error('Failed to get user translation settings:', error.message);
            throw error;
        }
    }
    async saveUserTranslationSettings(userId, settings) {
        var _a;
        try {
            await this.prisma.translationSettings.upsert({
                where: { userId },
                create: {
                    userId,
                    defaultTargetLanguage: settings.defaultTargetLanguage || 'en',
                    preferredLanguages: settings.preferredLanguages || [],
                    autoDetect: (_a = settings.autoDetect) !== null && _a !== void 0 ? _a : true,
                },
                update: {
                    defaultTargetLanguage: settings.defaultTargetLanguage,
                    preferredLanguages: settings.preferredLanguages,
                    autoDetect: settings.autoDetect,
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error('Failed to save user translation settings:', error.message);
            throw error;
        }
    }
    async smartTranslate(userId, text, targetLanguage) {
        if (!this.isServiceAvailable()) {
            throw new Error('Google Translate API Key not configured');
        }
        try {
            const settings = await this.getUserTranslationSettings(userId);
            const target = targetLanguage || (settings === null || settings === void 0 ? void 0 : settings.defaultTargetLanguage) || 'en';
            let sourceLanguage;
            if ((settings === null || settings === void 0 ? void 0 : settings.autoDetect) !== false) {
                try {
                    const detection = await this.detectLanguage(text);
                    sourceLanguage = detection.language;
                }
                catch (error) {
                    this.logger.warn('Failed to detect language, proceeding without source:', error.message);
                }
            }
            const result = await this.translate({
                text,
                target,
                source: sourceLanguage,
            });
            return Array.isArray(result) ? result[0] : result;
        }
        catch (error) {
            this.logger.error('Failed to smart translate:', error.message);
            throw error;
        }
    }
};
exports.TranslationDirectService = TranslationDirectService;
exports.TranslationDirectService = TranslationDirectService = TranslationDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], TranslationDirectService);
//# sourceMappingURL=translation-direct.service.js.map