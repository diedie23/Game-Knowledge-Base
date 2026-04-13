<#
  APM 知识库访客统计 — 一键部署脚本
  用法：在 PowerShell 中运行 .\deploy.ps1
#>

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$docsDir   = Join-Path (Split-Path -Parent $scriptDir) "docs"
$Q = [char]34  # 双引号字符

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  APM 知识库 - 访客统计系统一键部署" -ForegroundColor Cyan
Write-Host "  Cloudflare Workers + D1 SQLite" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: 检查 Wrangler
Write-Host "[1/7] 检查 Wrangler CLI..." -ForegroundColor Yellow
try {
    $ver = npx wrangler --version 2>$null
    Write-Host "  OK Wrangler $ver" -ForegroundColor Green
} catch {
    Write-Host "  未找到 Wrangler，正在安装..." -ForegroundColor Yellow
    npm install -g wrangler
}

# Step 2: 登录 Cloudflare
Write-Host ""
Write-Host "[2/7] 检查 Cloudflare 登录状态..." -ForegroundColor Yellow
$whoami = npx wrangler whoami 2>&1 | Out-String
if ($whoami -match "not authenticated") {
    Write-Host "  需要登录 Cloudflare（即将打开浏览器）" -ForegroundColor Cyan
    Write-Host "  请在浏览器中点击 Allow 授权" -ForegroundColor Cyan
    Write-Host ""
    npx wrangler login
    $whoami = npx wrangler whoami 2>&1 | Out-String
    if ($whoami -match "not authenticated") {
        Write-Host "  登录失败，请手动运行: npx wrangler login" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  OK 已登录 Cloudflare" -ForegroundColor Green

# Step 3: 创建 D1 数据库
Write-Host ""
Write-Host "[3/7] 创建 D1 数据库..." -ForegroundColor Yellow

$dbId = ""
try {
    $dbListRaw = npx wrangler d1 list --json 2>$null | Out-String
    if ($dbListRaw -match "apm-analytics") {
        $dbJson = $dbListRaw | ConvertFrom-Json
        foreach ($db in $dbJson) {
            if ($db.name -eq "apm-analytics") {
                $dbId = $db.uuid
                break
            }
        }
        Write-Host "  OK 数据库已存在 ID: $dbId" -ForegroundColor Green
    }
} catch {
    Write-Host "  查询数据库列表失败，将创建新数据库" -ForegroundColor Yellow
}

if (-not $dbId) {
    Write-Host "  正在创建新数据库..." -ForegroundColor Cyan
    $createOutput = npx wrangler d1 create apm-analytics 2>&1 | Out-String
    Write-Host $createOutput

    $uuidPattern = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
    if ($createOutput -match $uuidPattern) {
        $dbId = $Matches[0]
    }

    if (-not $dbId) {
        Write-Host "  无法提取数据库 ID，请手动检查输出" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK 数据库创建成功 ID: $dbId" -ForegroundColor Green
}

# Step 4: 更新 wrangler.toml
Write-Host ""
Write-Host "[4/7] 更新配置文件..." -ForegroundColor Yellow
$tomlPath = Join-Path $scriptDir "wrangler.toml"
$tomlContent = Get-Content $tomlPath -Raw -Encoding UTF8
$tomlContent = $tomlContent.Replace("YOUR_DATABASE_ID_HERE", $dbId)
Set-Content -Path $tomlPath -Value $tomlContent -Encoding UTF8 -NoNewline
Write-Host "  OK wrangler.toml database_id = $dbId" -ForegroundColor Green

# Step 5: 初始化数据库表结构
Write-Host ""
Write-Host "[5/7] 初始化数据库表结构..." -ForegroundColor Yellow
Push-Location $scriptDir
try {
    npx wrangler d1 execute apm-analytics --file=./schema.sql --remote 2>&1 | Out-String | Write-Host
    Write-Host "  OK 表结构初始化完成" -ForegroundColor Green
} catch {
    Write-Host "  表结构可能已存在，继续..." -ForegroundColor Yellow
}
Pop-Location

# Step 6: 部署 Worker
Write-Host ""
Write-Host "[6/7] 部署 Worker 到 Cloudflare..." -ForegroundColor Yellow
Push-Location $scriptDir
$deployOutput = npx wrangler deploy 2>&1 | Out-String
Write-Host $deployOutput
Pop-Location

$workerUrl = ""
if ($deployOutput -match "https://[\w\-]+\.[\w\-]+\.workers\.dev") {
    $workerUrl = $Matches[0]
}

if (-not $workerUrl) {
    Write-Host "  无法提取 Worker URL，请检查部署输出" -ForegroundColor Red
    exit 1
}

Write-Host "  OK Worker 已部署: $workerUrl" -ForegroundColor Green

# Step 7: 回填 Worker URL 到前端文件
Write-Host ""
Write-Host "[7/7] 回填 Worker URL 到前端文件..." -ForegroundColor Yellow

$placeholder = "https://apm-analytics.YOUR_SUBDOMAIN.workers.dev"

$analyticsPath = Join-Path $docsDir "analytics.js"
$analyticsContent = Get-Content $analyticsPath -Raw -Encoding UTF8
$analyticsContent = $analyticsContent.Replace($placeholder, $workerUrl)
Set-Content -Path $analyticsPath -Value $analyticsContent -Encoding UTF8 -NoNewline
Write-Host "  OK docs/analytics.js" -ForegroundColor Green

$adminPath = Join-Path $docsDir "admin-stats.html"
$adminContent = Get-Content $adminPath -Raw -Encoding UTF8
$adminContent = $adminContent.Replace($placeholder, $workerUrl)
Set-Content -Path $adminPath -Value $adminContent -Encoding UTF8 -NoNewline
Write-Host "  OK docs/admin-stats.html" -ForegroundColor Green

# 完成
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Worker: $workerUrl" -ForegroundColor Cyan
Write-Host "  密码:   apm-kb-2026" -ForegroundColor Cyan
Write-Host "  后台:   admin-stats.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "  可选安全加固:" -ForegroundColor Yellow
Write-Host "    cd analytics" -ForegroundColor DarkGray
Write-Host "    npx wrangler secret put ADMIN_PASSWORD" -ForegroundColor DarkGray
Write-Host "    npx wrangler secret put JWT_SECRET" -ForegroundColor DarkGray
Write-Host ""
