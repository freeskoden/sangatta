#!/bin/bash

# Freeskoden Sangatta Installer
# Supported OS: Ubuntu 24.04 (Noble Numbat) or Rocky Linux 9.7

set -e

echo "========================================================="
echo "   Welcome to Freeskoden Sangatta Webserver Installer"
echo "========================================================="
echo ""
echo "WARNING: This script will install a complete web server"
echo "stack (Nginx, PHP, MariaDB, vsftpd) and configure the"
echo "system as a single-purpose Sangatta server."
echo ""
echo "CRITICAL: Sangatta will DISABLE standard SSH access to"
echo "ensure management is only done via the Sangatta GUI."
echo "========================================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit
fi

# OS Detection
OS=""
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION_ID=$VERSION_ID
else
    echo "Unsupported OS. Could not detect os-release."
    exit 1
fi

if [[ "$OS" == "ubuntu" && "$VERSION_ID" == "24.04" ]]; then
    echo "Detected Ubuntu 24.04"
elif [[ "$OS" == "rocky" && "$VERSION_ID" == "9"* ]]; then
    echo "Detected Rocky Linux 9"
else
    echo "This installer only supports Ubuntu 24.04 or Rocky Linux 9.x."
    echo "Detected: $OS $VERSION_ID"
    exit 1
fi

read -p "Are you sure you want to proceed and lockdown this server? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Installation aborted."
    exit 1
fi

echo "Updating system..."

if [ "$OS" == "ubuntu" ]; then
    apt-get update
    apt-get upgrade -y
    # Install dependencies
    apt-get install -y software-properties-common
    add-apt-repository ppa:ondrej/php -y
    apt-get update
    apt-get install -y nginx mariadb-server mariadb-client vsftpd ufw curl unzip zip tar build-essential
    
    # Install multiple PHP versions
    apt-get install -y php7.4-fpm php7.4-mysql php7.4-mbstring php7.4-xml \
                       php8.0-fpm php8.0-mysql php8.0-mbstring php8.0-xml \
                       php8.1-fpm php8.1-mysql php8.1-mbstring php8.1-xml \
                       php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-xml \
                       php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml
    
    # Install Node.js 20.x for backend
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    # Configure Firewall (ufw)
    echo "Configuring firewall..."
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 8006/tcp # Sangatta GUI
    ufw allow 21/tcp   # FTP
    ufw --force enable
    
    # Disable SSH (WARNING: highly destructive)
    systemctl stop ssh || true
    systemctl disable ssh || true
    ufw delete allow 22/tcp || true

elif [ "$OS" == "rocky" ]; then
    dnf update -y
    # Enable EPEL and Remi
    dnf install -y epel-release
    dnf install -y http://rpms.remirepo.net/enterprise/remi-release-9.rpm
    # Install dependencies
    dnf install -y nginx mariadb-server mariadb vsftpd firewalld curl unzip zip tar nodejs make gcc gcc-c++
    
    # Install multiple PHP versions
    dnf install -y php74-php-fpm php74-php-mysqlnd php74-php-mbstring php74-php-xml \
                   php80-php-fpm php80-php-mysqlnd php80-php-mbstring php80-php-xml \
                   php81-php-fpm php81-php-mysqlnd php81-php-mbstring php81-php-xml \
                   php82-php-fpm php82-php-mysqlnd php82-php-mbstring php82-php-xml \
                   php83-php-fpm php83-php-mysqlnd php83-php-mbstring php83-php-xml
                   
    # Enable and start PHP-FPM services
    systemctl enable php74-php-fpm php80-php-fpm php81-php-fpm php82-php-fpm php83-php-fpm
    systemctl start php74-php-fpm php80-php-fpm php81-php-fpm php82-php-fpm php83-php-fpm
    
    # Create symlinks for standardized socket paths used by Sangatta
    mkdir -p /run/php
    ln -sf /var/opt/remi/php74/run/php-fpm/www.sock /run/php/php7.4-fpm.sock
    ln -sf /var/opt/remi/php80/run/php-fpm/www.sock /run/php/php8.0-fpm.sock
    ln -sf /var/opt/remi/php81/run/php-fpm/www.sock /run/php/php8.1-fpm.sock
    ln -sf /var/opt/remi/php82/run/php-fpm/www.sock /run/php/php8.2-fpm.sock
    ln -sf /var/opt/remi/php83/run/php-fpm/www.sock /run/php/php8.3-fpm.sock
    
    # Configure Firewall (firewalld)
    systemctl start firewalld
    systemctl enable firewalld
    firewall-cmd --permanent --add-port=80/tcp
    firewall-cmd --permanent --add-port=443/tcp
    firewall-cmd --permanent --add-port=8006/tcp
    firewall-cmd --permanent --add-port=21/tcp
    # Disable SSH
    firewall-cmd --permanent --remove-service=ssh
    firewall-cmd --reload
    
    systemctl stop sshd || true
    systemctl disable sshd || true
fi

echo "Setting up Sangatta Backend..."

# Create directory
mkdir -p /opt/sangatta
cd /opt/sangatta

# Download and Extract Sangatta Release
SANGATTA_RELEASE_URL="https://github.com/freeskoden/sangatta/releases/latest/download/sangatta-linux-x64.tar.gz"
echo "Downloading Sangatta release from $SANGATTA_RELEASE_URL..."
curl -fsSL -o sangatta.tar.gz "$SANGATTA_RELEASE_URL" || { 
    echo "ERROR: Failed to download release from GitHub (URL returned 404 or other error)."
    echo "Please ensure you have published a Release on GitHub with the asset 'sangatta-linux-x64.tar.gz'."
    exit 1
}

if [ -f "sangatta.tar.gz" ]; then
    tar -xzf sangatta.tar.gz --strip-components=1
    rm sangatta.tar.gz
    echo "Sangatta extracted successfully."
    
    echo "Installing backend dependencies..."
    cd /opt/sangatta/backend
    npm install --production
else
    echo "WARNING: Could not extract Sangatta tarball."
fi

# Generate Self-Signed SSL for the GUI
echo "Generating SSL certificate for Sangatta Admin GUI (port 8006)..."
mkdir -p /etc/sangatta/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/sangatta/ssl/server.key \
    -out /etc/sangatta/ssl/server.crt \
    -subj "/C=US/ST=State/L=City/O=Freeskoden/OU=Sangatta/CN=localhost"

# Create systemd service for Node backend
cat << 'EOF' > /etc/systemd/system/sangatta.service
[Unit]
Description=Freeskoden Sangatta Webserver Control Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sangatta/backend
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=8006
Environment=SSL_CERT=/etc/sangatta/ssl/server.crt
Environment=SSL_KEY=/etc/sangatta/ssl/server.key

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sangatta
systemctl start sangatta

echo "========================================================="
echo "Sangatta installation complete!"
echo "You can access the GUI at: https://<SERVER_IP>:8006"
echo "Login with default credentials (change immediately!)"
echo "========================================================="
