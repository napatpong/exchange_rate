#!/bin/bash

# Log Rotation Script for Exchange Export
# This script manages log file size to prevent them from growing too large

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$PROJECT_DIR/logs/exchange-export.log"
MAX_SIZE_MB=1
BACKUP_COUNT=5

# Create logs directory if not exists
mkdir -p "$PROJECT_DIR/logs"

# Function to get file size in MB
get_file_size_mb() {
    if [ -f "$1" ]; then
        # Get size in bytes and convert to MB
        size_bytes=$(stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo "0")
        size_mb=$((size_bytes / 1024 / 1024))
        echo $size_mb
    else
        echo "0"
    fi
}

# Function to rotate logs
rotate_logs() {
    echo "$(date): Rotating log files..." >> "$LOG_FILE.rotation"
    
    # Move existing backup files
    for i in $(seq $((BACKUP_COUNT-1)) -1 1); do
        if [ -f "$LOG_FILE.$i" ]; then
            mv "$LOG_FILE.$i" "$LOG_FILE.$((i+1))"
        fi
    done
    
    # Move current log to backup
    if [ -f "$LOG_FILE" ]; then
        mv "$LOG_FILE" "$LOG_FILE.1"
    fi
    
    # Create new empty log file
    touch "$LOG_FILE"
    
    # Remove old backups beyond backup count
    for i in $(seq $((BACKUP_COUNT+1)) 10); do
        if [ -f "$LOG_FILE.$i" ]; then
            rm -f "$LOG_FILE.$i"
        fi
    done
    
    echo "$(date): Log rotation completed" >> "$LOG_FILE.rotation"
}

# Check if log file exists and its size
if [ -f "$LOG_FILE" ]; then
    current_size=$(get_file_size_mb "$LOG_FILE")
    echo "Current log file size: ${current_size}MB"
    
    if [ $current_size -ge $MAX_SIZE_MB ]; then
        echo "Log file size (${current_size}MB) exceeds limit (${MAX_SIZE_MB}MB). Rotating..."
        rotate_logs
    else
        echo "Log file size is within limits (${current_size}MB < ${MAX_SIZE_MB}MB)"
    fi
else
    echo "Log file does not exist yet"
    touch "$LOG_FILE"
fi

# Show current log files
echo ""
echo "Current log files:"
ls -lh "$PROJECT_DIR/logs/"*.log* 2>/dev/null || echo "No log files found"
