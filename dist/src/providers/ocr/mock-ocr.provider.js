"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockOcrProvider = void 0;
const common_1 = require("@nestjs/common");
let MockOcrProvider = class MockOcrProvider {
    async extractText(image, opts) {
        const locale = (opts === null || opts === void 0 ? void 0 : opts.locale) || 'zh-CN';
        const mockTexts = {
            'zh-CN': {
                fullText: '东京塔\n营业时间：9:00-22:00\n地址：港区芝公园4-2-8',
                lines: ['东京塔', '营业时间：9:00-22:00', '地址：港区芝公园4-2-8'],
            },
            'ja-JP': {
                fullText: '東京タワー\n営業時間：9:00-22:00\n住所：港区芝公園4-2-8',
                lines: ['東京タワー', '営業時間：9:00-22:00', '住所：港区芝公園4-2-8'],
            },
            'en-US': {
                fullText: 'Tokyo Tower\nHours: 9:00 AM - 10:00 PM\nAddress: 4-2-8 Shibakoen, Minato City',
                lines: ['Tokyo Tower', 'Hours: 9:00 AM - 10:00 PM', 'Address: 4-2-8 Shibakoen, Minato City'],
            },
        };
        const mock = mockTexts[locale] || mockTexts['en-US'];
        return {
            fullText: mock.fullText,
            lines: mock.lines,
            blocks: mock.lines.map((text, i) => ({
                text,
                confidence: 0.9 - i * 0.05,
            })),
        };
    }
};
exports.MockOcrProvider = MockOcrProvider;
exports.MockOcrProvider = MockOcrProvider = __decorate([
    (0, common_1.Injectable)()
], MockOcrProvider);
//# sourceMappingURL=mock-ocr.provider.js.map