$ErrorActionPreference = "Stop"

$version = (Get-Content "manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
$zipName = "douban-to-feishu-v$version.zip"

Write-Host "Version: $version"
Write-Host "Target: $zipName"

$exclude = @(".git", ".github", ".gitignore", ".vscode", "build_zip.ps1", "*.zip", "build_temp", "node_modules", "help", "*.md", "LICENSE", "维护与发布指南.md", "_metadata")

if (Test-Path "build_temp") { Remove-Item "build_temp" -Recurse -Force }
New-Item -ItemType Directory -Path "build_temp" | Out-Null

Get-ChildItem -Path . -Exclude $exclude | Copy-Item -Destination "build_temp" -Recurse

if (Test-Path $zipName) { Remove-Item $zipName }
Compress-Archive -Path "build_temp\*" -DestinationPath $zipName
Remove-Item "build_temp" -Recurse -Force

Write-Host "Done: $zipName (Optimized for Store)"
