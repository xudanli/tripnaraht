"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TripPlannerFeedbackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripPlannerFeedbackService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../../prisma/prisma.service");
let TripPlannerFeedbackService = TripPlannerFeedbackService_1 = class TripPlannerFeedbackService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripPlannerFeedbackService_1.name);
    }
    async saveFeedback(feedback) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO trip_planner_feedback (
          question_id, session_id, trip_id, user_id,
          question, answer, helpful, rating, comment, action_taken,
          source, rag_confidence, processing_time_ms, created_at
        ) VALUES (
          ${feedback.questionId}::VARCHAR,
          ${feedback.sessionId || null}::VARCHAR,
          ${feedback.tripId || null}::VARCHAR, -- Trip.id 是 String 类型
          ${feedback.userId || null}::UUID,
          ${feedback.question || null}::TEXT,
          ${feedback.answer || null}::TEXT,
          ${feedback.helpful}::BOOLEAN,
          ${feedback.rating || null}::INTEGER,
          ${feedback.comment || null}::TEXT,
          ${feedback.actionTaken || null}::VARCHAR,
          ${feedback.source || null}::VARCHAR,
          ${feedback.ragConfidence || null}::FLOAT,
          ${feedback.processingTimeMs || null}::INTEGER,
          NOW()
        )
      `;
            this.logger.debug(`[反馈服务] 反馈已保存: questionId=${feedback.questionId}, helpful=${feedback.helpful}`);
        }
        catch (error) {
            this.logger.error(`[反馈服务] 保存反馈失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async analyzeFeedback(startDate, endDate) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          COUNT(*) as total_feedback,
          COUNT(*) FILTER (WHERE helpful = true) as helpful_count,
          COUNT(*) FILTER (WHERE helpful = false) as not_helpful_count,
          AVG(rating) as avg_rating,
          AVG(rag_confidence) as avg_rag_confidence,
          COUNT(*) FILTER (WHERE source = 'RAG') as rag_count,
          COUNT(*) FILTER (WHERE source = 'RAG+LLM') as rag_llm_count,
          COUNT(*) FILTER (WHERE source = 'LLM') as llm_count
        FROM trip_planner_feedback
        WHERE created_at >= ${startDate}::TIMESTAMPTZ
          AND created_at <= ${endDate}::TIMESTAMPTZ
      `;
            const stats = result[0] || {
                total_feedback: BigInt(0),
                helpful_count: BigInt(0),
                not_helpful_count: BigInt(0),
                avg_rating: 0,
                avg_rag_confidence: 0,
                rag_count: BigInt(0),
                rag_llm_count: BigInt(0),
                llm_count: BigInt(0),
            };
            const commonIssues = await this.prisma.$queryRaw `
        SELECT 
          comment as issue,
          COUNT(*) as count
        FROM trip_planner_feedback
        WHERE created_at >= ${startDate}::TIMESTAMPTZ
          AND created_at <= ${endDate}::TIMESTAMPTZ
          AND helpful = false
          AND comment IS NOT NULL
          AND comment != ''
        GROUP BY comment
        ORDER BY count DESC
        LIMIT 10
      `;
            return {
                periodStart: startDate,
                periodEnd: endDate,
                totalFeedback: Number(stats.total_feedback),
                helpfulCount: Number(stats.helpful_count),
                notHelpfulCount: Number(stats.not_helpful_count),
                averageRating: stats.avg_rating || 0,
                averageRagConfidence: stats.avg_rag_confidence || 0,
                sourceDistribution: {
                    RAG: Number(stats.rag_count),
                    'RAG+LLM': Number(stats.rag_llm_count),
                    LLM: Number(stats.llm_count),
                },
                commonIssues: commonIssues.map(i => ({
                    issue: i.issue,
                    count: Number(i.count),
                })),
            };
        }
        catch (error) {
            this.logger.error(`[反馈服务] 分析反馈失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async triggerImprovement(feedback) {
        var _a;
        this.logger.warn(`[反馈服务] 触发改进流程: questionId=${feedback.questionId}, rating=${feedback.rating}`);
        this.logger.debug(`[反馈服务] 负面反馈详情:`, {
            questionId: feedback.questionId,
            question: feedback.question,
            answer: (_a = feedback.answer) === null || _a === void 0 ? void 0 : _a.substring(0, 100),
            helpful: feedback.helpful,
            rating: feedback.rating,
            comment: feedback.comment,
            source: feedback.source,
            ragConfidence: feedback.ragConfidence,
        });
    }
    async getFeedbackStats(days = 7) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        return this.analyzeFeedback(startDate, endDate);
    }
};
exports.TripPlannerFeedbackService = TripPlannerFeedbackService;
exports.TripPlannerFeedbackService = TripPlannerFeedbackService = TripPlannerFeedbackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripPlannerFeedbackService);
//# sourceMappingURL=trip-planner-feedback.service.js.map