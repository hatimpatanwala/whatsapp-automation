#!/bin/bash
# ─── EC2 Initial Setup Script ────────────────────────────────────────
# Run this ONCE on a fresh Ubuntu 24.04 EC2 instance
# Usage: chmod +x setup-ec2.sh && sudo ./setup-ec2.sh
# ───────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "============================================"
echo "  WhatsApp Automation - EC2 Setup Script"
echo "============================================"

# ─── 1. System updates ───────────────────────────────────────────────
echo ">>> Updating system packages..."
apt-get update && apt-get upgrade -y

# ─── 2. Install Docker ───────────────────────────────────────────────
echo ">>> Installing Docker..."
apt-get install -y ca-certificates curl gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add ubuntu user to docker group
usermod -aG docker ubuntu

echo ">>> Docker installed: $(docker --version)"

# ─── 3. Create swap (critical for t3.micro with 1GB RAM) ─────────────
echo ">>> Creating 2GB swap file..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Optimize swap for low-memory server
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    sysctl -p
    echo ">>> Swap created successfully"
else
    echo ">>> Swap already exists"
fi

# ─── 4. Create project directory ─────────────────────────────────────
echo ">>> Creating project directory..."
mkdir -p /opt/whatsapp-automation/deploy
chown -R ubuntu:ubuntu /opt/whatsapp-automation

# ─── 5. Configure Docker daemon for low-memory ───────────────────────
echo ">>> Configuring Docker for low-memory..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

systemctl restart docker

# ─── 6. Install useful tools ─────────────────────────────────────────
echo ">>> Installing utilities..."
apt-get install -y htop iotop ncdu fail2ban ufw git

# ─── 7. Configure firewall (UFW) ─────────────────────────────────────
echo ">>> Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw --force enable

echo ">>> Firewall configured"

# ─── 8. Configure fail2ban ───────────────────────────────────────────
echo ">>> Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ─── 9. Docker cleanup cron job ──────────────────────────────────────
echo ">>> Setting up Docker cleanup cron..."
cat > /etc/cron.weekly/docker-cleanup << 'EOF'
#!/bin/bash
docker system prune -af --volumes --filter "until=168h"
EOF
chmod +x /etc/cron.weekly/docker-cleanup

# ─── 10. Auto security updates ───────────────────────────────────────
echo ">>> Enabling automatic security updates..."
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo ""
echo "============================================"
echo "  Setup complete! Next steps:"
echo "============================================"
echo ""
echo "  1. Log out and back in (for docker group)"
echo "  2. Copy your .env file to /opt/whatsapp-automation/deploy/.env"
echo "  3. Push code to GitHub to trigger deployment"
echo ""
echo "  Memory: $(free -h | awk '/Mem:/ {print $2}') RAM + $(free -h | awk '/Swap:/ {print $2}') Swap"
echo "  Disk:   $(df -h / | awk 'NR==2 {print $4}') available"
echo "============================================"
