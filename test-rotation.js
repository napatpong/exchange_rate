const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.cwd();
const LOGS_DIR = path.join(PROJECT_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'exchange-export.log');

console.log('🔄 Testing log rotation system...');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log('📁 Created logs directory');
}

// Create a test log file with size > 1MB if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
    console.log('📝 Creating test log file...');
    const testContent = 'Test log entry '.repeat(50000); // ~750KB
    fs.writeFileSync(LOG_FILE, testContent);
    console.log('✅ Test log file created');
}

// Check current file size
const stats = fs.statSync(LOG_FILE);
const fileSizeInMB = stats.size / (1024 * 1024);
console.log(`📊 Current log file size: ${fileSizeInMB.toFixed(2)} MB`);

// Simulate log rotation logic
function rotateLogIfNeeded() {
    const stats = fs.statSync(LOG_FILE);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    if (fileSizeInMB > 1.0) {
        console.log('🔄 Log file exceeds 1MB, rotating...');
        
        // Create timestamp for archive
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const archiveFile = path.join(LOGS_DIR, `exchange-export-${timestamp}.log`);
        
        // Copy current log to archive
        fs.copyFileSync(LOG_FILE, archiveFile);
        console.log(`📦 Archived log to: ${archiveFile}`);
        
        // Clear current log
        fs.writeFileSync(LOG_FILE, '');
        console.log('🧹 Current log file cleared');
        
        // Clean old archives (keep last 5)
        const logFiles = fs.readdirSync(LOGS_DIR)
            .filter(file => file.startsWith('exchange-export-') && file.endsWith('.log'))
            .map(file => ({ name: file, path: path.join(LOGS_DIR, file) }))
            .sort((a, b) => fs.statSync(b.path).mtime - fs.statSync(a.path));
        
        if (logFiles.length > 5) {
            const toDelete = logFiles.slice(5);
            toDelete.forEach(file => {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Deleted old archive: ${file.name}`);
            });
        }
        
        return true;
    } else {
        console.log('✅ Log file size is within limits');
        return false;
    }
}

// Test the rotation
rotateLogIfNeeded();

// List current log files
console.log('\n📂 Current log files:');
const logFiles = fs.readdirSync(LOGS_DIR).filter(file => file.endsWith('.log'));
logFiles.forEach(file => {
    const filePath = path.join(LOGS_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`   ${file}: ${sizeKB} KB`);
});

console.log('\n✅ Log rotation test completed!');
