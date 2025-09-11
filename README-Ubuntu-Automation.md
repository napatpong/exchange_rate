# Exchange Export Automation - Ubuntu Setup Guide

## 📋 Overview
This project automatically exports exchange rates from multiple banks every 30 minutes during business hours (8:30 AM - 4:30 PM, Monday-Friday) on Ubuntu.

## 🏦 Supported Banks
- **BBL** (Bangkok Bank)
- **UOB** (United Overseas Bank)
- **EXIM** (Export-Import Bank)
- **BOT** (Bank of Thailand)
- **K-BANK** (Kasikorn Bank)

## 📁 Output Location
All PDF files are saved to: `/mnt/synonas/exchange/[BANK]/[YEAR]/[MONTH]/`

## ⚙️ Prerequisites

### 1. System Requirements
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (version 18 or higher)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install additional dependencies for Puppeteer
sudo apt-get install -y \
    gconf-service libasound2 libatk1.0-0 libatk-bridge2.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
    libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 \
    libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 \
    libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
    libappindicator1 libnss3 lsb-release xdg-utils wget
```

### 2. Network Storage Access
Ensure `/mnt/synonas/exchange/` is properly mounted and accessible:
```bash
# Check if path exists and is writable
ls -la /mnt/synonas/exchange/
touch /mnt/synonas/exchange/test.txt && rm /mnt/synonas/exchange/test.txt
```

## 🚀 Installation

### 1. Clone/Copy Project
```bash
# Copy your project files to Ubuntu server
# Example location: /home/username/exchange-export
cd /home/username/exchange-export
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Automation
```bash
# Make scripts executable
chmod +x setup-cron.sh
chmod +x monitor.sh

# Install cron job
./setup-cron.sh
```

## ⏰ Schedule Details

### Execution Times
The system runs **every 30 minutes** from **8:30 AM to 4:30 PM**, **Monday to Friday**:

**Daily Schedule (17 executions):**
- **Morning:** 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
- **Afternoon:** 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00
- **Evening:** 15:30, 16:00, 16:30

### Cron Job Configuration
```bash
# Every 30 minutes from 8:30 AM to 4:30 PM, Monday to Friday
30,0 8-16 * * 1-5 cd /path/to/project && /usr/bin/node exchange-export.js >> /path/to/project/logs/exchange-export.log 2>&1
```

## 🔧 Management Commands

### Using Monitor Script
```bash
# Check automation status
./monitor.sh status

# View recent logs
./monitor.sh logs

# Follow logs in real-time
./monitor.sh tail

# Run manual test
./monitor.sh test

# Install/reinstall automation
./monitor.sh install

# Remove automation
./monitor.sh remove

# Show execution schedule
./monitor.sh times

# Show help
./monitor.sh help
```

### Manual Cron Management
```bash
# View current cron jobs
crontab -l

# Edit cron jobs
crontab -e

# Check cron service status
sudo systemctl status cron

# Restart cron service
sudo systemctl restart cron
```

## 📋 Monitoring & Logs

### Log Location
```bash
# Main log file
/path/to/project/logs/exchange-export.log

# View recent entries
tail -50 /path/to/project/logs/exchange-export.log

# Follow logs in real-time
tail -f /path/to/project/logs/exchange-export.log
```

### Log Rotation (Optional)
To prevent logs from growing too large:
```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/exchange-export

# Add the following content:
/path/to/project/logs/exchange-export.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

## 🔍 Troubleshooting

### Common Issues

1. **Permission Denied**
   ```bash
   chmod +x setup-cron.sh monitor.sh
   ```

2. **Network Path Not Accessible**
   ```bash
   # Check mount point
   df -h | grep synonas
   
   # Test write access
   touch /mnt/synonas/exchange/test.txt
   ```

3. **Node.js Not Found**
   ```bash
   # Find Node.js path
   which node
   
   # Update cron job with full path
   crontab -e
   ```

4. **Puppeteer Issues**
   ```bash
   # Install Chrome dependencies
   sudo apt-get install -y chromium-browser
   
   # Set environment variable
   export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   ```

### Debug Mode
Run manually to check for errors:
```bash
cd /path/to/project
node exchange-export.js
```

## 📊 File Output Structure
```
/mnt/synonas/exchange/
├── BBL/
│   └── 2025/
│       └── September/
│           ├── BBL 2025-09-11 #1.pdf
│           └── BBL 2025-09-11 #2.pdf
├── UOB/
│   └── 2025/
│       └── September/
│           └── uob 2025-09-11 #1.pdf
├── EXIM/
│   └── 2025/
│       └── September/
│           ├── Exim 2025-09-11 #1.pdf
│           └── Exim 2025-09-11 #2.pdf
├── BOT/
│   └── 2025/
│       └── September/
│           └── BOT 2025-09-11.pdf
└── K-BANK/
    └── 2025/
        └── September/
            └── k-bank 2025-09-11 #3.pdf
```

## 🔧 Maintenance

### Weekly Tasks
- Check log files for errors
- Verify PDF generation
- Monitor disk space

### Monthly Tasks
- Review automation performance
- Update dependencies if needed
- Clean old log files

### Commands for Maintenance
```bash
# Check system status
./monitor.sh status

# Check recent activity
./monitor.sh logs

# Test current functionality
./monitor.sh test
```
