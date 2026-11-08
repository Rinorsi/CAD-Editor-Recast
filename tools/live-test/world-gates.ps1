param([string]$EvidenceRoot, [string]$BuildDirectory)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $Root
$Out=if($EvidenceRoot){[IO.Path]::GetFullPath($EvidenceRoot)}else{Join-Path $Root 'logs/live-test/world'}
New-Item -ItemType Directory -Force $Out | Out-Null
if($BuildDirectory){
    $Classes=Join-Path ([IO.Path]::GetFullPath($BuildDirectory)) 'classes/java'
}else{
    $Build=Get-ChildItem ($Root+'/../Oriel-UI-Workspace/daily/*/scratch/editor-mod/build/fabric-26.1.2/classes/java/main/dev/rinorsi/editor/EditorMod.class') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $Classes=[IO.Path]::GetFullPath((Join-Path $Build.Directory.FullName '../../../../'))
}
$Work=Join-Path $Out 'classes'
if(Test-Path -LiteralPath $Work){throw 'Fresh world/classes directory required; archive previous owned evidence first'}
New-Item -ItemType Directory -Force ($Work+'/main'),($Work+'/test') | Out-Null
Copy-Item ($Classes+'/main/dev') ($Work+'/main/dev') -Recurse
Copy-Item ($Classes+'/codecVerification/dev') ($Work+'/test/dev') -Recurse
$Kinds=@{revision='merge2';merge='merge';permission='permission';player='player';entity='entity'}
foreach($Kind in @('revision','merge','permission','player','entity')){
    $Log=Join-Path $Out $Kind
    New-Item -ItemType Directory -Force $Log | Out-Null
    if($BuildDirectory){
        $RuntimeJson=Join-Path ([IO.Path]::GetFullPath($BuildDirectory)) '../../runtime-classpath.json'
        $Entries=@(Get-Content -LiteralPath $RuntimeJson -Raw | ConvertFrom-Json)
        $Mc=Get-ChildItem (Join-Path $Root '.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\\/]26[.]1[.]2[\\/]' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if(!$Mc){throw 'Missing current access-widened Minecraft jar'}
        $Cp=(@($Entries | Where-Object {$_ -notmatch 'minecraft-merged.*[.]jar$' -and $_ -notmatch 'mctest'})+@($Mc.FullName)) -join ';'
        Set-Content ($Log+'/classpath.txt') $Cp
    }else{
        Copy-Item ($Root+'/logs/world-'+$Kinds[$Kind]+'/classpath.txt') ($Log+'/classpath.txt')
    }
    # Reuse the existing probe launcher, replacing only its scratch/evidence locations.
    $Script=Get-Content ($Root+'/tools/world-edit/probe-'+$Kind+'-server.ps1') -Raw
    $Script=$Script.Replace('$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ''../..''))',('$Root='''+$Root+''''))
    $Script=$Script.Replace(('$Work=Join-Path $Root ''.world-'+$Kinds[$Kind]+''''),('$Work='''+$Work+''''))
    $Script=$Script.Replace(('$Log=Join-Path $Root ''logs/world-'+$Kinds[$Kind]+''''),('$Log='''+$Log+''''))
    [IO.File]::WriteAllText(($Log+'/probe.ps1'),$Script)
    & ($Log+'/probe.ps1') 2>&1 | Tee-Object ($Log+'/gate.log')
    if($LASTEXITCODE){throw ($Kind+' server probe failed')}
}
