"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAdapter = void 0;
const common_1 = require("@nestjs/common");
const http_client_factory_1 = require("../../common/utils/http-client.factory");
const adapter_mapper_util_1 = require("../../common/utils/adapter-mapper.util");
class BaseAdapter {
    constructor(adapterName, httpConfig) {
        this.logger = new common_1.Logger(adapterName);
        this.httpClient = http_client_factory_1.HttpClientFactory.create(httpConfig);
    }
    async safeRequest(requestFn, errorContext, defaultValue) {
        try {
            return await requestFn();
        }
        catch (error) {
            this.logger.error(`${errorContext}: ${adapter_mapper_util_1.AdapterMapper.extractErrorMessage(error)}`);
            return defaultValue;
        }
    }
    async safeRequestOrNull(requestFn, errorContext) {
        try {
            return await requestFn();
        }
        catch (error) {
            this.logger.debug(`${errorContext}: ${adapter_mapper_util_1.AdapterMapper.extractErrorMessage(error)}`);
            return null;
        }
    }
}
exports.BaseAdapter = BaseAdapter;
//# sourceMappingURL=base.adapter.js.map