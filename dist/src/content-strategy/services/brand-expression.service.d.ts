import { RationalExpression, WarmthExpression, BalancedCopy, ExpressionContext, CommunicationContext } from '../interfaces/brand-expression.interface';
import { UserContext } from '../interfaces/copy-standards.interface';
export declare class BrandExpressionService {
    private readonly logger;
    generateRationalExpression(data: any, context: ExpressionContext): RationalExpression;
    generateWarmthExpression(userContext: UserContext, context: ExpressionContext): WarmthExpression;
    generateBalancedCopy(content: any, context: CommunicationContext): BalancedCopy;
    private generateFactLayer;
    private generateRelationLayer;
    private generatePredictionLayer;
    private generateSuggestionLayer;
    private generateUnderstanding;
    private generateCompanion;
    private generateEncouragement;
    private generateDetail;
    private determineRatio;
    private generateRationalText;
    private generateWarmthText;
    private combineParts;
}
