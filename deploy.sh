#!/usr/bin/env bash
# ============================================
# 腾讯云轻量服务器 · 一键部署脚本
# 用法: bash deploy.sh <服务器IP> [用户名]
# 示例: bash deploy.sh 123.456.789.0 root
# ============================================
set -euo pipefail

# ── 配置 ──
SERVER_IP="${1:-}"
SSH_USER="${2:-root}"
SERVER_DIR="/var/www/html"
DOMAIN="${3:-}"  # 可选域名

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}[错误] 请提供服务器 IP${NC}"
    echo "用法: bash deploy.sh <服务器IP> [用户名] [域名]"
    echo "示例: bash deploy.sh 123.456.789.0 root example.com"
    exit 1
fi

echo -e "${CYAN}============================================"
echo "  腾讯云轻量服务器 · 一键部署"
echo "  目标: ${SSH_USER}@${SERVER_IP}"
echo -e "============================================${NC}"
echo ""

# ── Step 1: 检查 SSH 连接 ──
echo -e "${GREEN}[1/5] 检查 SSH 连接...${NC}"
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${SSH_USER}@${SERVER_IP}" "echo OK" &>/dev/null; then
    echo -e "${RED}[错误] 无法连接到服务器，请检查 IP 和防火墙（确保 22 端口已开放）${NC}"
    exit 1
fi
echo "连接成功"

# ── Step 2: 服务器端安装 Nginx ──
echo -e "${GREEN}[2/5] 安装 Nginx...${NC}"
ssh "${SSH_USER}@${SERVER_IP}" << 'END_INSTALL'
set -e
if command -v nginx &>/dev/null; then
    echo "Nginx 已安装，跳过"
else
    . /etc/os-release
    case "$ID" in
        ubuntu|debian)
            sudo apt update -qq && sudo apt install -y -qq nginx
            ;;
        centos|rhel|rocky|almalinux|tencentos|opencloudos)
            sudo yum install -y -q nginx || sudo dnf install -y -q nginx
            ;;
        *)
            echo "不支持的系统: $ID，请手动安装 Nginx"
            exit 1
            ;;
    esac
    echo "Nginx 安装完成"
fi
sudo systemctl enable nginx
sudo systemctl start nginx
END_INSTALL

# ── Step 3: 上传项目文件 ──
echo -e "${GREEN}[3/5] 上传项目文件...${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}"

# SSH 先清空目标目录
ssh "${SSH_USER}@${SERVER_IP}" "sudo rm -rf ${SERVER_DIR:?}/*"

# 使用 scp 上传（Windows Git Bash 兼容）
# 先创建临时 tar 包，上传后服务器端解压，比逐个文件 scp 快得多
TEMP_TAR="/tmp/icheerlam_deploy_$$.tar.gz"
tar czf "$TEMP_TAR" \
    --exclude='.git' \
    --exclude='.gitignore' \
    --exclude='node_modules' \
    --exclude='.claude' \
    --exclude='deploy.tar.gz' \
    .

echo "正在上传..."
scp "$TEMP_TAR" "${SSH_USER}@${SERVER_IP}:/tmp/deploy.tar.gz"

# 服务器端解压
ssh "${SSH_USER}@${SERVER_IP}" << END_EXTRACT
sudo tar xzf /tmp/deploy.tar.gz -C ${SERVER_DIR}/
sudo chown -R www-data:www-data ${SERVER_DIR} 2>/dev/null || sudo chown -R nginx:nginx ${SERVER_DIR} 2>/dev/null || true
sudo chmod -R 755 ${SERVER_DIR}
rm /tmp/deploy.tar.gz
END_EXTRACT

rm -f "$TEMP_TAR"
echo "文件上传完成"

# ── Step 4: 配置 Nginx ──
echo -e "${GREEN}[4/5] 配置 Nginx...${NC}"
ssh "${SSH_USER}@${SERVER_IP}" << END_NGINX
set -e
sudo mkdir -p ${SERVER_DIR}

# 设置权限
sudo chown -R www-data:www-data ${SERVER_DIR} 2>/dev/null || sudo chown -R nginx:nginx ${SERVER_DIR} 2>/dev/null || true
sudo chmod -R 755 ${SERVER_DIR}

# 写入 Nginx 配置
if [ -f /etc/nginx/sites-enabled/default ]; then
    NGINX_CONF="/etc/nginx/sites-enabled/default"
elif [ -f /etc/nginx/conf.d/default.conf ]; then
    NGINX_CONF="/etc/nginx/conf.d/default.conf"
else
    NGINX_CONF="/etc/nginx/conf.d/icheerlam.conf"
fi

sudo tee "\${NGINX_CONF}" > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name _;
    root /var/www/html;
    index index.html;

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot|webp|mp4|webm|mp3|wav|ogg|pdf|zip)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # HTML 不缓存
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache";
    }

    # 主路由
    location / {
        try_files \$uri \$uri.html \$uri/ =404;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
    gzip_vary on;
}
NGINX_EOF

# 测试配置
sudo nginx -t && sudo nginx -s reload
echo "Nginx 配置完成"
END_NGINX

# ── Step 5: （可选）配置 HTTPS ──
if [ -n "$DOMAIN" ]; then
    echo -e "${GREEN}[5/5] 配置 HTTPS (Let's Encrypt)...${NC}"
    ssh "${SSH_USER}@${SERVER_IP}" << END_SSL
set -e
if command -v certbot &>/dev/null; then
    echo "Certbot 已安装"
else
    sudo apt install -y -qq certbot python3-certbot-nginx 2>/dev/null || \
    sudo yum install -y -q certbot python3-certbot-nginx 2>/dev/null || \
    sudo dnf install -y -q certbot python3-certbot-nginx 2>/dev/null
fi
sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "admin@${DOMAIN}" --redirect
echo "HTTPS 配置完成"
END_SSL
else
    echo -e "${CYAN}[5/5] 跳过 HTTPS（未提供域名）${NC}"
fi

echo ""
echo -e "${GREEN}============================================"
echo "  部署完成！"
echo "  访问地址: http://${SERVER_IP}"
if [ -n "$DOMAIN" ]; then
    echo "  域名访问: https://${DOMAIN}"
fi
echo -e "============================================${NC}"
