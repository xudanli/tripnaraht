"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenAIHttp = createOpenAIHttp;
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
function createOpenAIHttp(baseURL = 'https://api.openai.com/v1', logger, options) {
    const proxyUrl = (options === null || options === void 0 ? void 0 : options.disableProxy)
        ? undefined
        : (process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.ALL_PROXY ||
            process.env.all_proxy);
    if (proxyUrl && logger) {
        logger.log(`[OpenAI HTTP Factory] 使用代理: ${proxyUrl}`);
    }
    else if (!proxyUrl && logger) {
        if (options === null || options === void 0 ? void 0 : options.disableProxy) {
            logger.debug('[OpenAI HTTP Factory] 代理已禁用');
        }
        else {
            logger.warn('[OpenAI HTTP Factory] 未找到代理环境变量。如果需要通过代理访问外部 API，请设置 HTTPS_PROXY 或 ALL_PROXY。');
        }
    }
    let processedBaseUrl = baseURL;
    if (processedBaseUrl.startsWith('http://')) {
        if (logger) {
            logger.warn(`OPENAI_BASE_URL uses HTTP, converting to HTTPS: ${processedBaseUrl}`);
        }
        processedBaseUrl = processedBaseUrl.replace('http://', 'https://');
    }
    if (!processedBaseUrl.startsWith('https://')) {
        throw new Error(`OPENAI_BASE_URL must start with https://, got: ${processedBaseUrl}`);
    }
    processedBaseUrl = processedBaseUrl.replace(/\/$/, '');
    const httpsAgent = proxyUrl
        ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
        : new https_1.default.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 60000,
            family: 4,
        });
    return axios_1.default.create({
        baseURL: processedBaseUrl,
        timeout: 60000,
        proxy: false,
        httpsAgent,
        httpAgent: proxyUrl ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl) : undefined,
        headers: { 'Content-Type': 'application/json' },
    });
}
//# sourceMappingURL=openai-http.factory.js.map