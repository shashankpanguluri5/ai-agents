"""Data shapes: what the LLM must return, what the API accepts, and what runs store."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Category = Literal["customer", "problem", "solution", "market", "business_model", "channel", "competition", "team", "other"]
Stance = Literal["supports", "contradicts", "neutral"]
Label = Literal["fact", "assumption", "prediction", "recommendation"]
Verdict = Literal["supported", "contradicted", "mixed", "unproven"]
Confidence = Literal["low", "medium", "high"]
Decision = Literal["pending", "accepted", "rejected"]


# ---------- LLM output shapes (validated before use) ----------

class LLMAssumption(BaseModel):
    statement: str = Field(min_length=5, max_length=400)
    category: Category = "other"
    kind: Literal["assumption", "prediction"] = "assumption"
    rationale: str = Field(default="", max_length=600)
    impact: int = Field(ge=1, le=5)
    uncertainty: int = Field(ge=1, le=5)
    queries: list[str] = Field(default_factory=list)

    @field_validator("category", mode="before")
    @classmethod
    def _cat(cls, v):
        v = str(v).strip().lower().replace(" ", "_").replace("-", "_")
        allowed = {"customer", "problem", "solution", "market", "business_model", "channel", "competition", "team"}
        return v if v in allowed else "other"

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, v):
        return "prediction" if str(v).strip().lower() == "prediction" else "assumption"

    @field_validator("impact", "uncertainty", mode="before")
    @classmethod
    def _clamp(cls, v):
        try:
            return max(1, min(5, int(round(float(v)))))
        except (TypeError, ValueError):
            return 3


class LLMPlan(BaseModel):
    objective: str = Field(default="", max_length=600)
    assumptions: list[LLMAssumption] = Field(min_length=1, max_length=15)


class LLMEvidence(BaseModel):
    relevant: bool
    quote: str = Field(default="", max_length=600)
    stance: Stance = "neutral"
    summary: str = Field(default="", max_length=400)

    @field_validator("stance", mode="before")
    @classmethod
    def _stance(cls, v):
        v = str(v).strip().lower()
        return v if v in {"supports", "contradicts", "neutral"} else "neutral"


class LLMStatement(BaseModel):
    text: str = Field(min_length=3, max_length=500)
    label: Label
    evidence_ids: list[str] = Field(default_factory=list)

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, v):
        v = str(v).strip().lower()
        return v if v in {"fact", "assumption", "prediction", "recommendation"} else "assumption"


class LLMAssessment(BaseModel):
    assumption_id: str
    reasoning: str = Field(default="", max_length=1200)
    statements: list[LLMStatement] = Field(default_factory=list)


class LLMContradiction(BaseModel):
    description: str = Field(min_length=5, max_length=600)
    assumption_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)


class LLMAnalysis(BaseModel):
    summary: str = Field(default="", max_length=1500)
    assessments: list[LLMAssessment] = Field(default_factory=list)
    contradictions: list[LLMContradiction] = Field(default_factory=list)


class LLMTest(BaseModel):
    assumption_id: str
    experiment: str = Field(min_length=5, max_length=600)
    metric: str = Field(default="", max_length=300)
    success_threshold: str = Field(default="", max_length=300)
    effort: Literal["low", "medium", "high"] = "medium"
    timeframe: str = Field(default="1 week", max_length=100)

    @field_validator("effort", mode="before")
    @classmethod
    def _effort(cls, v):
        v = str(v).strip().lower()
        return v if v in {"low", "medium", "high"} else "medium"


class LLMTestPlan(BaseModel):
    tests: list[LLMTest] = Field(default_factory=list)
    interview_questions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class LLMCritique(BaseModel):
    issues: list[str] = Field(default_factory=list)


class LLMChallengeAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=2000)
    label: Label = "assumption"
    evidence_ids: list[str] = Field(default_factory=list)
    suggested_query: str = Field(default="", max_length=200)


# ---------- API request bodies ----------

class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    pitch: str = Field(min_length=50, max_length=8000)
    target_customer: str = Field(default="", max_length=500)
    stage: str = Field(default="idea", max_length=60)
    industry: str = Field(default="", max_length=120)


class RunCreate(BaseModel):
    manual_baseline_minutes: Optional[float] = Field(default=None, gt=0, le=6000)


class AssumptionEdit(BaseModel):
    id: Optional[str] = None  # None = new assumption written by the founder
    statement: str = Field(min_length=5, max_length=400)
    category: Category = "other"
    kind: Literal["assumption", "prediction"] = "assumption"
    impact: int = Field(ge=1, le=5)
    uncertainty: int = Field(ge=1, le=5)
    queries: list[str] = Field(default_factory=list, max_length=4)
    selected: bool = True


class PlanDecision(BaseModel):
    approve: bool
    assumptions: list[AssumptionEdit] = Field(default_factory=list, max_length=20)
    note: str = Field(default="", max_length=1000)


class EvidenceDecisionItem(BaseModel):
    evidence_id: str
    decision: Literal["accepted", "rejected"]
    note: str = Field(default="", max_length=500)


class MoreResearch(BaseModel):
    assumption_id: str
    query: str = Field(min_length=3, max_length=200)


class EvidenceDecision(BaseModel):
    decisions: list[EvidenceDecisionItem] = Field(default_factory=list)
    more_research: list[MoreResearch] = Field(default_factory=list, max_length=5)


class FinalDecision(BaseModel):
    approve: bool
    feedback: str = Field(default="", max_length=2000)


class ChallengeRequest(BaseModel):
    assumption_id: str
    question: str = Field(min_length=5, max_length=1000)


class BaselineUpdate(BaseModel):
    manual_baseline_minutes: float = Field(gt=0, le=6000)
