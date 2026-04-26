@echo off
chcp 65001 >nul
echo ====================================
echo Adobe Stock 图片识别工具
echo ====================================
echo.

REM 检查Python是否安装
py --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到Python，请先安装Python
    pause
    exit /b 1
)

REM 检查配置文件
if not exist "config.json" (
    echo [错误] 未找到config.json配置文件
    pause
    exit /b 1
)

REM 检查API密钥是否已配置
findstr /C:"请在这里填入你的阿里云API密钥" config.json >nul
if %errorlevel% equ 0 (
    echo [提示] 请先配置阿里云API密钥
    echo.
    echo 步骤：
    echo 1. 访问 https://dashscope.aliyuncs.com/
    echo 2. 开通通义千问VL服务
    echo 3. 创建API密钥
    echo 4. 在config.json中填入密钥
    echo.
    echo 详细说明请查看：阿里云使用指南.md
    pause
    exit /b 1
)

REM 安装依赖
echo [信息] 检查依赖...
py -m pip install flask requests Pillow -q -i https://pypi.tuna.tsinghua.edu.cn/simple

echo [信息] 启动 Web 界面...
echo.

REM 启动Web界面
py web_ui.py
