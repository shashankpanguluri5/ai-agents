"""Drive one full audit through the running API, acting as the founder at each checkpoint.

Usage (backend running on :8000):  python scripts/smoke_run.py
Accepts verified evidence, rejects unverified, approves the report. Prints timings and a summary.
"""

import sys
import time

import httpx

API = "http://localhost:8000"
PITCH = {
    "name": "CrumbCount (demo)",
    "industry": "Food & beverage",
    "stage": "idea",
    "target_customer": "Independent bakeries with 1-10 staff in France",
    "pitch": "CrumbCount is a mobile app that tracks flour, butter and sugar stock for small independent bakeries by "
             "reading supplier invoices automatically. Owners stop counting stock by hand every evening and get a reorder "
             "list each morning. We will charge 25 EUR per month and sell through regional bakery associations.",
}


SEEN = {"n": 0}


def wait(c, rid, until, timeout=3600):
    start = time.time()
    while time.time() - start < timeout:
        run = c.get(f"/api/runs/{rid}").json()
        for e in run["events"][SEEN["n"]:]:
            print(f"   [{e['kind']}] {e['message']}")
        SEEN["n"] = len(run["events"])
        if run["status"] in until or run["status"] in ("failed", "rejected"):
            return run
        time.sleep(3)
    sys.exit("timed out")


def main():
    with httpx.Client(base_url=API, timeout=60) as c:
        print("health:", c.get("/api/health").json())
        p = c.post("/api/projects", json=PITCH).json()
        rid = c.post(f"/api/projects/{p['id']}/runs", json={"manual_baseline_minutes": 180}).json()["id"]
        t0 = time.time()
        run = wait(c, rid, {"awaiting_plan_approval"})
        if run["status"] != "awaiting_plan_approval":
            sys.exit(f"failed: {run['error']}")
        print(f"\nPLAN ({time.time()-t0:.0f}s):")
        for a in run["state"]["assumptions"]:
            print(f"  {'x' if a['selected'] else ' '} risk {a['risk']:>2}  {a['statement']}")
        c.post(f"/api/runs/{rid}/plan-decision", json={"approve": True})

        run = wait(c, rid, {"awaiting_evidence_review"})
        if run["status"] != "awaiting_evidence_review":
            sys.exit(f"failed: {run['error']}")
        print(f"\nEVIDENCE ({time.time()-t0:.0f}s):")
        for e in run["state"]["evidence"]:
            print(f"  {e['stance']:<11} verified={e['verified']!s:<5} {e['domain']}: {e['quote'][:110]}")
        decisions = [{"evidence_id": e["id"], "decision": "accepted" if e["verified"] else "rejected"} for e in run["state"]["evidence"]]
        c.post(f"/api/runs/{rid}/evidence-decision", json={"decisions": decisions})

        run = wait(c, rid, {"awaiting_final_approval"})
        if run["status"] != "awaiting_final_approval":
            sys.exit(f"failed: {run['error']}")
        a = run["state"]["analysis"]
        print(f"\nREPORT ({time.time()-t0:.0f}s):\n  {a['summary']}")
        for x in a["assessments"]:
            print(f"  - {x['verdict']} ({x['confidence']}) {x['counts']}")
            for s in x["statements"]:
                print(f"      [{s['label']}] {s['text']}")
        print("  critic:", run["state"]["critic_issues"])
        print("  tests:", len(run["state"]["test_plan"]["tests"]), "interview qs:", len(run["state"]["test_plan"]["interview_questions"]))
        c.post(f"/api/runs/{rid}/final-decision", json={"approve": True})
        print("\nMETRICS:", c.get(f"/api/runs/{rid}").json()["metrics"])
        print("run id:", rid)


if __name__ == "__main__":
    main()
