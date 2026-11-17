"""Fakes so the whole agent workflow can be tested offline, with no model or network."""

import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings  # noqa: E402
from app.db import Database  # noqa: E402
from app.main import create_app  # noqa: E402
from app.pipeline import Pipeline  # noqa: E402
from app.schemas import (  # noqa: E402
    LLMAnalysis, LLMChallengeAnswer, LLMCritique, LLMEvidence, LLMPlan, LLMTestPlan,
)
from app.search import SearchResult  # noqa: E402

PAGE_SUPPORT = (
    "Industry survey 2025. Small bakeries spend about six hours a week on manual inventory counts, "
    "according to owners we interviewed. Many still use paper notebooks."
)
PAGE_AGAINST = (
    "Point-of-sale vendors now bundle inventory tracking for free, and most bakery owners say it is good enough "
    "for their needs."
)


class FakeLLM:
    def __init__(self):
        self.last_provider = "fake:test-model"
        self.calls = []

    def status(self):
        return [{"name": "fake", "model": "test-model", "available": True}]

    def json(self, system, user, model_cls):
        self.calls.append(model_cls.__name__)
        asm_ids = list(dict.fromkeys(re.findall(r"\[(asm_[0-9a-f]+)\]", user)))
        ev_ids = list(dict.fromkeys(re.findall(r"\[(ev_[0-9a-f]+)\]", user)))
        if model_cls is LLMPlan:
            return LLMPlan.model_validate({
                "objective": "Find what must be true for a bakery inventory app to work",
                "assumptions": [
                    {"statement": "Small bakery owners spend over 4 hours a week on inventory", "category": "problem",
                     "kind": "assumption", "rationale": "No pain, no product", "impact": 5, "uncertainty": 4,
                     "queries": ["bakery inventory time per week"]},
                    {"statement": "Bakeries will pay 30 euros per month for inventory software", "category": "business model",
                     "kind": "prediction", "rationale": "Revenue model", "impact": 5, "uncertainty": 5,
                     "queries": ["bakery software willingness to pay"]},
                    {"statement": "Owners can be reached through local bakery associations", "category": "channel",
                     "impact": 3, "uncertainty": 2, "queries": ["bakery association members"]},
                ],
            })
        if model_cls is LLMEvidence:
            if "six hours a week" in user:
                return LLMEvidence(relevant=True, quote="Small bakeries spend about six hours a week on manual inventory counts",
                                   stance="supports", summary="Owner interviews report six hours a week.")
            if "bundle inventory" in user:
                # Invented quote that is NOT in the page: must be flagged unverified
                return LLMEvidence(relevant=True, quote="Ninety percent of bakeries refuse to pay for any software at all",
                                   stance="contradicts", summary="Claims bakeries won't pay.")
            return LLMEvidence(relevant=False)
        if model_cls is LLMAnalysis:
            return LLMAnalysis.model_validate({
                "summary": "The time cost looks real; willingness to pay is unproven.",
                "assessments": [
                    {"assumption_id": a, "reasoning": "Based on accepted evidence.",
                     "statements": [
                         {"text": "Owners report about six hours a week on inventory.", "label": "fact", "evidence_ids": ev_ids[:1]},
                         {"text": "Everyone hates inventory.", "label": "fact", "evidence_ids": []},
                         {"text": "Run a pricing test.", "label": "recommendation"},
                     ]}
                    for a in asm_ids
                ],
                "contradictions": [{"description": "Free POS tools may cover the need.", "assumption_ids": asm_ids[:1], "evidence_ids": ev_ids}],
            })
        if model_cls is LLMTestPlan:
            return LLMTestPlan.model_validate({
                "tests": [{"assumption_id": a, "experiment": "Landing page with a pricing option", "metric": "sign-ups",
                           "success_threshold": ">= 5% of visitors", "effort": "low", "timeframe": "1 week"} for a in asm_ids],
                "interview_questions": ["Tell me about the last time you counted stock."],
                "limitations": ["Only public web sources were used."],
            })
        if model_cls is LLMCritique:
            return LLMCritique(issues=["Willingness to pay rests on no evidence."])
        if model_cls is LLMChallengeAnswer:
            return LLMChallengeAnswer(answer="The evidence does not cover rural bakeries.", label="fact", evidence_ids=[],
                                      suggested_query="rural bakery inventory")
        raise AssertionError(f"unexpected model {model_cls}")


class FakeSearch:
    names = ["fake-search"]

    def search(self, query, max_results=5):
        return [
            SearchResult("Bakery survey", f"https://survey.example.org/{abs(hash(query)) % 1000}", "snippet"),
            SearchResult("POS vendor blog", f"https://pos.example.com/{abs(hash(query)) % 1000}", "snippet"),
        ]


class FakeFetcher:
    def fetch(self, url):
        return PAGE_SUPPORT if "survey" in url else PAGE_AGAINST


@pytest.fixture
def fake_llm():
    return FakeLLM()


@pytest.fixture
def client(fake_llm):
    db = Database(":memory:")
    pipeline = Pipeline(db, lambda on_event: fake_llm, FakeSearch(), FakeFetcher(), max_assumptions=2, sources_per_assumption=2)
    app = create_app(settings=Settings(), db=db, pipeline=pipeline, run_inline=True)
    return TestClient(app)


PITCH = {
    "name": "CrumbCount",
    "pitch": "CrumbCount is a mobile app that helps small independent bakeries track flour, butter and sugar "
             "stock automatically, so owners stop counting by hand every evening.",
    "target_customer": "Independent bakeries with 1-10 staff",
    "stage": "idea",
    "industry": "Food & beverage",
}
