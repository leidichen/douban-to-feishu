$ErrorActionPreference = "Stop"

$version = (Get-Content "manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
$zipName = "douban-to-feishu-v$version.zip"

Write-Host "Version: $version"
Write-Host "Target: $zipName"

# 定义需要打包的文件列表（白名单模式）
# 只打包这些必要文件，排除所有文档和开发工具配置
$includeList = @(
    "manifest.json",
    "popup.html",
    "popup.js",
    "background.js",
    "content.js",
    "config.js",
    "styles.css",
    "rules.json",
    "icons" # 文件夹
)

if (Test-Path "build_temp") { Remove-Item "build_temp" -Recurse -Force }
New-Item -ItemType Directory -Path "build_temp" | Out-Null

foreach ($item in $includeList) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination "build_temp" -Recurse
    } else {
        Write-Warning "File not found: $item"
    }
}

if (Test-Path $zipName) { Remove-Item $zipName }
Compress-Archive -Path "build_temp\*" -DestinationPath $zipName
Remove-Item "build_temp" -Recurse -Force

Write-Host "Done: $zipName (Optimized for Store)"
