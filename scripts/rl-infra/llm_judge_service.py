"""
LLM Judge Service

职责：使用LLM进行质量评分

功能：
1. /score - 对计划进行质量评分
2. /batch-score - 批量评分
3. /compare - 比较两个计划
4. /calibrate - 校准评分
"""

import os
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List
from enum import Enum
import uuid
import logging
import time
import json

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LLM Judge Service",
    description="LLM Judge服务 - 使用LLM进行质量评分",
    version="1.0.0",
)


# ===================== 数据模型 =====================

class QualityDimension(str, Enum):
    SAFETY = "SAFETY"           # 安全性
    FEASIBILITY = "FEASIBILITY" # 可执行性
    RELEVANCE = "RELEVANCE"     # 相关性
    COMPLETENESS = "COMPLETENESS"  # 完整性
    CLARITY = "CLARITY"         # 清晰度


class DiagnosticLabel(str, Enum):
    EVIDENCE_MISSING = "EVIDENCE_MISSING"       # 证据缺失
    HALLUCINATION_RISK = "HALLUCINATION_RISK"   # 幻觉风险
    NOT_EXECUTABLE = "NOT_EXECUTABLE"           # 不可执行
    SAFETY_CONCERN = "SAFETY_CONCERN"           # 安全担忧
    COMPLIANCE_ISSUE = "COMPLIANCE_ISSUE"       # 合规问题


class PlanItem(BaseModel):
    """计划项"""
    day: int
    activities: List[Dict[str, Any]]
    summary: Optional[str] = None


class ScoreRequest(BaseModel):
    """评分请求"""
    request_id: str
    plan: List[PlanItem]
    user_request: str
    evidence: Optional[List[Dict[str, Any]]] = None
    decision_log: Optional[List[Dict[str, Any]]] = None
    context: Optional[Dict[str, Any]] = None


class DimensionScore(BaseModel):
    """维度评分"""
    dimension: QualityDimension
    score: float  # 0-10
    reasoning: str


class ScoreResponse(BaseModel):
    """评分响应"""
    request_id: str
    overall_score: float  # 0-10
    dimension_scores: List[DimensionScore]
    diagnostic_labels: List[DiagnosticLabel]
    reasoning: str
    suggestions: List[str]
    latency_ms: float
    timestamp: str


class BatchScoreRequest(BaseModel):
    """批量评分请求"""
    requests: List[ScoreRequest]


class BatchScoreResponse(BaseModel):
    """批量评分响应"""
    responses: List[ScoreResponse]
    total_latency_ms: float


class CompareRequest(BaseModel):
    """比较请求"""
    request_id: str
    plan_a: List[PlanItem]
    plan_b: List[PlanItem]
    user_request: str


class CompareResponse(BaseModel):
    """比较响应"""
    request_id: str
    winner: str  # "A", "B", or "TIE"
    score_a: float
    score_b: float
    reasoning: str
    latency_ms: float
    timestamp: str


# ===================== 评分逻辑 =====================

# Judge Prompt模板
JUDGE_PROMPT_TEMPLATE = """You are an expert travel plan evaluator. Evaluate the following travel plan based on these criteria:

1. SAFETY (0-10): Is the plan safe? Are there any risk factors?
2. FEASIBILITY (0-10): Can this plan be executed? Is the timing realistic?
3. RELEVANCE (0-10): Does the plan match the user's request?
4. COMPLETENESS (0-10): Does the plan cover all necessary aspects?
5. CLARITY (0-10): Is the plan clear and easy to follow?

User Request: {user_request}

Plan:
{plan_json}

Evidence (if any):
{evidence_json}

Please evaluate the plan and provide:
1. A score (0-10) for each dimension
2. An overall score (0-10)
3. Any diagnostic labels (EVIDENCE_MISSING, HALLUCINATION_RISK, NOT_EXECUTABLE, SAFETY_CONCERN, COMPLIANCE_ISSUE)
4. Brief reasoning
5. Suggestions for improvement

Respond in JSON format."""


async def run_llm_scoring(request: ScoreRequest) -> ScoreResponse:
    """
    运行LLM评分
    
    TODO: 实际实现应该：
    1. 构建prompt
    2. 调用LLM API
    3. 解析响应
    4. 返回评分结果
    """
    start_time = time.time()
    
    try:
        # 模拟LLM调用延迟
        await asyncio.sleep(0.1)  # 100ms
        
        # 模拟评分逻辑
        # TODO: 实际实现应该调用Claude或GPT API
        
        # 计算模拟评分
        plan_length = len(request.plan)
        has_evidence = bool(request.evidence)
        
        # 基础评分
        base_score = 7.0
        
        # 根据计划长度调整
        if plan_length > 0:
            base_score += min(plan_length * 0.3, 1.5)
        
        # 根据证据调整
        if has_evidence:
            base_score += 0.5
        
        # 限制在0-10范围内
        overall_score = min(10.0, max(0.0, base_score))
        
        # 生成维度评分
        dimension_scores = [
            DimensionScore(
                dimension=QualityDimension.SAFETY,
                score=overall_score + 0.2,
                reasoning="Plan appears to have appropriate safety considerations",
            ),
            DimensionScore(
                dimension=QualityDimension.FEASIBILITY,
                score=overall_score,
                reasoning="Timing and logistics are reasonable",
            ),
            DimensionScore(
                dimension=QualityDimension.RELEVANCE,
                score=overall_score + 0.3,
                reasoning="Plan aligns with user request",
            ),
            DimensionScore(
                dimension=QualityDimension.COMPLETENESS,
                score=overall_score - 0.2,
                reasoning="Some details could be more comprehensive",
            ),
            DimensionScore(
                dimension=QualityDimension.CLARITY,
                score=overall_score + 0.1,
                reasoning="Plan is well-structured and easy to follow",
            ),
        ]
        
        # 生成诊断标签
        diagnostic_labels = []
        if not has_evidence:
            diagnostic_labels.append(DiagnosticLabel.EVIDENCE_MISSING)
        if plan_length < 2:
            diagnostic_labels.append(DiagnosticLabel.NOT_EXECUTABLE)
        
        # 生成建议
        suggestions = []
        if not has_evidence:
            suggestions.append("Add supporting evidence for recommendations")
        if plan_length < 3:
            suggestions.append("Consider adding more details to the itinerary")
        
        latency_ms = (time.time() - start_time) * 1000
        
        return ScoreResponse(
            request_id=request.request_id,
            overall_score=overall_score,
            dimension_scores=dimension_scores,
            diagnostic_labels=diagnostic_labels,
            reasoning=f"Plan evaluated with overall score of {overall_score:.1f}/10",
            suggestions=suggestions,
            latency_ms=latency_ms,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )
        
    except Exception as e:
        logger.error(f"[LLMJudge] 评分失败: request_id={request.request_id}, error={e}")
        raise HTTPException(status_code=500, detail=str(e))


async def run_llm_compare(request: CompareRequest) -> CompareResponse:
    """
    运行LLM比较
    """
    start_time = time.time()
    
    try:
        # 模拟LLM调用延迟
        await asyncio.sleep(0.15)  # 150ms
        
        # 模拟比较逻辑
        score_a = 7.5 + len(request.plan_a) * 0.2
        score_b = 7.3 + len(request.plan_b) * 0.2
        
        if abs(score_a - score_b) < 0.5:
            winner = "TIE"
        elif score_a > score_b:
            winner = "A"
        else:
            winner = "B"
        
        latency_ms = (time.time() - start_time) * 1000
        
        return CompareResponse(
            request_id=request.request_id,
            winner=winner,
            score_a=score_a,
            score_b=score_b,
            reasoning=f"Plan {winner} is preferred based on completeness and feasibility",
            latency_ms=latency_ms,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )
        
    except Exception as e:
        logger.error(f"[LLMJudge] 比较失败: request_id={request.request_id}, error={e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== API 端点 =====================

@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "service": "llm_judge"}


@app.post("/score", response_model=ScoreResponse)
async def score_plan(request: ScoreRequest):
    """对计划进行质量评分"""
    logger.info(f"[LLMJudge] 收到评分请求: request_id={request.request_id}")
    return await run_llm_scoring(request)


@app.post("/batch-score", response_model=BatchScoreResponse)
async def batch_score(request: BatchScoreRequest):
    """批量评分"""
    start_time = time.time()
    
    responses = []
    for req in request.requests:
        response = await run_llm_scoring(req)
        responses.append(response)
    
    total_latency_ms = (time.time() - start_time) * 1000
    
    logger.info(f"[LLMJudge] 批量评分完成: count={len(responses)}, total_latency_ms={total_latency_ms:.2f}")
    
    return BatchScoreResponse(
        responses=responses,
        total_latency_ms=total_latency_ms,
    )


@app.post("/compare", response_model=CompareResponse)
async def compare_plans(request: CompareRequest):
    """比较两个计划"""
    logger.info(f"[LLMJudge] 收到比较请求: request_id={request.request_id}")
    return await run_llm_compare(request)


@app.get("/prompts")
async def list_prompts():
    """列出可用的Judge Prompt模板"""
    return {
        "prompts": [
            {
                "id": "default",
                "name": "Default Judge Prompt",
                "description": "Standard quality evaluation prompt",
                "template": JUDGE_PROMPT_TEMPLATE[:200] + "...",
            }
        ]
    }


# ===================== 主入口 =====================

if __name__ == "__main__":
    port = int(os.getenv("LLM_JUDGE_SERVICE_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
