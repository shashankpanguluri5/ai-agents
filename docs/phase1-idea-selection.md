# Phase 1 — Idea Generation & Selection

_Status: draft for team approval · 2026-11-16_

## How to read this

- **Scores are our team's judgment, not measured data.** Each criterion is rated 0–10 and weighted:
  Innovation 20 · Usefulness 20 · Time savings 20 · Feasibility 15 · Differentiation 10 · Human oversight 10 · Presentation 5.
  Score = Σ(weight × rating / 10), out of 100.
- **Time-saving figures are estimates to be tested** in Phase 9 benchmarks, not results.
- Research so far (sources at the bottom) is thin and largely vendor-written. The main things it shows: AI "idea validators" are a crowded category, and independent data on founder time use is scarce.

## Constraints that shaped the ideas

- Runtime models must be free: open-weight or free tier. Free-tier quotas (Groq, Gemini) are model-dependent and have changed several times in 2025–26, so the app needs a **local open-weight fallback (Ollama)**.
- At least one human checkpoint that blocks the agent until the founder decides.
- Judges reward **critical thinking**, not automation for its own sake.

## The 10 ideas

| # | Name | Problem → Solution | Existing competitors | Est. time saved* | Complexity | Score |
|---|------|--------------------|----------------------|------------------|-----------|------:|
| 1 | **Premise** — assumption auditor | Founders build on untested beliefs. The agent turns a pitch into a ranked list of riskiest assumptions, gathers web evidence for and against each with citations, labels fact / assumption / prediction, flags contradictions, and drafts a test plan plus interview script for the assumptions the founder approves. | Idea validators (IdeaProof, Preuve, ValidMyIdea) score ideas but don't produce an assumption-by-assumption evidence ledger with tests | 3–5 h → ~30 min | Medium | **86** |
| 2 | Interview Synthesizer | Raw customer interview notes → pain clusters, quotes, and evidence per hypothesis; founder validates clusters | Dovetail, Koji, Great Question | 2–3 h per batch → ~20 min | Medium | 79.5 |
| 3 | Grant & Accelerator Matcher | Finds non-dilutive grants and programs that fit, drafts answers; founder approves | Fragmented, mostly country-specific databases | 4–6 h → ~1 h | Medium-high (data varies by country) | 72.5 |
| 4 | Sourced Market Sizer | Bottom-up TAM/SAM/SOM with a cited source for every input; founder approves each assumption | Spreadsheet templates, generic LLM answers | 3 h → ~40 min | Medium | 72.5 |
| 5 | Investor Q&A Sparring | Reads the deck, generates the hardest likely investor questions from its gaps, critiques founder answers | Pitch-deck graders | 2 h → ~45 min | Low-medium | 70.5 |
| 6 | Competitor Watch | Weekly diff of competitor pricing, changelogs and job posts; founder picks what to act on | Crayon, Klue, Visualping | 2 h/week → 20 min | Medium-high (scraping fragility) | 67.5 |
| 7 | Pricing Experiment Designer | Proposes pricing tests and willingness-to-pay surveys from the business model | Consultants, generic templates | 2 h → 40 min | Low | 66 |
| 8 | Investor Update Drafter | Metrics and notes → monthly investor update; founder edits | Visible, Notion templates | 1.5 h → 20 min | Low | 66 |
| 9 | Meeting → Decisions Log | Notes → decisions, owners, follow-up drafts | Otter, Fireflies, Granola (saturated) | 30 min/meeting → 5 min | Low | 63 |
| 10 | ICP Lead List Builder | Ideal customer profile → qualified lead list + outreach drafts | Clay, Apollo (saturated; personal-data concerns) | 4 h → 1 h | High (data access) | 61.5 |

\*Estimates, to be benchmarked.

### Score breakdown (ratings 0–10)

| # | Innov. | Useful | Time | Feas. | Diff. | Human | Pres. | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 Premise | 9 | 9 | 8 | 7 | 9 | 10 | 9 | 86 |
| 2 Interview Synth. | 7 | 9 | 9 | 8 | 6 | 8 | 7 | 79.5 |
| 3 Grant Matcher | 7 | 8 | 8 | 6 | 7 | 7 | 7 | 72.5 |
| 4 Market Sizer | 7 | 7 | 7 | 7 | 7 | 9 | 8 | 72.5 |
| 5 Investor Sparring | 7 | 7 | 6 | 8 | 6 | 8 | 9 | 70.5 |
| 6 Competitor Watch | 6 | 8 | 8 | 6 | 5 | 6 | 7 | 67.5 |
| 7 Pricing Designer | 7 | 6 | 5 | 8 | 7 | 8 | 6 | 66 |
| 8 Investor Update | 5 | 7 | 7 | 8 | 5 | 8 | 6 | 66 |
| 9 Meeting Log | 4 | 8 | 7 | 8 | 3 | 7 | 6 | 63 |
| 10 Lead Builder | 4 | 8 | 9 | 5 | 3 | 6 | 6 | 61.5 |

## Recommendation: #1 Premise

**Tagline (draft):** _Know which of your beliefs could kill your startup — and how to test them this week._

**Why it beats the alternatives**

1. **It matches the challenge's thesis exactly.** The brief says AI should "free founders to think better." Premise doesn't decide anything; it shows the founder what they're assuming and what the evidence says. The human checkpoint (choosing which assumptions to test, and accepting or rejecting each piece of evidence) is the core of the product, not a bolt-on.
2. **It is differentiated in a crowded category.** Idea validators give a single score. Premise gives an auditable ledger: every claim is labeled verified fact, assumption, prediction or recommendation, with sources and confidence, plus contradiction detection.
3. **It is feasible on free models.** The work is decomposition, search, extraction and comparison, which small open-weight models handle reasonably well when the steps are kept narrow.
4. **It demos well.** Paste a pitch → watch the plan → approve → evidence board with red/green cards → export the test plan.
5. **It can absorb #2 and #4 later.** Uploading interview notes to update the evidence, and sourced market-size inputs, are natural v2 features.

**Risks and weaknesses**

- **Web search on free tools.** We need a free search source (e.g., the unofficial DuckDuckGo library, or a free-tier search API). Availability and limits must be verified in Phase 3.
- **Hallucinated evidence.** Mitigation: only cite text actually fetched, quote the snippet, and require the founder to accept each evidence card.
- **Time savings are hard to prove.** We'll run timed manual-vs-agent trials on several real-looking startup pitches and report failures too.

## Proposed stack (to verify in Phase 3)

- **Models:** Groq free tier (open-weight Llama/Qwen) as primary, **Ollama local** (e.g., a ~7B Qwen model, which fits in 15 GB RAM) as the fallback. Gemini free tier is optional.
- **Backend:** Python + FastAPI, LangGraph for the multi-step agent and the blocking human-approval step (`interrupt`), SQLite.
- **Frontend:** Next.js + TypeScript + Tailwind + shadcn/ui.
- **Note:** the Claude API code currently in the repo is paid, so it **must be removed from the runtime** before submission.

## Open questions for the team

- Approve Premise, or pick another idea?
- Confirm eligibility: college students, team of 2–4, members above legal age. The official rules page wasn't found by search, so read it on the challenge site.

## Sources

- Free-tier limits (third-party, conflicting; verify in consoles): [developersdigest — Groq](https://www.developersdigest.tech/rate-limits/groq), [benchlm — Groq](https://benchlm.ai/free-tier/groq), [agentdeals — Gemini changes](https://agentdeals.dev/gemini-api-pricing-changes), [Google AI forum — Gemini free tier](https://discuss.ai.google.dev/t/gemini-api-rate-limits-free-tier/125968)
- Discovery practice and time cost: [Nielsen Norman Group — discovery survey](https://www.nngroup.com/articles/discoveries-in-industry-revealed/), [Screeb — time on discovery](https://screeb.app/the-ideal-time-to-spend-on-product-discovery-in-2023), [Koji — founder interviews](https://www.koji.so/blog/how-founders-validate-product-ideas-with-customer-interviews) (vendor)
- Crowded validator market (vendor sources): [Preuve — validation tools tested](https://preuve.ai/blog/best-startup-validation-tools-2026), [IdeaProof comparison](https://ideaproof.io/versus/ai-business-validator-comparison), [ValidMyIdea](https://peerlist.io/rainbow86/project/validmyidea)
