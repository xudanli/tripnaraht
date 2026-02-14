"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClientFactory = void 0;
const axios_1 = __importDefault(require("axios"));
class HttpClientFactory {
    static create(config) {
        var _a;
        const axiosConfig = {
            timeout: (_a = config.timeout) !== null && _a !== void 0 ? _a : 15000,
            headers: {
                'Accept': 'application/json',
                ...config.headers,
            },
        };
        if (config.baseURL) {
            axiosConfig.baseURL = config.baseURL;
        }
        if (config.params) {
            axiosConfig.params = config.params;
        }
        return axios_1.default.create(axiosConfig);
    }
    static createWithApiKey(apiKey, config) {
        const paramName = config.paramName || 'appid';
        const params = {
            [paramName]: apiKey || '',
            ...config.additionalParams,
        };
        return this.create({
            baseURL: config.baseURL,
            timeout: config.timeout,
            params,
        });
    }
}
exports.HttpClientFactory = HttpClientFactory;
//# sourceMappingURL=http-client.factory.js.map