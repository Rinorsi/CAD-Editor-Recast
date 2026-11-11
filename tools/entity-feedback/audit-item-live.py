import hashlib,json,sys,zipfile
from pathlib import Path
e=Path(sys.argv[1]); load=lambda n:json.loads((e/n).read_text(encoding='utf-8-sig'))
hash_expected='5c8463ec583c1863277ae2a7c208341b2202fb3e1f0f8ac18e87ca49beeb951f'
embedded_expected='1d4f66a91fd96b17953779d899879228d147a8aa0337a1272a1211164d85d546'
jar=e/'host/mods/cadeditor-fabric-26.2-0.99.5.jar'
actual=hashlib.sha256(jar.read_bytes()).hexdigest();assert actual==hash_expected
with zipfile.ZipFile(jar) as z:
 names=[n for n in z.namelist() if n.startswith('META-INF/jars/oriel-') and n.endswith('.jar')];assert len(names)==1
 nested=hashlib.sha256(z.read(names[0])).hexdigest();assert nested==embedded_expected
mods=load('host/mods.json');assert len([m for m in mods if m['id']=='oriel' and m['version']=='0.15.0' and m['origin']=='NESTED'])==1
assert not list((e/'host/mods').glob('oriel-*.jar'))
args=(e/'host/java.args').read_text();assert 'dev-sources' not in args and 'oriel.sourceRoot' not in args
assert not (e/'host/config/oriel/dev-sources.properties').exists()
rows=[json.loads(l) for l in (e/'requests.jsonl').read_text().splitlines()]
for r in rows:
 if 'visible' in r['result']:assert r['result']['visible']==0 and r['result']['focused']==0
 else:assert 'error' in r['result']
first=load('first-results.json');second=load('second-results.json')
passed={r['name']:r['evidence'] for r in first['results'] if r['status']=='PASS'}
for name,count in [('post-send-A',1),('post-send-C',3)]:
 r=passed[name];assert r['sent']['receipt']['requestId']==r['sent']['requestId'] and r['sent']['receipt']['status']=='saved'
 assert r['authority']['snbt']=='{count:2,id:"minecraft:stone"}'
 assert r['confirmed']['count']==count and json.loads(r['confirmed']['base'])['count']==2 and r['confirmed']['dirty']
 assert r['restored']['page']['count']==count and r['restored']['page']['dirty'] and r['restored']['host']['snbt']==r['authority']['snbt']
 assert not [s for s in r['restored']['page']['audit']['sent'] if s['channel']=='apply']
 assert r['disk']['count']==count and json.loads(r['disk']['base'])['count']==2
unknown=load('first-unknown-before-close.json');key=unknown['page']['key'];old=load('first-unknown-disk-before-reopen.json')['drafts'][key]
assert unknown['sent']['receipt']['status']=='saved' and unknown['page']['unknown'] and unknown['page']['count']==3
assert json.loads(old)['pending'] and json.loads(old)['count']==3 and json.loads(json.loads(old)['base'])['count']==1
after=load('first-unknown-after-reopen.json');assert not after['page']['dirty'] and after['page']['count']==2
assert key not in load('host/config/cadeditor-ui.json').get('drafts',{}),'clear ultimately flushed on next close; immediate disk snapshot can precede host flush'
unknown_apply=[x for x in unknown['page']['audit']['sent'] if x['channel']=='apply'];assert len(unknown_apply)==1
with zipfile.ZipFile(jar) as z:assert 'if (!this.matchesBase(d, dr)) { this.clear(key); return; }' in z.read('assets/cadeditor/ui/js/drafts.js').decode()
critical=load('first-large-critical-before-close.json');record=load('restart-expected.json')
assert critical['transfer']['held'][0]['status']=='accepted' and critical['transfer']['busy']['op']=='begin'
assert not [x for x in critical['page']['audit']['sent'] if x['channel']=='drafts' and x['payload'].get('op')=='chunk']
assert len(record['value'])>8192
assert load('second-disk-before-open.json')['drafts'][record['key']]==record['value']
assert load('first-exit.json')['exitCode']==load('second-exit.json')['exitCode']==0
assert load('cleanup.json')['remaining']==[] and load('port-cleanup.json')['listeners']==[]
assert load('os-cleanup-audit.json')['remaining']==[] and load('os-cleanup-audit.json')['listeners']==[]
second_env=load('second-environment.json');assert second_env['connected']['screen'].endswith('LevelLoadingScreen')
opens=[r for r in rows if r['action']=='open'];assert any((r['result'].get('screen') or '').endswith('LevelLoadingScreen') for r in opens)
assert second['results'][0]['status']=='FAIL' and 'Timed out' in second['results'][0]['error']
summary={'hash':actual,'embeddedOrielHash':nested,'modsOrigin':'NESTED single','hiddenUnfocusedResponses':len(rows),'productPass':['post-send-A','post-send-C','large-incomplete-pagehide'],'productFail':['unknown-preserved: persisted C cleared on different authoritative B'],'fixtureFail':['large-new-JVM-restore: I key sent during LevelLoadingScreen'],'notRun':['real reject','new-JVM actual UI restore / fresh token / typed rehydration / no autoApply'],'restartDiskExact':True,'largePacketLength':len(record['value']),'requestIds':{n:passed[n]['sent']['requestId'] for n in ['post-send-A','post-send-C']},'unknownRequestId':unknown['sent']['requestId'],'ownerPids':[load('first-exit.json')['pid'],load('second-exit.json')['pid']],'cleanup':'normal exit0 both, remaining[], listeners[]','noProductionEdits':True}
(e/'audit-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
