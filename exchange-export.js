// exchange-export.js
// รัน export ทุกธนาคารที่มีในระบบ

const path = require('path');

async function runAllExports() {
  console.log('🚀 Starting exchange rate export for all banks...');
  
  // Kbank (Kasikorn Bank) - stub
  try {
    const kbankPath = path.resolve(__dirname, 'kbank.js');
    if (require('fs').existsSync(kbankPath)) {
      const { exportKbankRatesToPDF: exportKbank } = require('./kbank');
      await exportKbank();
      console.log('✅ KBank export completed');
    } else {
      console.log('ℹ️ KBank export not implemented yet');
    }
  } catch (err) {
    console.error('❌ KBank export failed:', err);
  }

  // Exim (Exim Bank) - stub
  try {
    const eximPath = path.resolve(__dirname, 'exim.js');
    if (require('fs').existsSync(eximPath)) {
      const { exportEximRatesToPDF: exportExim } = require('./exim');
      await exportExim();
      console.log('✅ Exim export completed');
    } else {
      console.log('ℹ️ Exim export not implemented yet');
    }
  } catch (err) {
    console.error('❌ Exim export failed:', err);
  }

  // BOT (Bank of Thailand)
  try {
    const botPath = path.resolve(__dirname, 'bot.js');
    if (require('fs').existsSync(botPath)) {
      const { exportBOTRatesToPDF: exportBOT } = require('./bot');
      await exportBOT();
      console.log('✅ BOT export completed');
    } else {
      console.log('ℹ️ BOT export not implemented yet');
    }
  } catch (err) {
    console.error('❌ BOT export failed:', err);
  }

  // BBL (Bangkok Bank)
  try {
    const bblPath = path.resolve(__dirname, 'bbl.js');
    if (require('fs').existsSync(bblPath)) {
      const { exportBBLRatesToPDF: exportBBL } = require('./bbl');
      await exportBBL();
      console.log('✅ BBL export completed');
    } else {
      console.log('ℹ️ BBL export not implemented yet');
    }
  } catch (err) {
    console.error('❌ BBL export failed:', err);
  }

  // UOB - stub
  try {
    const uobPath = path.resolve(__dirname, 'uob.js');
    if (require('fs').existsSync(uobPath)) {
      const { exportUOBRatesToPDF: exportUOB } = require('./uob');
      await exportUOB();
      console.log('✅ UOB export completed');
    } else {
      console.log('ℹ️ UOB export not implemented yet');
    }
  } catch (err) {
    console.error('❌ UOB export failed:', err);
  }
  
  console.log('🎉 All exports completed!');
}

runAllExports();
