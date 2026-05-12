import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "rag"))

from reasoning.engine import ReasoningEngine
from generation.trace import ReasoningTrace
from reasoning.classifier import QueryClassifier

class RAGService:
    def __init__(self):
        self.classifier = QueryClassifier()
        self.engine     = ReasoningEngine()

    def query(self, question: str) -> dict:
        start = time.time()
        trace = ReasoningTrace(question)
        trace.classification = self.classifier.classify(question)
        self.engine.execute(trace)

        sources = []
        for c in (trace.reranked_final or [])[:3]:
            text = (
                c.get("chunk_text") or
                c.get("metadata", {}).get("chunk_text", "")
            )
            sources.append(text[:150])

        return {
            "answer":         trace.final_answer,
            "reasoning_type": trace.classification.get("reasoning_type", "commonsense"),
            "sub_questions":  trace.classification.get("sub_questions", []),
            "sources":        sources,
            "latency_ms":     round((time.time() - start) * 1000)
        }
