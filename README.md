# Premise

**Find out which of your beliefs could sink your startup, and how to test them this week.**

Premise is an AI research agent for founders. Paste your pitch and it:

1. lists the 6–10 assumptions your startup depends on, ranked by **risk = impact × uncertainty**;
2. **waits for you** to edit, add, drop and select assumptions (checkpoint 1);
3. searches the public web and extracts **exact quotes** for and against each one, checking every quote against
   the page it came from;
4. **waits for you** to accept or reject each evidence card, or to ask for more research (checkpoint 2);
5. computes verdicts **from the evidence you accepted**, labels every statement as *fact*, *assumption*,
   *prediction* or *recommendation*, flags contradictions, designs cheap tests with success thresholds set in
   advance, and runs a critic pass for overclaiming;
6. **waits for your approval** of the final report, or revises it from your feedback (checkpoint 3).

It runs entirely on **free models**: Groq's free tier (open-weight models such as gpt-oss-120b) with a **local Ollama model as
fallback**, so it keeps working when a free quota runs out. Built for the *AI Agents for Founders Challenge 2026*.

→ Architecture and design decisions: [`docs/architecture.md`](docs/architecture.md)
→ Idea selection: [`docs/phase1-idea-selection.md`](docs/phase1-idea-selection.md)

## Run it on Windows (PowerShell)

Requirements: Python 3.10+, Node.js 20+, and at least one model:
- **Groq** (recommended): free API key from https://console.groq.com/keys
- **Ollama** (offline fallback): install from https://ollama.com, then `ollama pull qwen2.5:7b`

```powershell
# 1. Backend
cd backend
python -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # then open .env and paste your GROQ_API_KEY
uvicorn app.main:create_app --factory --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # open http://localhost:3000
```

Optional: set `TAVILY_API_KEY` in `backend/.env` (free tier, 1,000 searches a month) for more reliable search
than DuckDuckGo.

## Tests

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q      # offline: fake model and search, full checkpoint workflow
..\.venv\Scripts\python.exe scripts\smoke_run.py   # live: drives one real audit through the running API
```

## Project layout

```
backend/
  app/
    main.py       FastAPI routes
    pipeline.py   agent workflow, checkpoints, verdict math, time metrics
    llm.py        Groq + Ollama providers, JSON validation, fallback router
    search.py     Tavily / DuckDuckGo search, SSRF-safe page fetcher
    security.py   quote verification, untrusted-content wrapping, URL safety, input cleaning
    prompts.py    role prompts (planner, researcher, analyst, strategist, critic)
    schemas.py    Pydantic models for model output and API input
    report.py     Markdown export
    db.py         SQLite storage
  tests/          offline tests with fakes
  scripts/        live smoke test
frontend/         Next.js + TypeScript + Tailwind app
docs/             idea selection, architecture
```

## Free-model compliance

| Component | What it uses | Cost at runtime |
|---|---|---|
| Primary model | Groq free tier, open-weight model (default `openai/gpt-oss-120b`, Apache 2.0) | Free (rate-limited) |
| Fallback model | Ollama, `qwen2.5:7b` (Apache 2.0), on your machine | Free |
| Search | DuckDuckGo via `ddgs` (no key), optionally Tavily free tier | Free |
| Storage | SQLite file | Free |

No paid API is called at runtime.

## Limitations (honest)

- Search coverage is limited to what public free search returns; paywalled studies are out of reach.
- Small local models are slower (minutes per step on a laptop) and less precise than the cloud model.
- Quote verification proves a quote is *in* the page, not that the page is *right*. That judgment stays with
  you, which is why checkpoint 2 exists.
- Time saved uses your own estimate of manual time unless you time a manual attempt.
