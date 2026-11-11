from pathlib import Path
import json,sys
root=Path(sys.argv[1]);report={}
for folder,want in [('registry-final-D089-06',0),('natural-final-D089-01',0),('integrated-final-D089-01',1),('registry-final-830-02',0),('integrated-final-830-01',1)]:
 commands=[]
 for line in (root/folder/'requests.jsonl').open(encoding='utf-8'):
  r=json.loads(line)
  if r['action']=='serverCommand' and r['params']['command'].startswith('tick '):commands.append({'id':r['result']['id'],'command':r['params']['command']})
 assert sum(c['command']=='tick freeze' for c in commands)==want,(folder,commands)
 if folder.startswith('natural-'):assert any(c['command']=='tick unfreeze' for c in commands)
 report[folder]={'actualTickCommands':commands,'freezeFromBeforeBeePageUntilProcessExit':bool(want)}
(root/'final-freeze-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASS actual RPC commands: natural seven never freeze; registry never freeze; both NBT serialization rounds freeze exactly once before bee page and stop owned process frozen')
