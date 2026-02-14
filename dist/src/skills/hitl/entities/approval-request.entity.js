"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalRequestSchema = void 0;
exports.ApprovalRequestSchema = {
    id: String,
    threadId: String,
    toolCallId: String,
    skillName: String,
    payload: Object,
    status: String,
    createdAt: Date,
    expiresAt: Date,
    result: Object,
    userPrompt: Object,
    metadata: Object,
};
//# sourceMappingURL=approval-request.entity.js.map