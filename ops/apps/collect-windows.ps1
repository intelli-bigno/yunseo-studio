# 설치 앱 수집(Windows) — 시작 메뉴에 등록된 앱 이름과 실제 아이콘(PNG 48px)을 뽑아 apps.json + icons/ 로 쓴다.
# 브라우저는 설치 앱을 볼 수 없어서 기기에서 뽑아 대시보드 데이터 볼륨(/data/apps/<기기>)에 넣는다(ops/apps/README.md).
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File collect-windows.ps1 -Out C:\...\apps-out
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$icons = Join-Path $Out 'icons'
New-Item -ItemType Directory -Force -Path $icons | Out-Null
$shell = New-Object -ComObject Shell.Application
$apps = Get-StartApps | Sort-Object Name -Unique
$list = @()
$i = 0
foreach ($a in $apps) {
  $i++
  $slug = ('w{0:d4}' -f $i)
  $iconFile = $null
  try {
    # 바로가기(.lnk)·exe 는 연결 아이콘, 스토어 앱은 셸 항목 그림을 쓴다
    $item = $shell.NameSpace('shell:AppsFolder').ParseName($a.AppID)
    $path = $null
    if ($item) { $path = $item.ExtendedProperty('System.Link.TargetParsingPath') }
    if (-not $path -and $a.AppID -match '^[A-Za-z]:\\') { $path = $a.AppID }
    if ($path -and (Test-Path -LiteralPath $path)) {
      $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
      if ($ico) {
        $bmp = $ico.ToBitmap()
        $iconFile = "$slug.png"
        $bmp.Save((Join-Path $icons $iconFile), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose(); $ico.Dispose()
      }
    }
  } catch { $iconFile = $null }
  $list += [ordered]@{ name = $a.Name; icon = $iconFile }
}
$doc = [ordered]@{ machine = 'windows-desktop'; collectedAt = (Get-Date).ToUniversalTime().ToString('o'); apps = $list }
[System.IO.File]::WriteAllText((Join-Path $Out 'apps.json'), ($doc | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding $false))
Write-Output ("apps={0} icons={1}" -f $list.Count, (Get-ChildItem $icons).Count)
