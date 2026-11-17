# Benchmark protocol: measuring time saved

Goal: an honest, repeatable comparison of **manual** vs **Premise-assisted** assumption research. Every number
we publish is labeled **measured**, **estimated**, or **simulated**.

## Task (identical in both conditions)

For one pitch, produce:
1. a list of the startup's riskiest assumptions (at least 5);
2. for the top 4, at least 2 public sources each, with a quote, and whether it supports or contradicts;
3. one test with a success threshold per assumption.

## Scenarios

Use the three fictional demo pitches in `frontend/src/lib/demo.ts` (CrumbCount, ShiftSwap, ThesisLens), plus
any real pitches that team members or volunteer founders consent to share.

## Procedure

- **Manual condition:** a team member who has *not* seen Premise's output for that pitch does the task with a
  normal browser and a doc. Time it with a stopwatch from the first search to the final line written.
- **Assisted condition:** a *different* team member runs Premise on the same pitch. Premise records agent time
  and checkpoint review time automatically (Analytics page). Enter the manual time from the other condition as
  the run's baseline.
- Alternate who does which condition across pitches to reduce person effects.

## Quality check (blind)

A third person scores both outputs without knowing which is which:
- Relevant assumptions found (0–10)
- Sources: count, and how many actually say what is claimed (open each link)
- Tests: are success thresholds concrete and decided in advance? (0–5)

Record human corrections per Premise run (shown automatically: edits, added/removed assumptions, rejected
evidence, report revisions).

## Reporting

Record each trial in `docs/benchmark-results.md` as a row: pitch, manual minutes, assisted minutes (agent +
review), time saved % = (manual − assisted) / manual × 100, quality scores for both, corrections, model used,
and **failures** (runs that failed, sources that were wrong, assumptions it missed). Report averages *and* the
worst case. Do not drop failed runs.
