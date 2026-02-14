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
var GoogleOcrProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleOcrProvider = void 0;
const common_1 = require("@nestjs/common");
let GoogleOcrProvider = GoogleOcrProvider_1 = class GoogleOcrProvider {
    constructor() {
        this.logger = new common_1.Logger(GoogleOcrProvider_1.name);
        this.apiKey = process.env.GOOGLE_VISION_API_KEY;
        this.enabled = !!this.apiKey;
        if (!this.enabled) {
            this.logger.warn('GoogleOcrProvider: GOOGLE_VISION_API_KEY not set, provider disabled');
        }
    }
    async extractText(image, opts) {
        var _a;
        if (!this.enabled) {
            throw new Error('GoogleOcrProvider is not enabled (missing API key)');
        }
        try {
            const base64Image = image.toString('base64');
            const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [
                        {
                            image: {
                                content: base64Image,
                            },
                            features: [
                                {
                                    type: 'TEXT_DETECTION',
                                    maxResults: 1,
                                },
                            ],
                            imageContext: {
                                languageHints: (opts === null || opts === void 0 ? void 0 : opts.locale) ? [this.mapLocaleToLanguageCode(opts.locale)] : undefined,
                            },
                        },
                    ],
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Google Vision API error: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            const responseData = data;
            if (responseData.responses && responseData.responses[0] && responseData.responses[0].textAnnotations) {
                const annotations = responseData.responses[0].textAnnotations;
                const fullText = ((_a = annotations[0]) === null || _a === void 0 ? void 0 : _a.description) || '';
                const blocks = annotations.slice(1).map((ann) => ({
                    text: ann.description || '',
                    confidence: ann.confidence,
                }));
                const lines = fullText.split('\n').filter((line) => line.trim().length > 0);
                return {
                    fullText,
                    lines,
                    blocks,
                };
            }
            return {
                fullText: '',
                lines: [],
                blocks: [],
            };
        }
        catch (error) {
            this.logger.error(`Google OCR error: ${error.message}`, error.stack);
            throw error;
        }
    }
    mapLocaleToLanguageCode(locale) {
        const mapping = {
            'zh-CN': 'zh',
            'zh-TW': 'zh-TW',
            'ja-JP': 'ja',
            'ko-KR': 'ko',
            'en-US': 'en',
            'en-GB': 'en',
        };
        return mapping[locale] || locale.split('-')[0] || 'en';
    }
};
exports.GoogleOcrProvider = GoogleOcrProvider;
exports.GoogleOcrProvider = GoogleOcrProvider = GoogleOcrProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], GoogleOcrProvider);
//# sourceMappingURL=google-ocr.provider.js.map