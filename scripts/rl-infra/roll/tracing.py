"""
ROLL 分布式追踪模块（Python）

基于 W3C Trace Context 标准实现跨语言追踪
"""
import logging
import uuid
import time
from typing import Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class SpanContext:
    """Span 上下文"""
    
    def __init__(
        self,
        trace_id: str,
        span_id: str,
        parent_span_id: Optional[str] = None,
        trace_flags: int = 1,
    ):
        self.trace_id = trace_id
        self.span_id = span_id
        self.parent_span_id = parent_span_id
        self.trace_flags = trace_flags
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.attributes: Dict[str, Any] = {}
        self.events: list = []
        self.status: str = 'started'
        self.error: Optional[Dict[str, str]] = None

    def set_attribute(self, key: str, value: Any):
        """设置属性"""
        self.attributes[key] = value

    def add_event(self, name: str, attributes: Optional[Dict[str, Any]] = None):
        """添加事件"""
        self.events.append({
            'name': name,
            'time': time.time(),
            'attributes': attributes or {},
        })

    def end(self, status: str = 'ok', error: Optional[Dict[str, str]] = None):
        """结束 Span"""
        self.end_time = time.time()
        self.status = status
        self.error = error

    def duration(self) -> float:
        """获取持续时间（秒）"""
        if self.end_time:
            return self.end_time - self.start_time
        return time.time() - self.start_time


class RollTracing:
    """ROLL 追踪服务"""
    
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.active_spans: Dict[str, SpanContext] = {}
        self.completed_spans: list = []

    def generate_trace_id(self) -> str:
        """生成 Trace ID（32 字符十六进制）"""
        return uuid.uuid4().hex[:32]

    def generate_span_id(self) -> str:
        """生成 Span ID（16 字符十六进制）"""
        return uuid.uuid4().hex[:16]

    def start_span(
        self,
        name: str,
        parent_context: Optional[SpanContext] = None,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> SpanContext:
        """开始新的 Span"""
        if not self.enabled:
            return SpanContext('', '')

        trace_id = parent_context.trace_id if parent_context else self.generate_trace_id()
        span_id = self.generate_span_id()
        parent_span_id = parent_context.span_id if parent_context else None

        context = SpanContext(
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
        )

        if attributes:
            for key, value in attributes.items():
                context.set_attribute(key, value)

        context.set_attribute('span.name', name)
        context.set_attribute('service.name', 'roll-bridge')

        self.active_spans[span_id] = context

        logger.debug(
            f"[RollTracing] 开始 Span: {name} (traceId={trace_id}, spanId={span_id})"
        )

        return context

    def end_span(
        self,
        span_id: str,
        status: str = 'ok',
        error: Optional[Dict[str, str]] = None,
        attributes: Optional[Dict[str, Any]] = None,
    ):
        """结束 Span"""
        if not self.enabled:
            return

        context = self.active_spans.get(span_id)
        if not context:
            return

        if attributes:
            for key, value in attributes.items():
                context.set_attribute(key, value)

        context.end(status, error)
        self.completed_spans.append(context)
        del self.active_spans[span_id]

        logger.debug(
            f"[RollTracing] 结束 Span: {span_id} (status={status}, duration={context.duration():.3f}s)"
        )

    def from_w3c_trace_context(self, traceparent: str) -> Optional[SpanContext]:
        """从 W3C Trace Context 解析 Span 上下文"""
        try:
            # 格式: version-trace_id-parent_id-trace_flags
            parts = traceparent.split('-')
            if len(parts) != 4:
                return None

            _, trace_id, parent_id, flags = parts
            trace_flags = int(flags, 16)

            return SpanContext(
                trace_id=trace_id,
                span_id=self.generate_span_id(),  # 新的 Span ID
                parent_span_id=parent_id if parent_id != '0' * 16 else None,
                trace_flags=trace_flags,
            )
        except Exception as e:
            logger.warning(f"[RollTracing] 解析 W3C Trace Context 失败: {e}")
            return None

    def to_w3c_trace_context(self, context: SpanContext) -> str:
        """将 Span 上下文转换为 W3C Trace Context 格式"""
        version = '00'
        trace_id = context.trace_id.ljust(32, '0')
        parent_id = (context.parent_span_id or '0' * 16).ljust(16, '0')
        flags = hex(context.trace_flags)[2:].zfill(2)

        return f"{version}-{trace_id}-{parent_id}-{flags}"

    def get_trace_summary(self, trace_id: str) -> Dict[str, Any]:
        """获取 Trace 摘要"""
        spans = [s for s in self.completed_spans if s.trace_id == trace_id]
        
        if not spans:
            return {
                'trace_id': trace_id,
                'spans': [],
                'total_duration': 0,
            }

        total_duration = max(s.end_time or 0 for s in spans) - min(s.start_time for s in spans)

        return {
            'trace_id': trace_id,
            'spans': [
                {
                    'span_id': s.span_id,
                    'name': s.attributes.get('span.name', 'unknown'),
                    'duration': s.duration(),
                    'status': s.status,
                    'attributes': s.attributes,
                }
                for s in spans
            ],
            'total_duration': total_duration,
            'span_count': len(spans),
        }


# 全局追踪实例
tracing = RollTracing(enabled=True)
