#!/bin/bash

# Exchange Export Service Monitor
# This script helps monitor and manage the automated exchange export service

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$PROJECT_DIR/logs/exchange-export.log"

show_help() {
    echo "Exchange Export Service Monitor"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  status    - Show current cron job status"
    echo "  logs      - View recent log entries (last 50 lines)"
    echo "  tail      - Follow log file in real time"
    echo "  test      - Run a test export manually"
    echo "  install   - Install/reinstall the cron job"
    echo "  remove    - Remove the cron job"
    echo "  times     - Show execution schedule"
    echo "  help      - Show this help message"
}

show_status() {
    echo "📊 Cron Job Status:"
    if crontab -l 2>/dev/null | grep -q "exchange-export.js"; then
        echo "✅ Automation is ACTIVE"
        echo ""
        echo "Current cron job:"
        crontab -l | grep -A 1 -B 1 "exchange-export.js"
    else
        echo "❌ Automation is NOT ACTIVE"
        echo "Run './monitor.sh install' to set up automation"
    fi
    echo ""
    echo "🕐 Current time: $(date)"
    echo "📁 Project directory: $PROJECT_DIR"
    echo "📋 Log file: $LOG_FILE"
}

show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "📋 Recent log entries (last 50 lines):"
        echo "===========================================" 
        tail -50 "$LOG_FILE"
    else
        echo "📋 No log file found at: $LOG_FILE"
        echo "The automation may not have run yet."
    fi
}

tail_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "📋 Following log file (Ctrl+C to exit):"
        echo "========================================"
        tail -f "$LOG_FILE"
    else
        echo "📋 No log file found at: $LOG_FILE"
        echo "The automation may not have run yet."
    fi
}

run_test() {
    echo "🧪 Running test export..."
    echo "========================="
    cd "$PROJECT_DIR"
    node exchange-export.js
    echo ""
    echo "✅ Test completed"
}

install_cron() {
    echo "⚙️ Installing cron job..."
    "$PROJECT_DIR/setup-cron.sh"
}

remove_cron() {
    echo "🗑️ Removing cron job..."
    crontab -l 2>/dev/null | grep -v "exchange-export.js" | grep -v "Exchange Export" | crontab -
    echo "✅ Cron job removed"
}

show_times() {
    echo "⏰ Execution Schedule:"
    echo "===================="
    echo "Frequency: Every 30 minutes"
    echo "Days: Monday to Friday"
    echo "Time Range: 8:30 AM to 4:30 PM"
    echo ""
    echo "Execution Times:"
    echo "Morning:   08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30"
    echo "Afternoon: 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00"
    echo "Evening:   15:30, 16:00, 16:30"
    echo ""
    echo "Total: 17 executions per day"
}

# Main script logic
case "$1" in
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "tail")
        tail_logs
        ;;
    "test")
        run_test
        ;;
    "install")
        install_cron
        ;;
    "remove")
        remove_cron
        ;;
    "times")
        show_times
        ;;
    "help"|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
