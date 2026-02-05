"""
TripNARA LLM Judge Service

职责：使用 LLM 进行质量评分、方案比较、LoRA 模型评估

功能：
1. /score - 对计划进行质量评分
2. /batch-score - 批量评分
3. /compare - 比较两个计划
4. /evaluate-lora - 评估 LoRA 模型输出质量
5. /calibrate - 校准评分

整合自：scripts/rl-infra/llm_judge_service.py
增强功能：支持真实 LLM API 调用、LoRA 模型评估
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
import httpx

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# LLM 配置
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
VLLM_URL = os.getenv("VLLM_URL", "http://vllm:8000")

app = FastAPI(
    title="TripNARA LLM Judge Service",
    description="LLM Judge 服务 - 使用 LLM 进行质量评分和模型评估",
    version="2.0.0",
)


# ===================== 数据模型 =====================

class QualityDimension(str, Enum):
    SAFETY = "SAFETY"           # 安全性
    FEASIBILITY = "FEASIBILITY" # 可执行性
    RELEVANCE = "RELEVANCE"     # 相关性
    COMPLETENESS = "COMPLETENESS"  # 完整性
    CLARITY = "CLARITY"         # 清晰度
    DECISION_QUALITY = "DECISION_QUALITY"  # 决策质量 (新增)
    TOOL_USAGE = "TOOL_USAGE"   # 工具使用准确性 (新增)


class DiagnosticLabel(str, Enum):
    EVIDENCE_MISSING = "EVIDENCE_MISSING"       # 证据缺失
    HALLUCINATION_RISK = "HALLUCINATION_RISK"   # 幻觉风险
    NOT_EXECUTABLE = "NOT_EXECUTABLE"           # 不可执行
    SAFETY_CONCERN = "SAFETY_CONCERN"           # 安全担忧
    COMPLIANCE_ISSUE = "COMPLIANCE_ISSUE"       # 合规问题
    TOOL_CALL_ERROR = "TOOL_CALL_ERROR"         # 工具调用错误 (新增)
    REASONING_WEAK = "REASONING_WEAK"           # 推理薄弱 (新增)


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
    llm_provider: str = "simulated"


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


class LoraEvalRequest(BaseModel):
    """LoRA 模型评估请求"""
    request_id: str
    prompt: str
    baseline_response: str  # Claude/GPT 基线响应
    lora_response: str      # LoRA 模型响应
    task_type: str = "decision"  # decision, planning, explanation
    ground_truth: Optional[str] = None


class LoraEvalResponse(BaseModel):
    """LoRA 模型评估响应"""
    request_id: str
    baseline_score: float
    lora_score: float
    winner: str  # "baseline", "lora", "tie"
    dimension_comparison: Dict[str, Dict[str, float]]
    reasoning: str
    recommendations: List[str]
    latency_ms: float
    timestamp: str


# ===================== LLM 客户端 =====================

async def call_anthropic(prompt: str, model: str = "claude-3-haiku-20240307") -> str:
    """调用 Anthropic Claude API"""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]


async def call_openai(prompt: str, model: str = "gpt-3.5-turbo") -> str:
    """调用 OpenAI API"""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def call_vllm(prompt: str, model: str = "default") -> str:
    """调用 vLLM API"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{VLLM_URL}/v1/chat/completions",
            json={
                "model": model,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def call_llm(prompt: str) -> tuple[str, str]:
    """统一 LLM 调用接口，返回 (响应, 提供商)"""
    try:
        if LLM_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
            return await call_anthropic(prompt), "anthropic"
        elif LLM_PROVIDER == "openai" and OPENAI_API_KEY:
            return await call_openai(prompt), "openai"
        elif LLM_PROVIDER == "vllm":
            return await call_vllm(prompt), "vllm"
        else:
            # 降级到模拟模式
            return "", "simulated"
    except Exception as e:
        logger.warning(f"LLM call failed: {e}, falling back to simulated mode")
        return "", "simulated"


# ===================== Judge Prompts =====================

JUDGE_PROMPT_TEMPLATE = """You are an expert travel plan evaluator. Evaluate the following travel plan based on these criteria:

1. SAFETY (0-10): Is the plan safe? Are there any risk factors?
2. FEASIBILITY (0-10): Can this plan be executed? Is the timing realistic?
3. RELEVANCE (0-10): Does the plan match the user's request?
4. COMPLETENESS (0-10): Does the plan cover all necessary aspects?
5. CLARITY (0-10): Is the plan clear and easy to follow?
6. DECISION_QUALITY (0-10): Are the decisions well-reasoned?
7. TOOL_USAGE (0-10): Are the tools/skills used appropriately?

User Request: {user_request}

Plan:
{plan_json}

Evidence (if any):
{evidence_json}

Decision Log (if any):
{decision_log_json}

Please evaluate and respond in JSON format:
{{
    "overall_score": <0-10>,
    "dimension_scores": [
        {{"dimension": "SAFETY", "score": <0-10>, "reasoning": "..."}},
        ...
    ],
    "diagnostic_labels": ["EVIDENCE_MISSING", ...],
    "reasoning": "...",
    "suggestions": ["...", ...]
}}"""


LORA_EVAL_PROMPT_TEMPLATE = """You are an expert AI model evaluator. Compare the following two responses to the same prompt.

Task Type: {task_type}

Original Prompt:
{prompt}

Baseline Response (Claude/GPT):
{baseline_response}

LoRA Model Response:
{lora_response}

Ground Truth (if available):
{ground_truth}

Evaluate both responses on:
1. Accuracy: How correct is the response?
2. Relevance: How well does it address the prompt?
3. Reasoning: How good is the reasoning quality?
4. Tool Usage: Are any tool calls correct? (if applicable)
5. Completeness: Is the response complete?

Respond in JSON format:
{{
    "baseline_score": <0-10>,
    "lora_score": <0-10>,
    "winner": "baseline" | "lora" | "tie",
    "dimension_comparison": {{
        "accuracy": {{"baseline": <0-10>, "lora": <0-10>}},
        "relevance": {{"baseline": <0-10>, "lora": <0-10>}},
        "reasoning": {{"baseline": <0-10>, "lora": <0-10>}},
        "tool_usage": {{"baseline": <0-10>, "lora": <0-10>}},
        "completeness": {{"baseline": <0-10>, "lora": <0-10>}}
    }},
    "reasoning": "...",
    "recommendations": ["...", ...]
}}"""


# ===================== 评分逻辑 =====================

def parse_json_response(text: str) -> dict:
    """解析 LLM JSON 响应"""
    try:
        # 尝试直接解析
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试提取 JSON 块
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError("Failed to parse JSON from LLM response")


async def run_llm_scoring(request: ScoreRequest) -> ScoreResponse:
    """运行 LLM 评分"""
    start_time = time.time()
    
    try:
        # 构建 prompt
        prompt = JUDGE_PROMPT_TEMPLATE.format(
            user_request=request.user_request,
            plan_json=json.dumps([p.model_dump() for p in request.plan], indent=2, ensure_ascii=False),
            evidence_json=json.dumps(request.evidence or [], indent=2, ensure_ascii=False),
            decision_log_json=json.dumps(request.decision_log or [], indent=2, ensure_ascii=False),
        )
        
        # 调用 LLM
        llm_response, provider = await call_llm(prompt)
        
        if llm_response and provider != "simulated":
            # 解析真实 LLM 响应
            result = parse_json_response(llm_response)
            
            dimension_scores = [
                DimensionScore(
                    dimension=QualityDimension(d["dimension"]),
                    score=float(d["score"]),
                    reasoning=d.get("reasoning", ""),
                )
                for d in result.get("dimension_scores", [])
            ]
            
            diagnostic_labels = [
                DiagnosticLabel(label) for label in result.get("diagnostic_labels", [])
                if label in DiagnosticLabel.__members__
            ]
            
            return ScoreResponse(
                request_id=request.request_id,
                overall_score=float(result.get("overall_score", 7.0)),
                dimension_scores=dimension_scores,
                diagnostic_labels=diagnostic_labels,
                reasoning=result.get("reasoning", ""),
                suggestions=result.get("suggestions", []),
                latency_ms=(time.time() - start_time) * 1000,
                timestamp=datetime.utcnow().isoformat() + "Z",
                llm_provider=provider,
            )
        
        # 降级到模拟评分
        return await run_simulated_scoring(request, start_time)
        
    except Exception as e:
        logger.error(f"[LLMJudge] 评分失败: request_id={request.request_id}, error={e}")
        # 降级到模拟评分
        return await run_simulated_scoring(request, start_time)


async def run_simulated_scoring(request: ScoreRequest, start_time: float) -> ScoreResponse:
    """模拟评分（当 LLM 不可用时）"""
    # 模拟评分逻辑
    plan_length = len(request.plan)
    has_evidence = bool(request.evidence)
    has_decision_log = bool(request.decision_log)
    
    # 基础评分
    base_score = 7.0
    
    # 根据内容调整
    if plan_length > 0:
        base_score += min(plan_length * 0.3, 1.5)
    if has_evidence:
        base_score += 0.5
    if has_decision_log:
        base_score += 0.3
    
    overall_score = min(10.0, max(0.0, base_score))
    
    # 生成维度评分
    dimension_scores = [
        DimensionScore(dimension=QualityDimension.SAFETY, score=overall_score + 0.2, reasoning="Safety appears adequate"),
        DimensionScore(dimension=QualityDimension.FEASIBILITY, score=overall_score, reasoning="Timing is reasonable"),
        DimensionScore(dimension=QualityDimension.RELEVANCE, score=overall_score + 0.3, reasoning="Plan aligns with request"),
        DimensionScore(dimension=QualityDimension.COMPLETENESS, score=overall_score - 0.2, reasoning="Some details could be expanded"),
        DimensionScore(dimension=QualityDimension.CLARITY, score=overall_score + 0.1, reasoning="Plan is well-structured"),
        DimensionScore(dimension=QualityDimension.DECISION_QUALITY, score=overall_score, reasoning="Decisions are reasonable"),
        DimensionScore(dimension=QualityDimension.TOOL_USAGE, score=overall_score - 0.1, reasoning="Tool usage appears appropriate"),
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
    
    return ScoreResponse(
        request_id=request.request_id,
        overall_score=overall_score,
        dimension_scores=dimension_scores,
        diagnostic_labels=diagnostic_labels,
        reasoning=f"Plan evaluated with overall score of {overall_score:.1f}/10 (simulated)",
        suggestions=suggestions,
        latency_ms=(time.time() - start_time) * 1000,
        timestamp=datetime.utcnow().isoformat() + "Z",
        llm_provider="simulated",
    )


async def run_lora_evaluation(request: LoraEvalRequest) -> LoraEvalResponse:
    """评估 LoRA 模型输出质量"""
    start_time = time.time()
    
    try:
        # 构建评估 prompt
        prompt = LORA_EVAL_PROMPT_TEMPLATE.format(
            task_type=request.task_type,
            prompt=request.prompt,
            baseline_response=request.baseline_response,
            lora_response=request.lora_response,
            ground_truth=request.ground_truth or "Not available",
        )
        
        # 调用 LLM 进行评估
        llm_response, provider = await call_llm(prompt)
        
        if llm_response and provider != "simulated":
            result = parse_json_response(llm_response)
            
            return LoraEvalResponse(
                request_id=request.request_id,
                baseline_score=float(result.get("baseline_score", 7.5)),
                lora_score=float(result.get("lora_score", 7.0)),
                winner=result.get("winner", "tie"),
                dimension_comparison=result.get("dimension_comparison", {}),
                reasoning=result.get("reasoning", ""),
                recommendations=result.get("recommendations", []),
                latency_ms=(time.time() - start_time) * 1000,
                timestamp=datetime.utcnow().isoformat() + "Z",
            )
        
        # 降级到简单比较
        baseline_len = len(request.baseline_response)
        lora_len = len(request.lora_response)
        
        baseline_score = 7.5
        lora_score = 7.0 + (0.5 if lora_len > baseline_len * 0.8 else 0)
        
        return LoraEvalResponse(
            request_id=request.request_id,
            baseline_score=baseline_score,
            lora_score=lora_score,
            winner="baseline" if baseline_score > lora_score else ("lora" if lora_score > baseline_score else "tie"),
            dimension_comparison={
                "accuracy": {"baseline": 7.5, "lora": 7.0},
                "relevance": {"baseline": 7.5, "lora": 7.2},
                "reasoning": {"baseline": 7.5, "lora": 6.8},
                "tool_usage": {"baseline": 7.5, "lora": 7.0},
                "completeness": {"baseline": 7.5, "lora": 7.0},
            },
            reasoning="Simulated evaluation based on response length and structure",
            recommendations=["Collect more training data", "Fine-tune on specific task types"],
            latency_ms=(time.time() - start_time) * 1000,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )
        
    except Exception as e:
        logger.error(f"[LLMJudge] LoRA 评估失败: request_id={request.request_id}, error={e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== API 端点 =====================

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "llm_judge",
        "version": "2.0.0",
        "llm_provider": LLM_PROVIDER,
        "has_anthropic_key": bool(ANTHROPIC_API_KEY),
        "has_openai_key": bool(OPENAI_API_KEY),
        "vllm_url": VLLM_URL,
    }


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
    
    start_time = time.time()
    
    # 分别评分
    score_a_req = ScoreRequest(
        request_id=f"{request.request_id}_a",
        plan=request.plan_a,
        user_request=request.user_request,
    )
    score_b_req = ScoreRequest(
        request_id=f"{request.request_id}_b",
        plan=request.plan_b,
        user_request=request.user_request,
    )
    
    result_a = await run_llm_scoring(score_a_req)
    result_b = await run_llm_scoring(score_b_req)
    
    score_a = result_a.overall_score
    score_b = result_b.overall_score
    
    if abs(score_a - score_b) < 0.5:
        winner = "TIE"
    elif score_a > score_b:
        winner = "A"
    else:
        winner = "B"
    
    return CompareResponse(
        request_id=request.request_id,
        winner=winner,
        score_a=score_a,
        score_b=score_b,
        reasoning=f"Plan {winner} is preferred. A: {score_a:.1f}, B: {score_b:.1f}",
        latency_ms=(time.time() - start_time) * 1000,
        timestamp=datetime.utcnow().isoformat() + "Z",
    )


@app.post("/evaluate-lora", response_model=LoraEvalResponse)
async def evaluate_lora(request: LoraEvalRequest):
    """评估 LoRA 模型输出质量"""
    logger.info(f"[LLMJudge] 收到 LoRA 评估请求: request_id={request.request_id}")
    return await run_lora_evaluation(request)


@app.get("/prompts")
async def list_prompts():
    """列出可用的 Judge Prompt 模板"""
    return {
        "prompts": [
            {
                "id": "plan_judge",
                "name": "Plan Quality Judge",
                "description": "Standard travel plan quality evaluation",
            },
            {
                "id": "lora_eval",
                "name": "LoRA Model Evaluation",
                "description": "Compare LoRA model output with baseline",
            },
        ]
    }


@app.get("/config")
async def get_config():
    """获取当前配置"""
    return {
        "llm_provider": LLM_PROVIDER,
        "vllm_url": VLLM_URL,
        "anthropic_configured": bool(ANTHROPIC_API_KEY),
        "openai_configured": bool(OPENAI_API_KEY),
    }


# ===================== 主入口 =====================

if __name__ == "__main__":
    port = int(os.getenv("LLM_JUDGE_SERVICE_PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
