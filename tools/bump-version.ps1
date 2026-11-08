param([Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')][string]$Version,[switch]$DryRun)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$File=Join-Path $Root 'gradle.properties'
$Text=[IO.File]::ReadAllText($File)
$Versions=[regex]::Matches($Text,'(?m)^version=([^\r\n]+)')
if($Versions.Count -ne 1){throw 'Expected exactly one version= in gradle.properties'}
$Previous=$Versions[0].Groups[1].Value.Trim()
$Changes=[ordered]@{}
$Changes[$File]=[regex]::Replace($Text,'(?m)^version=[^\r\n]+','version='+$Version)
# Only current-version markers are mutable: dated evidence and released history remain intact.
$Files=@((Join-Path $Root 'README.md'))+@(Get-ChildItem (Join-Path $Root 'docs') -Recurse -Filter '*.md' | ForEach-Object FullName)
foreach($File in $Files){
 $Before=[IO.File]::ReadAllText($File)
 $After=[regex]::Replace($Before,'(?<=<!-- editor-version -->)[^<\r\n]+(?=<!-- /editor-version -->)',$Version)
 if($After -ne $Before){$Changes[$File]=$After}
}
$File=Join-Path $Root 'CHANGELOG.md'
$Before=[IO.File]::ReadAllText($File)
if($Before -notmatch ('(?m)^## '+[regex]::Escape($Version)+'(?:\s|$)')){
 $Heading='## '+$Version+' ('+(Get-Date -Format 'yyyy-MM-dd')+')'
 if($Before -match '(?m)^## 未发布[^\r\n]*'){$Changes[$File]=[regex]::Replace($Before,'(?m)^## 未发布[^\r\n]*',$Heading)}
 else{$Changes[$File]=$Before.Replace('# 更新日志','# 更新日志'+[Environment]::NewLine+[Environment]::NewLine+$Heading+[Environment]::NewLine+[Environment]::NewLine+'- 待维护者补充。')}
}
foreach($Template in @('fabric/src/main/resources/fabric.mod.json','neoforge/src/main/resources/META-INF/neoforge.mods.toml')){
 $File=Join-Path $Root $Template;$Before=[IO.File]::ReadAllText($File)
 $After=if($Template.EndsWith('.json')){[regex]::Replace($Before,'"version"\s*:\s*"[^"]+"','"version": "${version}"')}else{[regex]::Replace($Before,'(?m)^version="[^"]+"','version="${version}"')}
 if($After -ne $Before){$Changes[$File]=$After}
}
foreach($File in $Changes.Keys){
 if([IO.File]::ReadAllText($File) -eq $Changes[$File]){continue}
 Write-Output ('{0}: {1} -> {2}' -f [IO.Path]::GetRelativePath($Root,$File),$Previous,$Version)
 if(!$DryRun){[IO.File]::WriteAllText($File,$Changes[$File],[Text.UTF8Encoding]::new($false))}
}
Write-Output $(if($DryRun){'DRY RUN: no files changed'}else{'Version synchronized; Gradle expands metadata templates.'})
