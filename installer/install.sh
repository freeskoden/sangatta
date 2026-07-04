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
    apt-get install -y nginx php-fpm php-mysql mariadb-server mariadb-client vsftpd ufw curl unzip zip tar
    
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
    # Enable EPEL
    dnf install -y epel-release
    # Install dependencies
    dnf install -y nginx php-fpm php-mysqlnd mariadb-server mariadb vsftpd firewalld curl unzip zip tar nodejs
    
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
    tar -xzf sangatta.tar.gz
    rm sangatta.tar.gz
    echo "Sangatta extracted successfully."
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
