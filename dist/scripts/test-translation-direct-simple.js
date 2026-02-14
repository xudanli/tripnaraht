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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
async function testTranslation() {
    var _a;
    if (!GOOGLE_TRANSLATE_API_KEY) {
        console.error('❌ GOOGLE_TRANSLATE_API_KEY 或 GOOGLE_MAPS_API_KEY 未设置');
        process.exit(1);
    }
    console.log('🔍 测试 Translation Direct API...');
    console.log(`📝 API Key: ${GOOGLE_TRANSLATE_API_KEY.substring(0, 20)}...\n`);
    try {
        console.log('1️⃣  测试翻译单个文本（GET 请求）...');
        const translateResponse = await axios_1.default.get('https://translation.googleapis.com/language/translate/v2', {
            params: {
                q: 'Hello, world!',
                target: 'zh',
                key: GOOGLE_TRANSLATE_API_KEY,
            },
            timeout: 10000,
        });
        if (translateResponse.data && translateResponse.data.data && translateResponse.data.data.translations) {
            const translation = translateResponse.data.data.translations[0];
            console.log(`✅ 翻译成功`);
            console.log(`   原文: Hello, world!`);
            console.log(`   译文: ${translation.translatedText}`);
            if (translation.detectedSourceLanguage) {
                console.log(`   检测到的源语言: ${translation.detectedSourceLanguage}`);
            }
        }
        else {
            console.error(`❌ 翻译失败: 响应格式不正确`);
            console.error(`   响应数据:`, JSON.stringify(translateResponse.data, null, 2));
        }
        console.log('\n');
        console.log('2️⃣  测试批量翻译（GET 请求）...');
        const batchTranslateResponse = await axios_1.default.get('https://translation.googleapis.com/language/translate/v2', {
            params: {
                q: ['Good morning', 'How are you?', 'Thank you'],
                target: 'ja',
                key: GOOGLE_TRANSLATE_API_KEY,
            },
            timeout: 10000,
        });
        if (batchTranslateResponse.data && batchTranslateResponse.data.data && batchTranslateResponse.data.data.translations) {
            const translations = batchTranslateResponse.data.data.translations;
            console.log(`✅ 批量翻译成功，翻译了 ${translations.length} 条文本`);
            translations.forEach((translation, index) => {
                console.log(`   ${index + 1}. ${translation.translatedText}`);
            });
        }
        else {
            console.error(`❌ 批量翻译失败: 响应格式不正确`);
        }
        console.log('\n');
        console.log('3️⃣  测试语言检测（GET 请求）...');
        const detectResponse = await axios_1.default.get('https://translation.googleapis.com/language/translate/v2/detect', {
            params: {
                q: 'Bonjour le monde',
                key: GOOGLE_TRANSLATE_API_KEY,
            },
            timeout: 10000,
        });
        if (detectResponse.data && detectResponse.data.data && detectResponse.data.data.detections) {
            const detections = detectResponse.data.data.detections[0];
            if (detections && detections.length > 0) {
                const detection = detections[0];
                console.log(`✅ 语言检测成功`);
                console.log(`   文本: Bonjour le monde`);
                console.log(`   检测到的语言: ${detection.language}`);
                console.log(`   置信度: ${detection.confidence || 'N/A'}`);
            }
            else {
                console.error(`❌ 语言检测失败: 未检测到语言`);
            }
        }
        else {
            console.error(`❌ 语言检测失败: 响应格式不正确`);
        }
        console.log('\n');
        console.log('4️⃣  测试获取支持的语言列表...');
        const languagesResponse = await axios_1.default.get('https://translation.googleapis.com/language/translate/v2/languages', {
            params: {
                key: GOOGLE_TRANSLATE_API_KEY,
                target: 'zh',
            },
            timeout: 10000,
        });
        if (languagesResponse.data && languagesResponse.data.data && languagesResponse.data.data.languages) {
            const languages = languagesResponse.data.data.languages;
            console.log(`✅ 获取语言列表成功，共 ${languages.length} 种语言`);
            console.log(`   前 10 种语言:`);
            languages.slice(0, 10).forEach((lang) => {
                console.log(`     - ${lang.language}: ${lang.name || 'N/A'}`);
            });
        }
        else {
            console.error(`❌ 获取语言列表失败: 响应格式不正确`);
        }
        console.log('\n✅ 所有测试完成！');
    }
    catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.response) {
            console.error('   响应状态:', error.response.status);
            console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
            if ((_a = error.response.data) === null || _a === void 0 ? void 0 : _a.error) {
                console.error('   API 错误:', error.response.data.error.message || error.response.data.error);
            }
        }
        else if (error.request) {
            console.error('   网络错误: 请求已发送但未收到响应');
            console.error('   可能原因:');
            console.error('     1. 网络连接问题（代理/防火墙）');
            console.error('     2. API Key 无效或未启用 Google Translate API');
            console.error('     3. API 配额已用完');
            console.error('   建议:');
            console.error('     - 检查网络连接和代理设置');
            console.error('     - 验证 API Key 是否正确');
            console.error('     - 确认 Google Cloud 项目中已启用 Translation API');
            console.error('     - 检查 API 配额和计费设置');
        }
        else {
            console.error('   错误详情:', error.message);
            if (error.stack) {
                console.error('   堆栈:', error.stack);
            }
        }
        process.exit(1);
    }
}
testTranslation().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-translation-direct-simple.js.map