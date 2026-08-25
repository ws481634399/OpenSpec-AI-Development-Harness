# Phase 1.2 openspec init 端到端验证脚本
# 用法：在仓库根执行 .\scripts\verify.ps1

$ErrorActionPreference = 'Stop'

Write-Host '=== 1. CLI 加载检查 ===' -ForegroundColor Cyan
node cli/openspec/bin/openspec.js --version
if ($LASTEXITCODE -ne 0) {
    Write-Host 'FAIL: CLI 加载失败' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '=== 2. Unit + Integration 测试 ===' -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host 'FAIL: 测试未通过' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '=== 验证通过 ===' -ForegroundColor Green
