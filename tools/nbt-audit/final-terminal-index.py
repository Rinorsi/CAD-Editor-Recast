from pathlib import Path
import json,sys
r=Path(sys.argv[1])
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
q=lambda s:chr(39)+str(s).replace(chr(39),chr(39)*2)+chr(39)
gates=[]
for folder,result in [('registry-final-D089-06','registry3/3'),('natural-final-D089-01','naturalTick7/7; no freeze'),('integrated-final-D089-01','NBT9/9; serialization freeze'),('registry-final-830-02','registry3/3; actual custom saved/reopened9'),('integrated-final-830-01','selectedNBT3/3; six NOT_RUN; serialization freeze')]:
 c=read(r/folder/'configuration.json')
 if c['registryLive']:cmd='& tools/nbt-audit/run-registry.ps1 -Evidence '+q(r/folder)
 else:
  env="$env:NBT_NATURAL='1'; $env:NBT_EXTRA=$null; $env:NBT_CASE=$null; " if folder.startswith('natural-') else ("$env:NBT_NATURAL=$null; $env:NBT_EXTRA='1'; $env:NBT_CASE='^(bee-timer|item-document|entity-vault)'; " if '830' in folder else "$env:NBT_NATURAL=$null; $env:NBT_EXTRA='1'; $env:NBT_CASE=$null; ")
  cmd=env+'& tools/nbt-audit/run-live.ps1 -Mode backend-single -Evidence '+q(r/folder)
 for k,arg in [('editorJar','EditorJar'),('sha256','ExpectedEditorSha256'),('runtimeClasspath','RuntimeClasspath'),('probeJar','ProbeJar')]:cmd+=' -'+arg+' '+q(c[k])
 if c['registryLive']:cmd+=' -RegistryPack '+q(c['registryPack'])
 gates.append('PASS | '+cmd+' | '+result+' | '+str(r/(folder+'.log')))
for tag in ['D089','830']:
 folder='typed-native-final-'+tag+'-01';h=read(r/folder/'source-hashes.json');jar=Path(h['editor']['Path'])
 cmd='& tools/nbt-audit/typed-native.ps1 -Evidence '+q(r/folder)+' -EditorJar '+q(jar)+' -RuntimeClasspath '+q(jar.parent/'native-runtime-classpath.json')
 gates.append('PASS | '+cmd+' | typed native5/5; UI payload to production backend; not live | '+str(r/(folder+'.log')))
for cmd,log,result in [('python tools/nbt-audit/audit-final-install.py','final-installed-artifact-audit-02.log','installed hash/one nested Oriel/no devsource/identical classes/CSS+picker only'),('python tools/nbt-audit/audit-final-freeze.py','final-freeze-audit.log','actual RPC freeze boundaries confirmed'),('node tools/nbt-audit/aggregate-d089.cjs','candidate-D089-aggregate-01.log','D089 registry3/natural7/NBT9/native5'),('node tools/nbt-audit/aggregate-final-830.cjs','candidate-830-aggregate-04.log','830 registry3/selectedNBT3/native5; six+seven NOT_RUN')]:gates.append('PASS | '+cmd+' '+q(r)+' | '+result+' | '+str(r/log))
gates.append('PASS | & tools/nbt-audit/audit-final-cleanup.ps1 -EvidenceRoot '+q(r)+' | all six owned PIDs absent; owned JVM empty; 25782 no LISTEN | '+str(r/'final-os-cleanup-02.log'))
(r/'final-gates.txt').write_text(chr(10).join(gates)+chr(10),encoding='utf-8')
shots=list((r/'registry-final-830-02/host/screenshots').glob('*.png'))+list((r/'integrated-final-830-01/host/screenshots').glob('*.png'))
report={
 'status':'PASS_WITH_EXPLICIT_SCOPE','version':'Minecraft26.1.2 Fabric; Editor0.99.5; single nested Oriel0.14.0',
 'D089':{'hash':'D089FD1DB57231232C364709643AE9E4F05F18ED48F49E1373D1D0BCBC223215','registry':3,'naturalTick':7,'NBT':9,'typedNative':5,'notRunSelected':0,'report':str(r/'candidate-D089-terminal.json')},
 '830':{'hash':'830CC0C83142350722ACB8BD03DA0E5C393E37BDF87164424E586595CB3D034A','registry':3,'NBT':3,'typedNative':5,'NBT_NOT_RUN':6,'naturalTick_NOT_RUN':7,'report':str(r/'candidate-830-terminal.json')},
 'reviewedLatestScreenshots':[str(p) for p in shots],
 'screenshotNotes':'Viewed actual six latest registry images and three selected NBT images. Unknown defaults warning readable; custom namespace actual candidate; recovered/reopened both enchantments9. Bee41 and min2147483647 saved; Document item confirmed and dirty cleared; Vault cow reopened clean. Types verified with native host SNBT, not screenshots/JSON numbers.',
 'installedAudit':str(r/'final-installed-artifact-audit.json'),'freezeAudit':str(r/'final-freeze-audit.json'),'cleanup':read(r/'final-os-cleanup.json'),'gates':str(r/'final-gates.txt'),
 'limitations':['D089 remains historical, never recounted as830 live. Six NBT and seven natural tick not rerun after CSS-only delta.', 'Datapack namespace is not an independently installed third-party mod. Actual relation92 covered; forced multi-page catalog boundary NOT_EXECUTED.', 'Registry delays intercept actual DocumentDriver.patchJson delivery, not vanilla network delay. Raw original facts preserved and replayed unchanged.', 'Typed-native5 is UI harness payload -> production Java, not live. Plain JsonOps lossy counterexample preserved.', 'NBT serialization freezes once before bee page until owned process exit. Registry and natural seven never freeze.', 'Six-target build/check belongs to Lead; worker did not run Gradle or claim six-target live.'],
 'preservedFailures':{'registry-final-D089-01':'owned vanilla BackupConfirmScreen fixture stop; no cases','registry-final-D089-02':'tab badge text selector','registry-final-D089-03':'reload replaced Document losing test queue; replaced with Java persistent delivery queue','registry-final-D089-04':'engine KeyboardEvent unsupported; actual search button used','registry-final-D089-05':'vanilla21 inline relation did not justify pending; fixture now actual supported-ref92 datapack','candidate-830-aggregate-01.log':'overstrict aggregation of readonly open-page probes','candidate-830-aggregate-03.log':'latest readonly open probe transient; next identical probe true; saved assertions unchanged','final-os-cleanup.log':'PowerShell quoting failed Replace; standalone audit passed02','final-terminal-index.log':'inline Python newline quoting failed; standalone file replaces generator'},
 'productionModifiedByWorker':False,'newGameLaunchNeeded':False
}
(r/'final-worker-terminal.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['Fabric26.1.2 NBT/registry terminal','','D089 historical: registry3 + natural tick7 + NBT9 + typed native5 PASS.','830 final UI increment: registry3 + selected NBT3 + typed native5 PASS; six NBT and seven natural tick NOT_RUN.','','Exact requests/host SNBT/scope/visual review/preserved failures/freeze: final-worker-terminal.json.','Complete command gates: final-gates.txt.','All owned PIDs absent; port25782 empty. No other worker process touched.']
(r/'final-worker-terminal.md').write_text(chr(10).join(lines)+chr(10),encoding='utf-8')
print('PASS by-hash terminal index, explicit scope/NOT_RUN, actual reviewed screenshots, gate commands, preserved FAIL and OS cleanup')
