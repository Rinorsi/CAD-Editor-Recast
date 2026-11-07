$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'VaultLegacyMerge.cs')
$testDir=Join-Path ([IO.Path]::GetTempPath()) ('vault-merge-demo-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $testDir | Out-Null
$base='{"version":1,"entries":[{"id":"00000000-0000-0000-0000-000000000001","name":"旧名称","tags":["旧标签"],"note":"旧说明","created":1,"updated":1,"mcDataVersion":4790,"modVersion":"test","stack":{"id":"minecraft:paper","count":1,"comps":{"custom_data":{"n":9007199254740993}},"removed":{},"component_snbt":{"custom_data":"{n:9007199254740993L,f:0.8f,a:[L;9223372036854775807L]}"}}}]}'
$a=Join-Path $testDir 'day1.json';$b=Join-Path $testDir 'day2.json';$output=Join-Path $testDir 'global/vault.json'
[IO.File]::WriteAllText($a,$base)
$recent=$base.Replace('旧名称','最近名称').Replace('旧标签','新标签').Replace('旧说明','新说明').Replace('"updated":1','"updated":2')
[IO.File]::WriteAllText($b,$recent)
New-Item -ItemType Directory -Path (Split-Path $output) | Out-Null
$existing=$base.Replace('minecraft:paper','minecraft:stone').Replace('旧名称','已有全局条目')
[IO.File]::WriteAllText($output,$existing)
$merged=[VaultLegacyMerge]::Merge($output,[string[]]@($a,$b))
$root=[System.Text.Json.Nodes.JsonNode]::Parse($merged)
if($root['entries'].Count -ne 2){throw '合并去重后应该是2条'}
$paper=@($root['entries'] | Where-Object {$_['stack']['id'].GetValue[string]() -eq 'minecraft:paper'})[0]
if($paper['name'].GetValue[string]() -ne '最近名称'){throw '未保留最近名称'}
if($paper['tags'].Count -ne 2 -or $paper['note'].GetValue[string]() -notmatch '新说明\n旧说明'){throw 'tags/note未完整合并'}
if($paper['stack']['component_snbt']['custom_data'].GetValue[string]() -ne '{n:9007199254740993L,f:0.8f,a:[L;9223372036854775807L]}'){throw 'typed SNBT发生变化'}
if($merged -notmatch '"n":9007199254740993'){throw 'JSON long精度丢失'}
if([IO.File]::ReadAllText($output+'.bak') -ne $existing){throw '备份没有保留原全局内容'}
if([IO.File]::ReadAllText($a) -ne $base){throw '旧文件被修改'}
$again=[VaultLegacyMerge]::Merge($output,[string[]]@($a,$b))
if([System.Text.Json.Nodes.JsonNode]::Parse($again)['entries'].Count -ne 2){throw '重复合并不是幂等'}
if($again -ne $merged){throw '重复合并改变了名称/标签/note或ID'}
$bad=Join-Path $testDir 'bad.json';[IO.File]::WriteAllText($bad,'{"version":99,"entries":[]}')
try{[VaultLegacyMerge]::Merge($output,[string[]]@($bad));throw '未来版本应拒绝'}catch{if($_.Exception.Message -eq '未来版本应拒绝'){throw}}
if([IO.File]::ReadAllText($output) -ne $again){throw '失败时覆盖了好文件'}
$held=[IO.FileStream]::new($output+'.lock',[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite)
try{$held.Lock(0,[long]::MaxValue);try{[VaultLegacyMerge]::Merge($output,[string[]]@($a));throw '写锁占用时应拒绝'}catch{if($_.Exception.Message -eq '写锁占用时应拒绝'){throw}}}finally{$held.Unlock(0,[long]::MaxValue);$held.Dispose()}
Write-Output ('PASS merge engine temp demo: 3 source entries -> 2 merged; newest name, tags/note union, precise JSON/SNBT, backup, idempotence, validation rollback, exclusive lock; '+$testDir)
