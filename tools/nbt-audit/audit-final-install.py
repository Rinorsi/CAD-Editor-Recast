import json,hashlib,zipfile,sys
from pathlib import Path
root=Path(sys.argv[1])
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
expected_embedded='59f60bef4b949069177019f598f421d353eb03f61d9b0e53809e853586ed6934'
report={}
for folder in ['registry-final-D089-06','natural-final-D089-01','integrated-final-D089-01','registry-final-830-01','registry-final-830-02','integrated-final-830-01']:
 c=read(root/folder/'configuration.json');modjars=read(root/folder/'host/installed-jars.json')
 actual=[]
 for j in modjars:
  raw=Path(j['path']).read_bytes();assert sha(raw)==j['sha256'].lower(),j['path']
  if j['sha256'].lower()!=c['sha256'].lower():continue
  z=zipfile.ZipFile(Path(j['path']));nested=[n for n in z.namelist() if n.startswith('META-INF/jars/oriel-') and n.endswith('.jar')]
  assert len(nested)==1,nested
  embedded=sha(z.read(nested[0]));assert embedded==expected_embedded
  assert not any(n.startswith('dev/rinorsi/editor/clientonly/') for n in z.namelist()),'probe leaked into production jar'
  actual.append({'installed':j['path'],'editorSha256':sha(raw),'embedded':nested[0],'embeddedSha256':embedded})
 assert len(actual)==1
 report[folder]=actual[0]
a=zipfile.ZipFile(report['registry-final-D089-06']['installed']);b=zipfile.ZipFile(report['registry-final-830-01']['installed'])
classes=lambda z:{n:sha(z.read(n)) for n in z.namelist() if n.endswith('.class')}
assert classes(a)==classes(b),'D089/830 production class delta unexpected'
ui=lambda z:{n:sha(z.read(n)) for n in z.namelist() if n.startswith('assets/cadeditor/ui/') and n.endswith(('.js','.css','.html','.json'))}
ua,ub=ui(a),ui(b);changed=[n for n in set(ua)|set(ub) if ua.get(n)!=ub.get(n)]
assert set(changed)=={'assets/cadeditor/ui/editor.css','assets/cadeditor/ui/js/picker.js'},changed
repo=Path.cwd();sourceMismatch=[]
for n,h in ub.items():
 src=repo/'common/src/main/resources'/n
 if not src.exists() or sha(src.read_bytes())!=h:sourceMismatch.append(n)
assert not sourceMismatch,sourceMismatch
report['comparison']={'productionClassCount':len(classes(a)),'productionClassesIdentical':True,'changedUI':changed,'latestUIPackagedMatchesCurrentSource':True,'latestUIFileCount':len(ub)}
(root/'final-installed-artifact-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS actual installed D089/830 hashes; one embedded Oriel0.14 correct hash; no probe leak; classes identical; only CSS/picker delta; current final UI matches packaged files')
