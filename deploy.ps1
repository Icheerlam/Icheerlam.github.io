$SERVER_IP = "106.53.112.240"
$SSH_USER = "ubuntu"
$SERVER_DIR = "/var/www/html"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Deploy to Tencent Cloud" -ForegroundColor Cyan
Write-Host "  Target: ${SSH_USER}@${SERVER_IP}" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Push-Location "$PSScriptRoot"

try {
    Write-Host "[1/4] Checking SSH connection..." -ForegroundColor Green
    $test = ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SSH_USER}@${SERVER_IP}" "echo OK" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Cannot connect to server" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "Connected"

    Write-Host "[2/4] Packaging files..." -ForegroundColor Green
    $tempTar = "$env:TEMP\icheerlam_deploy.tar.gz"
    tar czf "$tempTar" --exclude='.git' --exclude='.gitignore' --exclude='node_modules' --exclude='.claude' --exclude='deploy.tar.gz' .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Package failed" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host "[3/4] Uploading to server..." -ForegroundColor Green
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$tempTar" "${SSH_USER}@${SERVER_IP}:/tmp/deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Upload failed" -ForegroundColor Red
        Remove-Item "$tempTar" -ErrorAction SilentlyContinue
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host "[4/4] Deploying and reloading Nginx..." -ForegroundColor Green
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${SSH_USER}@${SERVER_IP}" "sudo tar xzf /tmp/deploy.tar.gz -C ${SERVER_DIR}/ && sudo chown -R www-data:www-data ${SERVER_DIR} && sudo chmod -R 755 ${SERVER_DIR} && sudo nginx -t && sudo nginx -s reload && rm /tmp/deploy.tar.gz"

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================" -ForegroundColor Green
        Write-Host "  Deploy SUCCESS!" -ForegroundColor Green
        Write-Host "  http://${SERVER_IP}" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "[ERROR] Deploy failed" -ForegroundColor Red
    }

    Remove-Item "$tempTar" -ErrorAction SilentlyContinue
}
finally {
    Pop-Location
}

Write-Host ""
Read-Host "Press Enter to exit"
