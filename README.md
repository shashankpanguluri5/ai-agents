# AI Agents

A project for building and experimenting with AI agents.

## Getting started

Requires Python 3.10+.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # then add your API keys to .env
python main.py
```

## Project layout

```
agents/        # agent code
  base.py      # base Agent class + example EchoAgent
main.py        # entry point
.env.example   # template for secrets (copy to .env)
```
