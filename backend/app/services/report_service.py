"""
Report Analysis Service powered by Groq Cloud AI.
Replaces legacy keyword heuristics with authoritative Groq AI analysis grounded in PostgreSQL.
"""

from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from ..ai.report_analyzer import analyze_safety_report_with_groq
from ..schemas.report_analysis import StructuredReportAnalysis


class ReportService:
    async def analyze_report(
        self,
        text: str,
        context: Optional[Dict[str, Any]] = None,
        db: Optional[Session] = None
    ) -> StructuredReportAnalysis:
        """
        Executes Groq AI report analysis grounded in domain context from PostgreSQL.
        """
        return await analyze_safety_report_with_groq(text=text, context=context, db=db)


report_service = ReportService()
