# AWS EC2 Deployment Guide - WhatsApp Automation Platform

Complete step-by-step guide to deploy on AWS Free Tier EC2.

---

## Cost Breakdown (6 Months)

### Option A: Full Free Tier (t3.micro) — $0/month

| Resource | Spec | Monthly Cost | 6-Month Total |
|----------|------|-------------|---------------|
| EC2 t3.micro | 2 vCPU, 1GB RAM | $0 (750 hrs free/month) | $0 |
| EBS gp3 | 30 GB | $0 (30GB free) | $0 |
| Public IPv4 | 1 address | $0 (750 hrs free) | $0 |
| Data Transfer | 100 GB/month out | $0 (free tier) | $0 |
| **Total** | | | **$0** |

> **Note:** t3.micro has only 1GB RAM. We add 2GB swap to make it work.
> PostgreSQL (300MB) + Redis (80MB) + Backend (400MB) + Nginx (50MB) = ~830MB
> With swap, this is tight but functional for low-moderate traffic.

### Option B: Comfortable (t3.small) — ~$15/month from $100 credit

| Resource | Spec | Monthly Cost | 6-Month Total |
|----------|------|-------------|---------------|
| EC2 t3.small | 2 vCPU, 2GB RAM | $15.18 | $91.08 |
| EBS gp3 | 30 GB | $0 (30GB free) | $0 |
| Public IPv4 | 1 address | $0 (750 hrs free) | $0 |
| Data Transfer | 100 GB/month out | $0 (free tier) | $0 |
| **Total** | | | **~$91** ✅ fits in $100 |

> **Recommendation:** Start with **t3.micro (free)**. If you see OOM kills or slow
> performance, upgrade to t3.small — you'll still have $100 credit to cover it.

---

## Step 1: Create AWS Account & EC2 Instance

### 1.1 — Create EC2 Instance

1. Go to [AWS Console](https://console.aws.amazon.com/) → **EC2** → **Launch Instance**

2. **Configure:**
   - **Name:** `whatsapp-automation`
   - **AMI:** Ubuntu Server 24.04 LTS (Free tier eligible)
   - **Instance type:** `t3.micro` (Free tier) or `t3.small` ($100 credit)
   - **Key pair:** Create new → Name: `wa-automation-key` → Download `.pem` file
   - **Network settings:**
     - Allow SSH from **My IP** (not 0.0.0.0/0)
     - Allow HTTP (port 80) from Anywhere
     - Allow HTTPS (port 443) from Anywhere
   - **Storage:** 30 GB gp3 (Free tier max)

3. Click **Launch Instance**

### 1.2 — Allocate Elastic IP (static IP)

1. EC2 → **Elastic IPs** → **Allocate Elastic IP address**
2. Select the IP → **Actions** → **Associate** → Select your instance
3. Note your Elastic IP: `____.____.____.____`

> This keeps your IP stable across restarts. Free while attached to a running instance.

### 1.3 — Save your key file

```bash
# On your local machine (Windows PowerShell)
mkdir ~\.ssh -Force
Move-Item .\wa-automation-key.pem ~\.ssh\
```

---

## Step 2: SSH into EC2 & Run Setup

### 2.1 — Connect to your instance

```bash
# From Windows PowerShell / Git Bash
ssh -i ~/.ssh/wa-automation-key.pem ubuntu@YOUR_ELASTIC_IP
```

### 2.2 — Run the setup script

```bash
# On the EC2 instance
sudo apt-get install -y git

# Clone your repo (we'll set up deploy key in Step 3)
# For now, just run the setup script manually:
cat << 'SETUP' > /tmp/setup-ec2.sh
#!/bin/bash
set -euo pipefail

echo "=== Updating system ==="
sudo apt-get update && sudo apt-get upgrade -y

echo "=== Installing Docker ==="
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu

echo "=== Creating 2GB Swap ==="
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
echo 'vm.vfs_cache_pressure=50' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

echo "=== Setting up project directory ==="
sudo mkdir -p /opt/whatsapp-automation/deploy
sudo chown -R ubuntu:ubuntu /opt/whatsapp-automation

echo "=== Configuring Docker logging ==="
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "storage-driver": "overlay2"
}
EOF
sudo systemctl restart docker

echo "=== Installing utilities ==="
sudo apt-get install -y htop fail2ban ufw git

echo "=== Configuring firewall ==="
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "=== Setting up fail2ban ==="
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 3600
findtime = 600
EOF
sudo systemctl enable fail2ban && sudo systemctl restart fail2ban

echo "=== Setting up weekly Docker cleanup ==="
sudo tee /etc/cron.weekly/docker-cleanup > /dev/null << 'EOF'
#!/bin/bash
docker system prune -af --volumes --filter "until=168h"
EOF
sudo chmod +x /etc/cron.weekly/docker-cleanup

echo ""
echo "=== SETUP COMPLETE ==="
echo "Log out and back in for Docker group to take effect:"
echo "  exit"
echo "  ssh -i ~/.ssh/wa-automation-key.pem ubuntu@YOUR_IP"
SETUP

chmod +x /tmp/setup-ec2.sh
/tmp/setup-ec2.sh
```

### 2.3 — Re-login for Docker permissions

```bash
exit
ssh -i ~/.ssh/wa-automation-key.pem ubuntu@YOUR_ELASTIC_IP

# Verify Docker works
docker --version
docker compose version
```

---

## Step 3: Connect EC2 to Your GitHub Private Repo

### 3.1 — Create an SSH Deploy Key on EC2

```bash
# On the EC2 instance
ssh-keygen -t ed25519 -C "ec2-deploy-key" -f ~/.ssh/github_deploy -N ""

# Copy the public key
cat ~/.ssh/github_deploy.pub
```

### 3.2 — Add Deploy Key to GitHub

1. Go to your GitHub repo → **Settings** → **Deploy keys**
2. Click **Add deploy key**
   - **Title:** `EC2 Deploy Key`
   - **Key:** Paste the public key from above
   - **Allow write access:** Leave unchecked (read-only is fine)
3. Click **Add key**

### 3.3 — Configure SSH on EC2

```bash
# On EC2
cat >> ~/.ssh/config << 'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_deploy
    IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config

# Test connection
ssh -T git@github.com
# Should say: "Hi <username>/<repo>! You've successfully authenticated..."
```

### 3.4 — Clone Your Repo

```bash
cd /opt
sudo rm -rf whatsapp-automation
git clone git@github.com:YOUR_USERNAME/YOUR_REPO.git whatsapp-automation
sudo chown -R ubuntu:ubuntu /opt/whatsapp-automation
```

---

## Step 4: Configure Environment Variables

### 4.1 — Create production .env

```bash
cd /opt/whatsapp-automation/deploy

# Copy the example
cp .env.example .env

# Generate secrets
echo ""
echo "TOKEN_ENCRYPTION_KEY:"
node -e "console.log(require('crypto').randomBytes(32).toString('hex').slice(0,32))" 2>/dev/null || openssl rand -hex 16

echo "SESSION_SECRET:"
openssl rand -hex 32

echo ""
echo "Use these values when editing .env below"
```

### 4.2 — Edit the .env file

```bash
nano /opt/whatsapp-automation/deploy/.env
```

**Critical values to change:**
- `DB_PASSWORD` — use a strong password (PostgreSQL)
- `REDIS_PASSWORD` — use a strong password (Redis is password-protected in Docker)
- `SESSION_SECRET` — paste the generated value
- `TOKEN_ENCRYPTION_KEY` — paste the generated value
- `CORS_ORIGIN` — your domain or EC2 IP (e.g., `http://YOUR_ELASTIC_IP`)
- All `META_*` / `WHATSAPP_*` values — from your Meta developer app
- `AWS_*` / `S3_*` values — from your IAM user
- `RAZORPAY_*` values — from Razorpay dashboard
- `ADMIN_PASSWORD` — strong admin password

---

## Step 5: Set Up GitHub Actions CI/CD

### 5.1 — Create an SSH key for GitHub Actions

```bash
# On your LOCAL machine (not EC2)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/ga_deploy_key -N ""

# Copy the PRIVATE key — you'll paste this into GitHub Secrets
cat ~/.ssh/ga_deploy_key

# Copy the PUBLIC key — you'll add this to EC2
cat ~/.ssh/ga_deploy_key.pub
```

### 5.2 — Add the public key to EC2

```bash
# SSH into EC2
ssh -i ~/.ssh/wa-automation-key.pem ubuntu@YOUR_ELASTIC_IP

# Add the GitHub Actions public key
echo "PASTE_THE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
```

### 5.3 — Add Secrets to GitHub Repository

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 3 secrets:

| Secret Name | Value |
|-------------|-------|
| `AWS_EC2_SSH_KEY` | Contents of `~/.ssh/ga_deploy_key` (PRIVATE key, including `-----BEGIN...` and `-----END...`) |
| `AWS_EC2_IP` | Your EC2 Elastic IP address |
| `AWS_EC2_USER` | `ubuntu` |

### 5.4 — Test the Pipeline

```bash
# On your local machine, push a commit
git add .
git commit -m "Add AWS deployment config"
git push origin main
```

Go to GitHub → **Actions** tab → watch the "Deploy to AWS EC2" workflow run.

---

## Step 6: First Deployment (Manual)

If you want to deploy before CI/CD is set up, or for the first time:

```bash
# On EC2
cd /opt/whatsapp-automation

# Pull latest code
git pull origin main

# Build and start all services
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

# Check status
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps

# Check logs
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f

# Check backend health
curl http://localhost/health/liveness

# Seed the super admin (first time only)
docker exec wa-backend node dist/database/seed-admin.js
```

> **Important:** Tenant migrations run automatically on app boot.
> The admin seed must be run manually once after first deployment.

---

## Step 7: (Optional) Set Up a Domain & SSL

### 7.1 — Point your domain

In your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):
- Add an **A record** pointing to your Elastic IP

### 7.2 — Free SSL with Let's Encrypt

```bash
# On EC2
sudo apt-get install -y certbot

# Stop frontend container temporarily
docker compose -f /opt/whatsapp-automation/deploy/docker-compose.yml --env-file /opt/whatsapp-automation/deploy/.env stop frontend

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Copy certs to deploy folder
sudo mkdir -p /opt/whatsapp-automation/deploy/nginx/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/whatsapp-automation/deploy/nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/whatsapp-automation/deploy/nginx/ssl/
sudo chown -R ubuntu:ubuntu /opt/whatsapp-automation/deploy/nginx/

# Restart frontend
docker compose -f /opt/whatsapp-automation/deploy/docker-compose.yml --env-file /opt/whatsapp-automation/deploy/.env up -d frontend

# Set up auto-renewal cron
echo "0 3 * * * root certbot renew --quiet --pre-hook 'docker stop wa-frontend' --post-hook 'cp /etc/letsencrypt/live/yourdomain.com/*.pem /opt/whatsapp-automation/deploy/nginx/ssl/ && docker start wa-frontend'" | sudo tee /etc/cron.d/certbot-renew
```

---

## Useful Commands

```bash
# ─── View logs ────────────────────────────────────────────────────
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f backend
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f postgres
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f redis

# ─── Restart a service ────────────────────────────────────────────
docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart backend

# ─── Stop everything ──────────────────────────────────────────────
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down

# ─── Check resource usage ─────────────────────────────────────────
docker stats
htop
free -h

# ─── Database backup ──────────────────────────────────────────────
docker exec wa-postgres pg_dump -U postgres whatsapp_commerce > backup_$(date +%Y%m%d).sql

# ─── Database restore ─────────────────────────────────────────────
cat backup.sql | docker exec -i wa-postgres psql -U postgres whatsapp_commerce

# ─── Rebuild after code changes ───────────────────────────────────
cd /opt/whatsapp-automation
git pull origin main
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build --no-cache
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

---

## Monitoring & Alerts

### Check if services are running
```bash
# Quick health check script
cat > /opt/whatsapp-automation/healthcheck.sh << 'EOF'
#!/bin/bash
STATUS=$(curl -sf -o /dev/null -w '%{http_code}' http://localhost/health/liveness)
if [ "$STATUS" != "200" ]; then
    echo "$(date): Backend unhealthy (HTTP $STATUS), restarting..."
    cd /opt/whatsapp-automation
    docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart backend
fi
EOF
chmod +x /opt/whatsapp-automation/healthcheck.sh

# Run every 5 minutes
echo "*/5 * * * * ubuntu /opt/whatsapp-automation/healthcheck.sh >> /var/log/wa-healthcheck.log 2>&1" | sudo tee /etc/cron.d/wa-healthcheck
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| OOM Kills | Check `dmesg | grep -i oom`. Upgrade to t3.small or reduce `DB_POOL_SIZE` to 10 |
| Disk full | Run `docker system prune -af`. Check `ncdu /` for large files |
| Backend won't start | Check `docker logs wa-backend`. Verify `.env` has all required values |
| Can't connect to DB | Verify `docker exec wa-postgres pg_isready` returns "accepting connections" |
| CI/CD fails at SSH | Verify EC2 security group allows SSH from GitHub Actions IPs |
| Slow performance | Check `docker stats` and `free -h`. Consider t3.small upgrade |
