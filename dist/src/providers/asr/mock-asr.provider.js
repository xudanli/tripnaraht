"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAsrProvider = void 0;
const common_1 = require("@nestjs/common");
let MockAsrProvider = class MockAsrProvider {
    async transcribe(audioBuffer, options) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
            transcript: '下一站是哪里？',
            words: [
                { word: '下一站', start: 0.0, end: 0.5 },
                { word: '是', start: 0.5, end: 0.7 },
                { word: '哪里', start: 0.7, end: 1.2 },
            ],
            language: (options === null || options === void 0 ? void 0 : options.language) || 'zh-CN',
            confidence: 0.95,
        };
    }
};
exports.MockAsrProvider = MockAsrProvider;
exports.MockAsrProvider = MockAsrProvider = __decorate([
    (0, common_1.Injectable)()
], MockAsrProvider);
//# sourceMappingURL=mock-asr.provider.js.map