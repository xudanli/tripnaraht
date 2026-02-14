"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
let AllExceptionsFilter = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger('ExceptionFilter');
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let errorCode;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            }
            else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const responseObj = exceptionResponse;
                message = responseObj.message || responseObj.error || message;
                errorCode = responseObj.errorCode;
            }
            else {
                message = exception.message || message;
            }
        }
        else if (exception instanceof Error) {
            message = exception.message;
            this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack, `${request.method} ${request.url}`);
        }
        else if (typeof exception === 'string') {
            message = exception;
        }
        else {
            this.logger.error(`Unknown exception type: ${JSON.stringify(exception)}`, undefined, `${request.method} ${request.url}`);
        }
        if (status >= 500 || process.env.NODE_ENV !== 'production') {
            this.logger.error(`${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`, exception instanceof Error ? exception.stack : undefined);
        }
        else if (status >= 400) {
            this.logger.warn(`${request.method} ${request.url} ${status} - ${JSON.stringify(message)}`);
        }
        const errorResponse = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
        };
        if (Array.isArray(message)) {
            errorResponse.message = message;
        }
        else {
            errorResponse.message = [message];
        }
        if (errorCode) {
            errorResponse.errorCode = errorCode;
        }
        if (status >= 500 && process.env.NODE_ENV === 'production') {
            errorResponse.message = ['Internal server error'];
        }
        response.status(status).json(errorResponse);
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=http-exception.filter.js.map