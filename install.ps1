# figbridge installer for Windows. Run install.bat (double-click) instead of this file.
$ErrorActionPreference = 'Stop'
$src  = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Join-Path $env:LOCALAPPDATA 'figbridge'
$dest = Join-Path $root 'app'
$bin  = Join-Path $root 'bin'

Write-Host ""
Write-Host "  figbridge - installing"
Write-Host "  ----------------------"
Write-Host ""

# 1. Node
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) {
  Write-Host "  Node.js is missing, and figbridge needs it."
  Write-Host "  Trying winget..."
  try {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
    $node = (Get-Command node -ErrorAction SilentlyContinue)
  } catch { }
}
if (-not $node) {
  Write-Host "  Could not install it automatically."
  Write-Host "  Get it from https://nodejs.org (the LTS button), then run install.bat again."
  Start-Process "https://nodejs.org/en/download"
  Read-Host "  Press Enter to close"
  exit 1
}
$nodePath = $node.Source
Write-Host ("  node          " + (& $nodePath --version))

# 2. Files
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
foreach ($item in @('bin','src','jobs','templates','plugin','package.json')) {
  Copy-Item (Join-Path $src $item) -Destination $dest -Recurse -Force
}
Write-Host ("  installed to  " + $dest)

# 3. The `fb` command
New-Item -ItemType Directory -Path $bin -Force | Out-Null
$shim = Join-Path $bin 'fb.cmd'
"@echo off`r`n`"$nodePath`" `"$dest\bin\fb.mjs`" %*" | Set-Content -Path $shim -Encoding ASCII
Write-Host ("  command       " + $shim)

$userPath = [Environment]::GetEnvironmentVariable('Path','User')
if ($userPath -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$bin", 'User')
  Write-Host "  added it to your PATH - open a new terminal to pick it up"
}

# 4. Background bridge, at login
& $nodePath (Join-Path $dest 'bin\fb.mjs') autostart on | Out-Null
& $nodePath (Join-Path $dest 'bin\fb.mjs') up | Out-Null
Write-Host "  bridge        running, and it will start again at login"

# 5. The Figma plugin
Write-Host ""
Write-Host "  ONE LAST STEP, in Figma Desktop:"
Write-Host "    Plugins  ->  Development  ->  Import plugin from manifest..."
Write-Host "    and pick the manifest.json in the folder that just opened."
Write-Host ""
Start-Process explorer.exe (Join-Path $dest 'plugin')
Write-Host "  After that, launch it from Plugins -> Development -> Figma Desktop Bridge."
Write-Host "  Then, in a new terminal:  fb status"
Write-Host ""
Read-Host "  Press Enter to close"
