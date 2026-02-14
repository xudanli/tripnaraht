"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggingInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let LoggingInterceptor = class LoggingInterceptor {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const { method, originalUrl } = request;
        const start = Date.now();
        console.log(`[HTTP-Interceptor] 请求到达: ${method} ${originalUrl}`);
        this.logger.log(`[Interceptor] 请求到达: ${method} ${originalUrl}`);
        const logResponse = () => {
            const statusCode = response.statusCode || 200;
            const duration = Date.now() - start;
            const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms`;
            console.log(`[HTTP-Interceptor] ${logMessage}`);
            this.logger.log(`[Interceptor] ${logMessage}`);
        };
        response.once('finish', logResponse);
        response.once('close', () => {
            if (!response.writableFinished) {
                logResponse();
            }
        });
        return next.handle().pipe((0, operators_1.tap)({
            next: () => {
                if (response.writableFinished || response.headersSent) {
                    logResponse();
                }
            },
            error: (error) => {
                const logError = () => {
                    const statusCode = response.statusCode || ((error === null || error === void 0 ? void 0 : error.status) || 500);
                    const duration = Date.now() - start;
                    const logMessage = `${method} ${originalUrl} ${statusCode} ${duration}ms [ERROR]`;
                    console.error(`[HTTP-Interceptor] ${logMessage}`, error === null || error === void 0 ? void 0 : error.message);
                    this.logger.error(`[Interceptor] ${logMessage}`, error === null || error === void 0 ? void 0 : error.stack);
                };
                if (response.writableFinished || response.headersSent) {
                    logError();
                }
                else {
                    response.once('finish', logError);
                }
            },
        }));
    }
};
exports.LoggingInterceptor = LoggingInterceptor;
exports.LoggingInterceptor = LoggingInterceptor = __decorate([
    (0, common_1.Injectable)()
], LoggingInterceptor);
//# sourceMappingURL=logging.interceptor.js.map