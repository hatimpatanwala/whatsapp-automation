#!/bin/bash
# ─── GCP VM Initial Setup Script ──────────────────────────────────────
# Run this ONCE on a fresh GCP VM (Ubuntu 22.04 / Debian 12)
# Usage: chmod +x server-setup.sh && sudo ./server-setup.sh
# ───────────────────────────────────────────────────────────────────────

set -e

echo "==========================================="
echo "  WhatsApp Commerce - GCP Server Setup"
echo "==========================================="

# ─── 1. System Update ────────────────────────────────────────────────
echo ""
echo ">>> [1/6] Updating system packages..."
apt-get update && apt-get upgrade -y

# ─── 2. Install Docker ───────────────────────────────────────────────
echo ""
echo ">>> [2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    echo "Docker installed successfully."
else
    echo "Docker already installed."
fi

# ─── 3. Add current user to docker group ─────────────────────────────
echo ""
echo ">>> [3/6] Configuring Docker permissions..."
SUDO_USER_NAME="${SUDO_USER:-$USER}"
usermod -aG docker "$SUDO_USER_NAME" 2>/dev/null || true
echo "Added $SUDO_USER_NAME to docker group."

# ─── 4. Install useful tools ─────────────────────────────────────────
echo ""
echo ">>> [4/6] Installing utilities..."
apt-get install -y git rsync htop curl wget ufw fail2ban

# ─── 5. Configure Firewall ───────────────────────────────────────────
echo ""
echo ">>> [5/6] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw --force enable
echo "Firewall configured: SSH(22), HTTP(80), HTTPS(443) allowed."

# ─── 6. Create app directory ─────────────────────────────────────────
echo ""
echo ">>> [6/6] Setting up application directory..."
mkdir -p /opt/whatsapp-automation
chown "$SUDO_USER_NAME":"$SUDO_USER_NAME" /opt/whatsapp-automation

# ─── Configure Docker logging (prevent disk fill) ────────────────────
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

# ─── Configure fail2ban ──────────────────────────────────────────────
cat > /etc/fail2ban/jail.local << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo ""
echo "==========================================="
echo "  Setup complete!"
echo "==========================================="
echo ""
echo "NEXT STEPS:"
echo "  1. Log out and back in (for docker group to take effect)"
echo "  2. Copy your .env.gcp file to /opt/whatsapp-automation/.env.gcp"
echo "  3. Deploy via GitHub Actions or manually:"
echo "     cd /opt/whatsapp-automation"
echo "     docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp up -d"
echo ""
