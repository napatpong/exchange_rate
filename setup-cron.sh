#!/bin/bash

# Exchange Export Automation Setup Script for Ubuntu
# This script sets up automated execution every 30 minutes from 8:30 AM to 4:30 PM

echo "🚀 Setting up Exchange Export Automation..."

# Get the current directory (where the project is located)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📁 Project directory: $PROJECT_DIR"

# Create log directory
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
echo "📋 Log directory created: $LOG_DIR"

# Create the cron job entry
CRON_JOB="# Exchange Export Automation - Every 30 minutes from 8:30 AM to 4:30 PM
30,0 8-16 * * 1-5 cd $PROJECT_DIR && node exchange-export.js >> $LOG_DIR/exchange-export.log 2>&1"

# Backup existing crontab
echo "💾 Backing up existing crontab..."
crontab -l > "$PROJECT_DIR/crontab_backup_$(date +%Y%m%d_%H%M%S).txt" 2>/dev/null || echo "No existing crontab found"

# Add the new cron job
echo "⚙️ Adding cron job..."
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

# Verify the cron job was added
echo "✅ Cron job verification:"
crontab -l | grep -A 1 "Exchange Export"

echo ""
echo "🎉 Setup completed!"
echo ""
echo "📋 Schedule Details:"
echo "   • Runs every 30 minutes (at :00 and :30)"
echo "   • From 8:30 AM to 4:30 PM"
echo "   • Monday to Friday only"
echo "   • Logs saved to: $LOG_DIR/exchange-export.log"
echo ""
echo "📊 Schedule Times:"
echo "   08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30"
echo "   12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00"
echo "   15:30, 16:00, 16:30"
echo ""
echo "🔧 To remove automation: crontab -e (then delete the Exchange Export lines)"
echo "📝 To view logs: tail -f $LOG_DIR/exchange-export.log"
echo "📋 To check cron status: crontab -l"
