"""
TripNARA Embedding Service

提供 BGE-M3 Embedding 和 BGE-Reranker 服务
支持 NestJS 后端通过 HTTP API 调用

API 端点：
- GET  /health           - 健康检查
- POST /v1/embeddings    - 生成文本向量
- POST /v1/rerank        - 文档重排序

模型：
- BGE-M3 (BAAI/bge-m3): 1024 维稠密向量
- BGE-Reranker-v2-M3 (BAAI/bge-reranker-v2-m3): 重排序
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import torch
import logging
import os
import time
from contextlib import asynccontextmanager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全局模型实例
embedding_model = None
reranker_model = None
model_load_time = None


# ==================== Pydantic Models ====================

class EmbeddingRequest(BaseModel):
    """Embedding 请求"""
    texts: List[str] = Field(..., description="要生成 embedding 的文本列表")
    model: str = Field(default="bge-m3", description="模型名称")
    return_sparse: bool = Field(default=False, description="是否返回稀疏向量")
    return_colbert: bool = Field(default=False, description="是否返回 ColBERT 向量")


class SparseVector(BaseModel):
    """稀疏向量"""
    tokens: List[int]
    weights: List[float]


class EmbeddingResult(BaseModel):
    """单个 embedding 结果"""
    dense: List[float] = Field(..., description="稠密向量 (1024维)")
    sparse: Optional[Dict[str, Any]] = Field(default=None, description="稀疏向量")
    colbert: Optional[List[List[float]]] = Field(default=None, description="ColBERT 向量")


class EmbeddingResponse(BaseModel):
    """Embedding 响应"""
    embeddings: List[EmbeddingResult]
    usage: Dict[str, int]
    model: str


class RerankDocument(BaseModel):
    """重排序文档"""
    id: str
    text: str


class RerankRequest(BaseModel):
    """Rerank 请求"""
    query: str = Field(..., description="查询文本")
    documents: List[RerankDocument] = Field(..., description="待排序文档")
    top_k: int = Field(default=10, description="返回前 k 个结果")
    model: str = Field(default="bge-reranker-v2-m3", description="模型名称")


class RerankResult(BaseModel):
    """重排序结果"""
    id: str
    score: float
    rank: int


class RerankResponse(BaseModel):
    """Rerank 响应"""
    results: List[RerankResult]
    model: str


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str
    embedding_model: Optional[str]
    reranker_model: Optional[str]
    gpu_available: bool
    gpu_name: Optional[str]
    gpu_memory_total: Optional[str]
    gpu_memory_used: Optional[str]
    model_load_time_seconds: Optional[float]


# ==================== Model Loading ====================

def load_models():
    """加载模型"""
    global embedding_model, reranker_model, model_load_time
    
    start_time = time.time()
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    logger.info(f"Device: {device}")
    if device == 'cuda':
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    
    try:
        # 加载 BGE-M3 Embedding 模型
        logger.info("Loading BGE-M3 embedding model...")
        from FlagEmbedding import BGEM3FlagModel
        embedding_model = BGEM3FlagModel(
            'BAAI/bge-m3',
            use_fp16=True if device == 'cuda' else False,
            device=device
        )
        logger.info("BGE-M3 loaded successfully")
        
        # 加载 BGE-Reranker 模型
        logger.info("Loading BGE-Reranker model...")
        from FlagEmbedding import FlagReranker
        reranker_model = FlagReranker(
            'BAAI/bge-reranker-v2-m3',
            use_fp16=True if device == 'cuda' else False,
            device=device
        )
        logger.info("BGE-Reranker loaded successfully")
        
        model_load_time = time.time() - start_time
        logger.info(f"All models loaded in {model_load_time:.2f} seconds")
        
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # Startup
    load_models()
    yield
    # Shutdown
    logger.info("Shutting down embedding service")


# ==================== FastAPI App ====================

app = FastAPI(
    title="TripNARA Embedding Service",
    description="BGE-M3 Embedding 和 BGE-Reranker 服务",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== API Endpoints ====================

@app.get("/health", response_model=HealthResponse)
async def health():
    """健康检查"""
    gpu_name = None
    gpu_memory_total = None
    gpu_memory_used = None
    
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        props = torch.cuda.get_device_properties(0)
        gpu_memory_total = f"{props.total_memory / 1024**3:.1f} GB"
        gpu_memory_used = f"{torch.cuda.memory_allocated(0) / 1024**3:.1f} GB"
    
    return HealthResponse(
        status="healthy" if embedding_model and reranker_model else "loading",
        embedding_model="bge-m3" if embedding_model else None,
        reranker_model="bge-reranker-v2-m3" if reranker_model else None,
        gpu_available=torch.cuda.is_available(),
        gpu_name=gpu_name,
        gpu_memory_total=gpu_memory_total,
        gpu_memory_used=gpu_memory_used,
        model_load_time_seconds=model_load_time
    )


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "TripNARA Embedding Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "embeddings": "/v1/embeddings",
            "rerank": "/v1/rerank"
        }
    }


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
async def create_embeddings(request: EmbeddingRequest):
    """
    生成文本的向量表示
    
    使用 BGE-M3 模型生成 1024 维的稠密向量
    """
    if not embedding_model:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")
    
    if not request.texts:
        raise HTTPException(status_code=400, detail="texts cannot be empty")
    
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts per request")
    
    try:
        start_time = time.time()
        
        # 生成 embeddings
        outputs = embedding_model.encode(
            request.texts,
            return_dense=True,
            return_sparse=request.return_sparse,
            return_colbert_vecs=request.return_colbert
        )
        
        embeddings = []
        for i in range(len(request.texts)):
            result = EmbeddingResult(
                dense=outputs['dense_vecs'][i].tolist()
            )
            
            if request.return_sparse and 'lexical_weights' in outputs:
                # 转换稀疏向量格式
                sparse_dict = outputs['lexical_weights'][i]
                if isinstance(sparse_dict, dict):
                    result.sparse = sparse_dict
            
            if request.return_colbert and 'colbert_vecs' in outputs:
                result.colbert = outputs['colbert_vecs'][i].tolist()
            
            embeddings.append(result)
        
        elapsed = time.time() - start_time
        logger.info(f"Generated {len(request.texts)} embeddings in {elapsed:.3f}s")
        
        return EmbeddingResponse(
            embeddings=embeddings,
            usage={"total_tokens": sum(len(t.split()) for t in request.texts)},
            model="bge-m3"
        )
        
    except Exception as e:
        logger.error(f"Embedding error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/rerank", response_model=RerankResponse)
async def rerank(request: RerankRequest):
    """
    文档重排序
    
    使用 BGE-Reranker-v2-M3 模型对文档进行相关性排序
    """
    if not reranker_model:
        raise HTTPException(status_code=503, detail="Reranker model not loaded")
    
    if not request.documents:
        raise HTTPException(status_code=400, detail="documents cannot be empty")
    
    if len(request.documents) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 documents per request")
    
    try:
        start_time = time.time()
        
        # 准备 query-document pairs
        pairs = [[request.query, doc.text] for doc in request.documents]
        
        # 计算相关性分数
        scores = reranker_model.compute_score(pairs, normalize=True)
        
        # 处理单个文档的情况
        if not isinstance(scores, list):
            scores = [scores]
        
        # 构建结果
        results = []
        for i, (doc, score) in enumerate(zip(request.documents, scores)):
            results.append(RerankResult(
                id=doc.id,
                score=float(score),
                rank=0  # 稍后排序
            ))
        
        # 按分数降序排序
        results.sort(key=lambda x: x.score, reverse=True)
        
        # 设置排名
        for i, r in enumerate(results):
            r.rank = i + 1
        
        elapsed = time.time() - start_time
        logger.info(f"Reranked {len(request.documents)} documents in {elapsed:.3f}s")
        
        return RerankResponse(
            results=results[:request.top_k],
            model="bge-reranker-v2-m3"
        )
        
    except Exception as e:
        logger.error(f"Rerank error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("EMBEDDING_SERVICE_PORT", "8001"))
    host = os.environ.get("EMBEDDING_SERVICE_HOST", "0.0.0.0")
    
    logger.info(f"Starting Embedding Service on {host}:{port}")
    
    uvicorn.run(
        "embedding_service:app",
        host=host,
        port=port,
        reload=False,
        workers=1  # 模型不支持多进程
    )
