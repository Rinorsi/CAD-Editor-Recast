"""Instrument disposable copies only; run from repository root."""
from pathlib import Path
from datetime import date
import shutil, hashlib, json
root = Path.cwd()
out = root / f'daily/{date.today().isoformat()}/registry-timeline'
reg = out / 'src/dev/rinorsi/editor/registry'
reg.mkdir(parents=True, exist_ok=True)
for p in (root/'fabric/src/main/java/dev/rinorsi/editor/registry').glob('*.java'):
    shutil.copy2(p, reg/p.name)
p = reg/'RegistryWarmup.java'; s = p.read_text(encoding='utf-8')
s = s.replace('private int ticks;', 'private int ticks; private long sourceCpu, sourceWall; private int sourceRows;')
s = s.replace('try { hasNext = rows.hasNext(); }', 'long hasNextStart=System.nanoTime(); try { hasNext = rows.hasNext(); }')
s = s.replace('if (hasNext) {', 'sourceCpu += System.nanoTime()-hasNextStart; if (hasNext) {')
s = s.replace('source = sources.next();', 'source = sources.next(); sourceCpu=0; sourceRows=0; sourceWall=System.nanoTime();')
s = s.replace('maxSourceNs = Math.max(maxSourceNs, System.nanoTime() - sourceStart);', 'sourceCpu += System.nanoTime()-sourceStart; maxSourceNs = Math.max(maxSourceNs, System.nanoTime() - sourceStart);')
s = s.replace('maxRowNs = Math.max(maxRowNs, System.nanoTime() - rowStart);', 'sourceCpu += System.nanoTime()-rowStart; sourceRows++; maxRowNs = Math.max(maxRowNs, System.nanoTime() - rowStart);')
s = s.replace('List<JsonObject> detached = captured;', 'TimelineTrace.source(source.getKey(),generation,sourceRows,sourceCpu,System.nanoTime()-sourceWall); List<JsonObject> detached = captured;')
p.write_text(s,encoding='utf-8')
p=reg/'RegistryBridge.java'; s=p.read_text(encoding='utf-8')
s=s.replace('long registryTickStart = System.nanoTime();', 'TimelineTrace.tick++; long registryTickStart = System.nanoTime();')
s=s.replace('warmup = new RegistryWarmup(', 'TimelineTrace.event("warmup_start", ""); warmup = new RegistryWarmup(')
s=s.replace('State state = DOCUMENTS.get(driver); state.generation = generation;', 'TimelineTrace.event("publish", ""); State state = DOCUMENTS.get(driver); state.generation = generation;')
s=s.replace('d.patchJson(batch.getValue().key, batch.getValue().pages.next());', 'String tracePage=batch.getValue().pages.next(); TimelineTrace.push(batch.getValue().key,tracePage); d.patchJson(batch.getValue().key, tracePage);')
s=s.replace('String raw = request.get("name").getAsString();', 'String raw = request.get("name").getAsString(); TimelineTrace.event("request",request.toString());')
s=s.replace('state.waiting.removeFirst().run();', 'TimelineTrace.event("dequeue",""); state.waiting.removeFirst().run();')
p.write_text(s,encoding='utf-8')
shutil.copy2(root/'tools/registry/timeline/TimelineTrace.java',reg/'TimelineTrace.java')
ui=out/'assets/cadeditor/ui'; ui.parent.mkdir(parents=True,exist_ok=True)
assert ui.resolve().is_relative_to(out.resolve())
if ui.exists(): shutil.rmtree(ui)
shutil.copytree(root/'fabric/src/main/resources/assets/cadeditor/ui',ui,dirs_exist_ok=True)
hashes={}
for p in ui.rglob('*'):
    if p.is_file(): hashes[str(p.relative_to(ui))]=hashlib.sha256(p.read_bytes()).hexdigest()
    if p.suffix=='.js': p.write_text(p.read_text(encoding='utf-8').replace('oriel.send(', 'timelineSend('),encoding='utf-8')
shutil.copy2(root/'tools/registry/timeline/page-probe.js',ui/'page-probe.js')
p=ui/'index.html'; s=p.read_text(encoding='utf-8'); s=s.replace('<script src="js/data.js">','<script>function timelineSend(c,v){if(c==="registry"&&typeof TL!=="undefined")TL.requests.push({t:Date.now(),phase:TL.phase,value:v});return oriel.send(c,v);}</script><script src="js/data.js">'); s=s.replace('<script src="js/app.js">','<script src="page-probe.js"></script><script src="js/app.js">');p.write_text(s,encoding='utf-8')
(out/'source-hashes.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
s=(root/'tools/registry/supplement-run.ps1').read_text(encoding='utf-8')
s=s.replace("'/registry-supplement'", "'/registry-timeline'")
s=s.replace("($Root+'/fabric/src/main/java/dev/rinorsi/editor/registry/*.java')", "($Out+'/src/dev/rinorsi/editor/registry/*.java')")
s=s.replace("($Root+'/fabric/src/autotest/java/dev/rinorsi/editor/registry/RegistrySupplementProbe.java')", "($Root+'/tools/registry/timeline/TimelineProbe.java')")
s=s.replace('dev.rinorsi.editor.registry.RegistrySupplementProbe','dev.rinorsi.editor.registry.TimelineProbe')
s=s.replace("uf $EditorJar -C $Classes .", "uf $EditorJar -C $Classes . -C $Out assets")
s=s.replace('registry-supplement-verification.json','registry-timeline.json')
(root/'tools/registry/timeline-run.ps1').write_text(s,encoding='utf-8')
