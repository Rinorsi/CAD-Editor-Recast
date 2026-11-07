"""Evidence gate: partial/rejected/typed-loss rounds must never become a pass."""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="cad-accept-report-") as d:
    tmp=Path(d);ui=Path("fabric/src/main/resources/assets/cadeditor/ui/js/data.js")
    (tmp/ui).parent.mkdir(parents=True);shutil.copyfile(root/ui,tmp/ui)
    rounds=[]
    for i in range(3):
        rounds.append({"component":"minecraft:custom_data","round":i+1,"attempted":True,"applied_ok":True,"reopen_equal":True,"typed_fidelity":i!=2,"validate_ok":True})
    rounds.append({"component":"test:extra","round":1,"attempted":True,"rejected":True,"failure":"HOST_REJECTED"})
    receipt=tmp/"receipt.json";receipt.write_text(json.dumps({"status":"COMPLETE","attempts":rounds}),encoding="utf-8")
    subprocess.run([sys.executable,str(root/"tools/accept/report.py"),"--root",str(tmp),"--receipt",str(receipt)],check=True,capture_output=True)
    r=json.loads((tmp/"docs/acceptance/components.json").read_text(encoding="utf-8"))
    by={x["component"]:x for x in r["components"]}
    assert len(by)==108 and r["summary"]["components_attempted"]==2
    assert by["minecraft:custom_data"]["applied_ok"] and not by["minecraft:custom_data"]["typed_fidelity"]
    assert by["minecraft:custom_data"]["success"]==2 and by["test:extra"]["rejected"]==1
    assert not by["minecraft:custom_name"]["applied_ok"] and r["summary"]["typed_exact"]==0
    checklist=(tmp/"docs/acceptance/CHECKLIST-for-user.md").read_text(encoding="utf-8")
    assert sum(line.startswith("|") for line in checklist.splitlines())==27
    assert "未验证" in (tmp/"docs/acceptance/perf.md").read_text(encoding="utf-8")
    extra=tmp/"extra.json";extra.write_text(json.dumps({"status":"COMPLETE","attempts":[{"component":"minecraft:custom_data","round":1,"applied_ok":True,"typed_fidelity":True,"reopen_equal":True}]}),encoding="utf-8")
    subprocess.run([sys.executable,str(root/"tools/accept/report.py"),"--root",str(tmp),"--receipt",str(receipt),"--additional-receipt",str(extra)],check=True,capture_output=True)
    merged=json.loads((tmp/"docs/acceptance/components.json").read_text(encoding="utf-8"))
    target=next(x for x in merged["components"] if x["component"]=="minecraft:custom_data")
    assert not target["applied_ok"] and len(target["rounds"])==1
    assert merged["additional_evidence"]["receipt"]==str(extra)
print("PASS evidence aggregation: extra registry IDs, missing rounds, typed loss, rejection, and 25-item checklist")
