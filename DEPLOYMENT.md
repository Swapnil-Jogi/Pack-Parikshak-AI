# Pack-Parikshak AI (पैक-परीक्षक एआई) - Production Deployment Guide

This guide details step-by-step procedures for deploying **Pack-Parikshak AI** into production environments with maximum security, resilience, and performance.

---

## Architecture Overview

```
                                  [ HTTPS / SSL (Port 443) ]
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │    Reverse Proxy / Load Balancer│
                             │  (Nginx / Cloudflare / Render)  │
                             └────────────────┬────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
             [ Node.js Port 8080 ]                                    │
    ┌────────────────────────────────────────┐                        │
    │ Express Application Server             │                        │
    │  - Helmet (CSP, HSTS, Secure Headers)  │                        │
    │  - Compression (Gzip / Deflate)        │                        │
    │  - Rate Limiters (Auth & Inspection)   │                        │
    │  - Connect-Mongo Session Store         │                        │
    │  - Health Probes (/api/health)         │                        │
    └──────────────────┬─────────────────────┘                        │
                       │                                              │
       ┌───────────────┴───────────────┐                              │
       ▼                               ▼                              ▼
┌──────────────┐             ┌─────────────────────┐       ┌──────────────────────┐
│  MongoDB 7   │             │ Python PaddleOCR    │       │ Cloud Storage        │
│ (Persistent) │             │ Microservice        │       │ (Cloudinary / S3)    │
│  - Collections             │ (Port 5000 / ONNX)  │       │ & SMTP Email Service │
│  - Sessions  │             │  - Preprocessor     │       └──────────────────────┘
└──────────────┘             │  - Layout Parser    │
                             └─────────────────────┘
```

---

## Deployment Option 1: Docker & Docker Compose (Recommended)

Docker Compose provides a single-command deployment with isolated containers for the unified web app and persistent MongoDB.

### Prerequisites
- Docker Engine 24.0+
- Docker Compose v2.20+

### Steps
1. **Clone repository & prepare environment:**
   ```bash
   git clone https://github.com/your-org/pack-parikshak-ai.git
   cd pack-parikshak-ai
   cp .env.example .env
   ```

2. **Configure production variables in `.env`:**
   ```env
   NODE_ENV=production
   PORT=8080
   SESSION_SECRET=generate_a_random_32_char_secret_key
   JWT_SECRET=generate_another_random_32_char_secret_key
   CLOUDINARY_CLOUD_NAME=your_cloudinary_name   # Recommended for cloud storage
   CLOUDINARY_API_KEY=your_cloudinary_key
   CLOUDINARY_API_SECRET=your_cloudinary_secret
   SMTP_HOST=smtp.gmail.com                     # For warning & show-cause notices
   SMTP_PORT=587
   SMTP_USER=enforcement.lm@gov.in
   SMTP_PASS=your_app_password
   ```

3. **Build & launch the stack:**
   ```bash
   docker compose up -d --build
   ```

4. **Verify container health:**
   ```bash
   docker compose ps
   curl -f http://localhost:8080/api/health
   ```

5. **Seed statutory data (optional):**
   ```bash
   docker compose exec web node seed.js
   ```

---

## Deployment Option 2: Cloud PaaS (Render, Railway, Fly.io)

### Deploying to Render
1. Push your repository to GitHub or GitLab.
2. In the Render Dashboard, select **New** &rarr; **Blueprint** and connect the repository.
3. Render will read `render.yaml` and configure:
   - Node.js runtime with automatic Python OCR setup
   - Production environment variables
   - Built-in Health Check Probe: `/api/health`
4. Attach a managed MongoDB database (such as **MongoDB Atlas**) and set the `MONGODB_URI` environment variable.
5. Deploy service.

### Deploying to Railway / Heroku
- A `Procfile` is pre-configured:
  ```procfile
  web: node app.js
  ```
- Ensure system buildpacks include both **Node.js** and **Python 3**.

---

## Deployment Option 3: Traditional Linux VPS (Ubuntu 22.04 / 24.04 LTS)

### 1. Install Node.js, Python & MongoDB
```bash
# Update repositories
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3, pip, and OCR system libraries
sudo apt install -y python3 python3-pip python3-venv libgl1 libglib2.0-0 nginx git

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

### 2. Setup Application
```bash
# Clone to /var/www
sudo mkdir -p /var/www/pack-parikshak
sudo chown -R $USER:$USER /var/www/pack-parikshak
git clone https://github.com/your-org/pack-parikshak-ai.git /var/www/pack-parikshak
cd /var/www/pack-parikshak

# Install Node dependencies
npm ci --omit=dev

# Setup Python virtualenv & dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r python_ocr/requirements.txt
deactivate

# Setup production environment
cp .env.example .env
nano .env
```

### 3. Start with PM2
```bash
# Create logs directory
mkdir -p logs

# Start using the production ecosystem configuration
pm2 start ecosystem.config.js

# Configure PM2 to restart on system boot
pm2 save
pm2 startup
```

### 4. Configure Nginx Reverse Proxy with SSL
Create `/etc/nginx/sites-available/pack-parikshak`:
```nginx
server {
    server_name portal.packparikshak.gov.in; # Replace with your domain

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
```

Enable site & install Let's Encrypt SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/pack-parikshak /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d portal.packparikshak.gov.in
```

---

## Production Security & Hardening Checklist

| Security Feature | Implementation | Verified |
| :--- | :--- | :--- |
| **HTTP Security Headers** | Helmet with Content-Security-Policy (CSP) tailored for Tailwind CDN, Bootstrap, FontAwesome & Cloudinary | Yes |
| **Session Security** | `connect-mongo` persistent store with 7-day TTL, `httpOnly`, `sameSite: "lax"`, and HTTPS `secure: true` in production | Yes |
| **Rate Limiting** | Strict limits on `/auth/login` and `/auth/register` (30 req / 15m), compute limits on `/inspections/upload` (60 scans / 15m) | Yes |
| **Input Validation** | Strict Joi schema validation for auth, notices, and sandbox overrides | Yes |
| **Response Compression** | Gzip / Deflate compression via `compression` middleware | Yes |
| **Reverse Proxy Trust** | `app.set("trust proxy", 1)` enabled in production | Yes |
| **Health Probes** | `/health` (HTML) and `/api/health` (JSON) monitoring DB, OCR service, memory & uptime | Yes |
| **Process Resilience** | Graceful shutdown on `SIGTERM` / `SIGINT` with connection draining and child process cleanup | Yes |

---

## Monitoring & Health Probes

External monitoring services (e.g. UptimeRobot, Datadog, AWS Route53) can probe:

```http
GET /api/health
```

Expected response (`HTTP 200 OK`):
```json
{
  "status": "healthy",
  "timestamp": "2026-09-24T04:45:00.000Z",
  "uptimeSeconds": 1420,
  "environment": "production",
  "services": {
    "web": "online",
    "database": {
      "status": "connected",
      "host": "mongodb-cluster.example.net",
      "name": "pack_parikshak"
    },
    "ocrMicroservice": {
      "status": "healthy",
      "port": 5000
    }
  },
  "system": {
    "nodeVersion": "v20.x",
    "platform": "linux",
    "memory": {
      "rss": "128.45 MB",
      "heapUsed": "42.10 MB",
      "heapTotal": "68.20 MB"
    }
  }
}
```

