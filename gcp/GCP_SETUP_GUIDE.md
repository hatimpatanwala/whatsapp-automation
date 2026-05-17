# GCP Deployment Guide - WhatsApp Commerce Platform

Complete step-by-step guide to deploy on GCP Free Tier ($300 / 90 days).

---

## Table of Contents

1. [GCP Account & VM Setup](#1-gcp-account--vm-setup)
2. [VM Configuration](#2-vm-configuration)
3. [SSH Key Setup](#3-ssh-key-setup)
4. [Server Preparation](#4-server-preparation)
5. [Environment Configuration](#5-environment-configuration)
6. [First Manual Deployment](#6-first-manual-deployment)
7. [GitHub CI/CD Setup](#7-github-cicd-setup)
8. [Domain & SSL Setup (Optional)](#8-domain--ssl-setup-optional)
9. [Post-Deployment Tasks](#9-post-deployment-tasks)
10. [Monitoring & Maintenance](#10-monitoring--maintenance)
11. [Cost Optimization](#11-cost-optimization)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. GCP Account & VM Setup

### 1.1 Create GCP Account (if not done)

1. Go to https://cloud.google.com/free
2. Sign in with your Google account
3. You get **$300 free credits for 90 days**
4. Add a billing account (credit card required but won't be charged)

### 1.2 Create a New Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown (top-left) → **New Project**
3. Name: `whatsapp-commerce` → **Create**
4. Select the new project from the dropdown

### 1.3 Create a VM Instance

1. Go to **Compute Engine** → **VM instances** (enable the API if prompted)
2. Click **Create Instance**
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `wa-commerce-vm` |
| **Region** | `asia-south1 (Mumbai)` (closest to India users) |
| **Zone** | `asia-south1-a` |
| **Machine type** | `e2-medium` (2 vCPU, 4 GB RAM) |
| **Boot disk** | Click **Change** |
| **OS** | Ubuntu 22.04 LTS |
| **Disk type** | Standard persistent disk |
| **Disk size** | 30 GB |

> **Cost estimate**: e2-medium = ~$24/month → fits within free tier.
> If you want to save more, `e2-small` (2 vCPU, 2 GB) at ~$12/month works too but will be tight with all services.

4. Under **Firewall**: Check both:
   - [x] Allow HTTP traffic
   - [x] Allow HTTPS traffic

5. Click **Create**

### 1.4 Reserve a Static IP (Important!)

1. Go to **VPC Network** → **IP addresses**
2. Find your VM's ephemeral IP → click **Reserve** (under Actions)
3. Name it `wa-commerce-ip`
4. **Note down this IP** — you'll need it for DNS, GitHub secrets, and Meta webhook config

---

## 2. VM Configuration

### 2.1 SSH into Your VM

**Option A: GCP Console (easiest)**
- Go to VM instances → click **SSH** button next to your VM

**Option B: From your local terminal**
```bash
# First time setup
gcloud compute ssh wa-commerce-vm --zone=asia-south1-a
```

### 2.2 Check VM specs

```bash
# Verify resources
free -h       # Should show ~4GB RAM
nproc         # Should show 2
df -h /       # Should show ~30GB disk
```

---

## 3. SSH Key Setup (For CI/CD)

You need an SSH key pair so GitHub Actions can deploy to your VM.

### 3.1 Generate SSH Key (on your LOCAL machine)

```bash
# Run this on your LOCAL machine (Windows PowerShell, Mac Terminal, etc.)
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/gcp_deploy_key -N ""
```

This creates two files:
- `~/.ssh/gcp_deploy_key` (private key — goes into GitHub Secrets)
- `~/.ssh/gcp_deploy_key.pub` (public key — goes onto the GCP VM)

### 3.2 Add Public Key to GCP VM

**Option A: Via GCP Console**
1. Go to **Compute Engine** → **VM instances**
2. Click your VM name → **Edit**
3. Scroll to **SSH Keys** → **Add item**
4. Paste the contents of `gcp_deploy_key.pub`
5. **Save**

**Option B: Via gcloud CLI**
```bash
# Get the public key content
cat ~/.ssh/gcp_deploy_key.pub

# Add it to the VM metadata
gcloud compute instances add-metadata wa-commerce-vm \
  --zone=asia-south1-a \
  --metadata-from-file ssh-keys=<(echo "YOUR_USERNAME:$(cat ~/.ssh/gcp_deploy_key.pub)")
```

### 3.3 Test SSH Connection

```bash
ssh -i ~/.ssh/gcp_deploy_key YOUR_USERNAME@YOUR_VM_IP
```

---

## 4. Server Preparation

SSH into your VM and run:

### 4.1 Run the Setup Script

```bash
# Download or copy the setup script to the VM
# Option 1: If you've cloned the repo already:
sudo bash /opt/whatsapp-automation/gcp/server-setup.sh

# Option 2: Copy-paste approach - create the file and run it:
# Copy contents of gcp/server-setup.sh, paste into nano, save, then:
sudo bash server-setup.sh
```

### 4.2 Verify Docker Installation

```bash
# Log out and log back in (for docker group)
exit
# SSH back in, then:
docker --version          # Should show Docker 24.x+
docker compose version    # Should show v2.x+
```

---

## 5. Environment Configuration

### 5.1 Create Production .env File on the VM

```bash
# On the GCP VM:
nano /opt/whatsapp-automation/.env.gcp
```

Copy the template from `gcp/.env.gcp.example` and fill in your actual values:

```bash
# REQUIRED — Generate strong passwords:
# For DB_PASSWORD:
openssl rand -base64 24

# For REDIS_PASSWORD:
openssl rand -base64 24

# For SESSION_SECRET:
openssl rand -hex 32

# For TOKEN_ENCRYPTION_KEY:
openssl rand -hex 32
```

**Critical values to set:**
- `DB_PASSWORD` — strong random password
- `REDIS_PASSWORD` — strong random password
- `SESSION_SECRET` — random hex string
- `TOKEN_ENCRYPTION_KEY` — 64-char hex string
- `CORS_ORIGIN` — `http://YOUR_VM_IP` (update later with domain)
- All `WHATSAPP_*` and `META_*` values from your Meta developer account
- All `RAZORPAY_*` values from your Razorpay dashboard
- All `AWS_*` values if using S3

### 5.2 Update Frontend API URL

Before deploying, update the frontend production environment to point to your GCP VM.

**On your local machine**, edit `frontend/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: '/api',  // Use relative URL since nginx proxies /api to backend
};
```

> Using `/api` (relative) is recommended because nginx proxies API requests to the backend container. This means both frontend and API are served from the same origin — no CORS issues.

---

## 6. First Manual Deployment

### 6.1 Clone Your Repo on the VM

```bash
cd /opt/whatsapp-automation

# If private repo, use a GitHub Personal Access Token:
# Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
# Create token with "Contents: Read" permission for your repo
git clone https://YOUR_GITHUB_TOKEN@github.com/YOUR_USERNAME/whatsapp-automation.git .

# If the directory already has files from rsync:
# Just make sure the code is there
ls -la
```

### 6.2 Build and Start

```bash
cd /opt/whatsapp-automation

# Build and start all services
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp up -d --build

# Watch the logs
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp logs -f

# Wait for all services to be healthy (1-3 minutes for first build)
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp ps
```

### 6.3 Verify

```bash
# Check backend health
curl http://localhost/health/liveness

# Check frontend loads
curl -I http://localhost/

# Check from outside — open browser:
# http://YOUR_VM_IP
```

### 6.4 Seed Admin User

```bash
# Run the admin seed inside the backend container
docker exec wa-gcp-backend node -e "
  // The seed script runs via the NestJS app
  console.log('Admin seeding is handled by the app on first boot');
"

# Or if you have a dedicated seed script:
docker exec wa-gcp-backend node dist/database/seed-admin.js
```

---

## 7. GitHub CI/CD Setup

### 7.1 Add GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `GCP_VM_USER` | Your SSH username (the username from the SSH key, e.g., `deploy` or your GCP username) |
| `GCP_VM_IP` | Your VM's static IP address |
| `GCP_SSH_PRIVATE_KEY` | Contents of `~/.ssh/gcp_deploy_key` (the PRIVATE key file, including `-----BEGIN` and `-----END` lines) |

### 7.2 Get the Private Key Content

```bash
# On your LOCAL machine:
cat ~/.ssh/gcp_deploy_key
# Copy the ENTIRE output including the BEGIN and END lines
```

### 7.3 Test the Pipeline

```bash
# Make a small change, commit and push to main
git add .
git commit -m "setup: add GCP deployment pipeline"
git push origin main
```

### 7.4 Monitor Deployment

1. Go to your GitHub repo → **Actions** tab
2. Click on the running workflow
3. Watch the deployment steps

### How the CI/CD Works:

```
Push to main
    ↓
GitHub Actions triggers
    ↓
Syncs code to GCP VM via rsync (excludes node_modules, .env, dist)
    ↓
SSH into VM
    ↓
docker compose build (builds backend + frontend images)
    ↓
docker compose down (stops old containers)
    ↓
docker compose up -d (starts new containers)
    ↓
Health check verification
    ↓
Done!
```

---

## 8. Domain & SSL Setup (Optional but Recommended)

### 8.1 Point Domain to VM

In your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):

| Type | Name | Value |
|------|------|-------|
| A | @ | YOUR_VM_IP |
| A | www | YOUR_VM_IP |

### 8.2 Install Certbot for SSL

SSH into your VM:

```bash
# Install certbot
sudo apt-get install -y certbot

# Stop frontend temporarily (port 80 needed for cert)
docker compose -f /opt/whatsapp-automation/gcp/docker-compose.gcp.yml --env-file /opt/whatsapp-automation/.env.gcp stop frontend

# Get SSL certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificate files will be at:
#   /etc/letsencrypt/live/yourdomain.com/fullchain.pem
#   /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 8.3 Update Nginx for SSL

Create a new nginx config. Replace `gcp/nginx.frontend.conf` content:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    location ~ ^/health(/.*)?$ {
        proxy_pass http://backend:3000;
        proxy_set_header Host $host;
    }
}
```

Update `docker-compose.gcp.yml` frontend service to mount SSL certs:

```yaml
frontend:
  # ... existing config ...
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 8.4 Auto-Renew SSL Certificate

```bash
# Add cron job for auto-renewal
sudo crontab -e
# Add this line:
0 3 * * * certbot renew --pre-hook "docker stop wa-gcp-frontend" --post-hook "docker start wa-gcp-frontend" --quiet
```

### 8.5 Update Environment

After setting up domain, update:

1. `.env.gcp` on VM:
   ```
   CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
   ```

2. Meta Developer Console — update webhook URL to `https://yourdomain.com/api/whatsapp/webhook`

---

## 9. Post-Deployment Tasks

### 9.1 Run Database Migrations

```bash
# SSH into VM
docker exec wa-gcp-backend node -r tsconfig-paths/register dist/database/tenant-migration.service.js

# Or run via npm if the script is available in dist:
docker exec wa-gcp-backend sh -c "cd /app && node dist/main.js"
# Migrations typically auto-run on startup via TypeORM
```

### 9.2 Seed Admin Account

```bash
docker exec -it wa-gcp-backend sh -c "node dist/database/seed-admin.js" 2>/dev/null || \
  echo "Seed script may need to be run differently — check scripts/ directory"
```

### 9.3 Configure Meta Webhook

1. Go to https://developers.facebook.com → Your App → WhatsApp → Configuration
2. Set Webhook URL: `http://YOUR_VM_IP/api/whatsapp/webhook` (or `https://yourdomain.com/api/whatsapp/webhook` if SSL configured)
3. Set Verify Token: same as `WHATSAPP_VERIFY_TOKEN` in your `.env.gcp`
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`

---

## 10. Monitoring & Maintenance

### 10.1 Useful Commands

```bash
# View all service status
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp ps

# View logs (all services)
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp logs -f

# View logs (specific service)
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp logs -f backend

# Restart a service
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp restart backend

# Check resource usage
docker stats

# Check disk usage
df -h
docker system df

# Clean up unused images/containers
docker system prune -f
```

### 10.2 Database Backup (Run Weekly)

```bash
# Create backup script
cat > /opt/whatsapp-automation/backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/backups"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec wa-gcp-postgres pg_dump -U postgres whatsapp_commerce | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"
# Keep only last 7 backups
ls -t $BACKUP_DIR/db_*.sql.gz | tail -n +8 | xargs rm -f 2>/dev/null
echo "Backup created: $BACKUP_DIR/db_$TIMESTAMP.sql.gz"
SCRIPT
chmod +x /opt/whatsapp-automation/backup.sh

# Add to cron (weekly backup every Sunday at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * 0 /opt/whatsapp-automation/backup.sh") | crontab -
```

### 10.3 Log Rotation

Already configured in server-setup.sh via Docker daemon.json (max 10MB, 3 files per container).

---

## 11. Cost Optimization (Stay Within Free Tier)

### Monthly Cost Breakdown (e2-medium):

| Resource | Cost |
|----------|------|
| e2-medium VM | ~$24/month |
| 30 GB standard disk | ~$1.20/month |
| Static IP (in use) | Free |
| Network egress (first 1 GB) | Free |
| **Total** | **~$25/month** |

**$300 free credit ÷ $25/month = ~12 months** (but free trial is 90 days)

### Tips to Save:
- **Don't leave PGAdmin running** — it's excluded from the GCP compose file (use `psql` CLI instead)
- **Use `e2-small`** (2 vCPU, 2 GB) if RAM is sufficient → ~$12/month
- **Set a budget alert**: Billing → Budgets & alerts → Create → Set $50/month alert
- **Stop the VM when not in use** (if this is a dev/staging environment):
  ```bash
  gcloud compute instances stop wa-commerce-vm --zone=asia-south1-a
  gcloud compute instances start wa-commerce-vm --zone=asia-south1-a
  ```

---

## 12. Troubleshooting

### Container won't start

```bash
# Check logs
docker compose -f gcp/docker-compose.gcp.yml --env-file .env.gcp logs backend

# Common issues:
# - "DB_PASSWORD is required" → .env.gcp is missing or has wrong path
# - "ECONNREFUSED postgres" → postgres not healthy yet, wait or check postgres logs
# - "ECONNREFUSED redis" → redis not started, check redis logs
```

### Backend can't connect to Postgres

```bash
# Check postgres is running
docker exec wa-gcp-postgres pg_isready -U postgres

# Check from backend container
docker exec wa-gcp-backend sh -c "wget -qO- http://localhost:3000/health/readiness"
```

### Frontend shows blank page

```bash
# Check if Angular build succeeded
docker logs wa-gcp-frontend

# Check nginx config
docker exec wa-gcp-frontend nginx -t

# Check if files exist
docker exec wa-gcp-frontend ls /usr/share/nginx/html/
```

### CI/CD deployment fails

```bash
# Test SSH manually
ssh -i ~/.ssh/gcp_deploy_key YOUR_USER@YOUR_VM_IP

# Common issues:
# - "Permission denied" → SSH key not added to VM, or wrong username
# - "Connection refused" → Firewall blocking port 22
# - "rsync: command not found" → Run: sudo apt install rsync
```

### Out of disk space

```bash
# Check what's using space
du -sh /var/lib/docker/*
docker system df

# Clean up
docker system prune -a --volumes  # WARNING: removes all unused images and volumes
```

### Out of memory (OOM kills)

```bash
# Check if containers were OOM-killed
docker inspect wa-gcp-backend | grep -i oom

# Solutions:
# 1. Upgrade to e2-medium if on e2-small
# 2. Add swap space:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Quick Reference

### File Structure

```
gcp/
├── Dockerfile.backend        # Backend production image
├── Dockerfile.frontend       # Frontend production image (Nginx)
├── docker-compose.gcp.yml    # Full stack compose
├── nginx.frontend.conf       # Nginx config for Angular SPA + API proxy
├── .env.gcp.example          # Environment template
├── server-setup.sh           # One-time VM setup script
└── GCP_SETUP_GUIDE.md        # This file

.github/workflows/
├── ci.yml                    # Existing CI (lint, test, build)
└── deploy-gcp.yml            # GCP deployment pipeline
```

### GitHub Secrets Needed

| Secret | Description |
|--------|-------------|
| `GCP_VM_USER` | SSH username for VM |
| `GCP_VM_IP` | Static IP of the VM |
| `GCP_SSH_PRIVATE_KEY` | Private SSH key (full file contents) |

### Service Architecture

```
Internet → [GCP VM :80/:443]
                ↓
           [Nginx Frontend]
          /        \
     Static       /api/*
     Files          ↓
                [NestJS Backend :3000]
                /        \
        [PostgreSQL]   [Redis]
           :5432        :6379
```
