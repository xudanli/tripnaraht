"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_HANDLING_STRATEGIES = exports.ErrorType = void 0;
exports.getErrorHandlingStrategy = getErrorHandlingStrategy;
exports.inferErrorType = inferErrorType;
var ErrorType;
(function (ErrorType) {
    ErrorType["CRITICAL_DEPENDENCY_MISSING"] = "CRITICAL_DEPENDENCY_MISSING";
    ErrorType["MISSING_REQUIRED_PARAM"] = "MISSING_REQUIRED_PARAM";
    ErrorType["INSUFFICIENT_PERMISSIONS"] = "INSUFFICIENT_PERMISSIONS";
    ErrorType["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
    ErrorType["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorType["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
    ErrorType["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
exports.ERROR_HANDLING_STRATEGIES = {
    [ErrorType.CRITICAL_DEPENDENCY_MISSING]: {
        shouldReject: true,
        shouldShowClarification: true,
        allowRetry: false,
        requiresUserConfirmation: false,
        messageTemplate: '无法完成行程规划，因为 {skillName} 的关键依赖服务不可用。',
        suggestedSolutions: [
            '检查服务状态',
            '联系系统管理员',
            '稍后重试',
        ],
    },
    [ErrorType.MISSING_REQUIRED_PARAM]: {
        shouldReject: false,
        shouldShowClarification: true,
        allowRetry: true,
        requiresUserConfirmation: true,
        messageTemplate: '无法完成行程规划，因为缺少必需的信息。',
        suggestedSolutions: [
            '提供完整的请求信息',
            '检查请求参数是否完整',
            '提供更多上下文信息',
        ],
    },
    [ErrorType.INSUFFICIENT_PERMISSIONS]: {
        shouldReject: true,
        shouldShowClarification: true,
        allowRetry: false,
        requiresUserConfirmation: false,
        messageTemplate: '您没有执行该操作的权限。',
        suggestedSolutions: [
            '检查您的权限设置',
            '联系系统管理员',
            '使用其他入口（如规划工作台）',
        ],
    },
    [ErrorType.SERVICE_UNAVAILABLE]: {
        shouldReject: false,
        shouldShowClarification: true,
        allowRetry: true,
        requiresUserConfirmation: false,
        messageTemplate: '服务暂时不可用，请稍后重试。',
        suggestedSolutions: [
            '稍后重试',
            '检查网络连接',
            '联系系统管理员',
        ],
    },
    [ErrorType.VALIDATION_ERROR]: {
        shouldReject: false,
        shouldShowClarification: true,
        allowRetry: true,
        requiresUserConfirmation: true,
        messageTemplate: '输入参数验证失败：{errorMessage}',
        suggestedSolutions: [
            '检查输入参数格式',
            '提供正确的参数值',
            '参考 API 文档',
        ],
    },
    [ErrorType.TIMEOUT_ERROR]: {
        shouldReject: false,
        shouldShowClarification: true,
        allowRetry: true,
        requiresUserConfirmation: false,
        messageTemplate: '操作超时，请稍后重试。',
        suggestedSolutions: [
            '稍后重试',
            '简化请求内容',
            '增加超时时间',
        ],
    },
    [ErrorType.UNKNOWN_ERROR]: {
        shouldReject: true,
        shouldShowClarification: true,
        allowRetry: false,
        requiresUserConfirmation: false,
        messageTemplate: '处理过程中出现未知错误：{errorMessage}',
        suggestedSolutions: [
            '联系系统管理员',
            '查看错误日志',
            '稍后重试',
        ],
    },
};
function getErrorHandlingStrategy(errorType) {
    return exports.ERROR_HANDLING_STRATEGIES[errorType] || exports.ERROR_HANDLING_STRATEGIES[ErrorType.UNKNOWN_ERROR];
}
function inferErrorType(error) {
    if (error === null || error === void 0 ? void 0 : error.isCriticalDependencyMissing) {
        return ErrorType.CRITICAL_DEPENDENCY_MISSING;
    }
    const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || '';
    if (errorMessage.includes('是必需的') ||
        errorMessage.includes('is required') ||
        errorMessage.includes('必须提供') ||
        errorMessage.includes('必须传入') ||
        errorMessage.includes('缺少') ||
        errorMessage.includes('missing')) {
        return ErrorType.MISSING_REQUIRED_PARAM;
    }
    if (errorMessage.includes('权限') ||
        errorMessage.includes('permission') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('forbidden')) {
        return ErrorType.INSUFFICIENT_PERMISSIONS;
    }
    if (errorMessage.includes('不可用') ||
        errorMessage.includes('unavailable') ||
        errorMessage.includes('service unavailable')) {
        return ErrorType.SERVICE_UNAVAILABLE;
    }
    if (errorMessage.includes('验证') ||
        errorMessage.includes('validation') ||
        errorMessage.includes('invalid')) {
        return ErrorType.VALIDATION_ERROR;
    }
    if (errorMessage.includes('超时') ||
        errorMessage.includes('timeout') ||
        (error === null || error === void 0 ? void 0 : error.code) === 'ETIMEDOUT') {
        return ErrorType.TIMEOUT_ERROR;
    }
    return ErrorType.UNKNOWN_ERROR;
}
//# sourceMappingURL=error-types.interface.js.map