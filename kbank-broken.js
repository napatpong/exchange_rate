const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

// ตั้งค่า dayjs
require('dayjs/locale/th');
dayjs.locale('th');

function isBusinessHours(timeString) {
  if (!timeString) return false;

  const [hour] = timeString.split(':').map(Number);
  const isInRange = hour >= 8 && hour < 16; // 8:00-15:59
  
  return isInRange;
}
const dayjs = require('dayjs');

// ตั้งค่า dayjs
require('dayjs/locale/th');
dayjs.locale('th');

async function exportKbankRatesToPDF() {
  let browser;
  try {
    console.log('🔗 Loading website...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      if (resourceType === 'script' && (
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook') ||
        url.includes('hotjar') ||
        url.includes('cookie') ||
        url.includes('consent') ||
        url.includes('analytics') ||
        url.includes('tracking')
      )) {
        req.abort();
      } else {
        req.continue();
      }
    });
    await page.goto('https://www.kasikornbank.com/th/rate/Pages/Foreign-Exchange.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['th-TH', 'th', 'en-US', 'en'],
      });
      window.chrome = { runtime: {} };
    });
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('✅ Website loaded successfully');
    try {
      await page.waitForSelector('body', { timeout: 10000 });
    } catch (error) {
      // Continue without waiting for specific elements
    }
    try {
      const cookieSelectors = [
        '[data-testid="cookie-banner"]',
        '.cookie-consent',
        '.cookie-banner',
        '.cookie-popup',
        '.cookies-popup',
        '.gdpr-popup',
        '.consent-banner',
        '#cookie-consent',
        '#cookieConsent',
        '.modal-backdrop',
        '.cookie-overlay',
        '[class*="cookie"]',
        '[id*="cookie"]',
        'button[aria-label*="cookie"]',
        'button[aria-label*="ยอมรับ"]',
        'button[aria-label*="accept"]'
      ];
      for (const selector of cookieSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.evaluate(el => el.remove());
          }
        } catch (e) {}
      }
      const acceptButtons = await page.$$('button');
      for (const button of acceptButtons) {
        const text = await button.evaluate(el => el.textContent ? el.textContent.toLowerCase() : '');
        if (text.includes('ยอมรับ') || text.includes('accept') || text.includes('อนุญาต')) {
          await button.click();
          break;
        }
      }
    } catch (error) {
      // No cookie popups found
    }
    await page.addStyleTag({
      content: `
        header, nav, footer, .navbar, .menu, .sidebar, .advertisement, .ads {display: none !important;} 
        body {margin: 0; padding: 10px;} 
        .container {max-width: 100%;} 
        table, td, th {font-size: 18px !important;} 
        td {padding: 12px !important;} 
        th {padding: 14px !important; font-weight: bold !important;} 
        @media print { 
          @page { margin-top: 50px; margin-bottom: 30px; } 
          @page:first { margin-top: 10px; }
          table, td, th {font-size: 18px !important;}
        }
      `
    });
    
    const pageInfo = await page.evaluate(() => {
      const bodyText = document.body.textContent || document.body.innerText;
      
      // หาข้อมูลรอบ
      const roundMatch = bodyText.match(/รอบที่\s*(\d+)/);
      
      // หาข้อมูลวันที่ในรูปแบบต่างๆ
      const datePatterns = [
        /วันที่\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/,     // วันที่ 12/09/2568
        /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/,              // 12/09/2568
        /(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})/,                // 12-09-2568
        /วันที่.*?(\d{1,2})\s*(\w+)\s*(\d{4})/                    // วันที่ 12 กันยายน 2568
      ];
      
      let dateInfo = null;
      for (const pattern of datePatterns) {
        const dateMatch = bodyText.match(pattern);
        if (dateMatch) {
          let day, month, year;
          
          if (pattern === datePatterns[3]) { // กรณีเป็นชื่อเดือน
            day = parseInt(dateMatch[1]);
            const monthName = dateMatch[2];
            year = parseInt(dateMatch[3]);
            
            // แปลงชื่อเดือนไทยเป็นตัวเลข
            const thaiMonths = {
              'มกราคม': '01', 'กุมภาพันธ์': '02', 'มีนาคม': '03', 'เมษายน': '04',
              'พฤษภาคม': '05', 'มิถุนายน': '06', 'กรกฎาคม': '07', 'สิงหาคม': '08',
              'กันยายน': '09', 'ตุลาคม': '10', 'พฤศจิกายน': '11', 'ธันวาคม': '12'
            };
            month = thaiMonths[monthName] || '01';
          } else {
            day = parseInt(dateMatch[1]);
            month = parseInt(dateMatch[2]);
            year = parseInt(dateMatch[3]);
          }
          
          // แปลงปี พ.ศ. เป็น ค.ศ. ถ้าจำเป็น
          if (year > 2500) {
            year = year - 543;
          }
          
          dateInfo = {
            day: day,
            month: typeof month === 'string' ? month : String(month).padStart(2, '0'),
            year: year,
            dateString: `${year}-${typeof month === 'string' ? month : String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            found: true,
            pattern: pattern.toString(),
            matchedText: dateMatch[0]
          };
          break;
        }
      }
      
      // หาข้อมูลเวลาจากเว็บไซต์ในรูปแบบต่างๆ
      const timePatterns = [
        /เวลา\s*(\d{1,2}):(\d{2}):(\d{2})/,           // เวลา 13:10:38
        /(\d{1,2}):(\d{2}):(\d{2})\s*รอบที่/,         // 13:10:38 รอบที่
        /วันที่.*?เวลา\s*(\d{1,2}):(\d{2}):(\d{2})/,  // วันที่ xx เวลา 13:10:38
        /ล่าสุดคือ.*?เวลา\s*(\d{1,2}):(\d{2}):(\d{2})/, // ล่าสุดคือ วันที่ xx เวลา 13:10:38
        /ข้อมูล.*?(\d{1,2}):(\d{2}):(\d{2})/,         // ข้อมูล ณ เวลา 13:10:38
        /ณ\s*เวลา\s*(\d{1,2}):(\d{2}):(\d{2})/,       // ณ เวลา 13:10:38
        /(\d{1,2}):(\d{2}):(\d{2})/                   // 13:10:38 ทั่วไป
      ];
      
      let timeInfo = null;
      for (const pattern of timePatterns) {
        const timeMatch = bodyText.match(pattern);
        if (timeMatch) {
          const hour = parseInt(timeMatch[1]);
          const minute = parseInt(timeMatch[2]);
          const second = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
          timeInfo = {
            hour: hour,
            minute: minute,
            second: second,
            timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            fullTimeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
            found: true,
            pattern: pattern.toString(),
            matchedText: timeMatch[0]
          };
          break;
        }
      }
      
      // หาข้อมูลรอบ
      let roundInfo = null;
      if (roundMatch) {
        roundInfo = { 
          found: true, 
          roundNumber: parseInt(roundMatch[1]), 
          fullText: roundMatch[0]
        };
      }
      
      return { 
        date: dateInfo,
        time: timeInfo,
        round: roundInfo,
        bodyText: bodyText.substring(0, 500) // เก็บข้อความบางส่วนเพื่อ debug
      };
    });
          const second = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
          timeInfo = {
            hour: hour,
            minute: minute,
            second: second,
            timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
            found: true,
            pattern: pattern.toString(),
            matchedText: timeMatch[0]
          };
          break; // หาเจอแล้วหยุด
        }
      }
      
      if (roundMatch) {
        return { 
          found: true, 
          roundNumber: parseInt(roundMatch[1]), 
          fullText: roundMatch[0],
          timeInfo: timeInfo
        };
      }
      return { found: false, timeInfo: timeInfo };
    });
    if (roundInfo.found) {
      if (roundInfo.timeInfo && roundInfo.timeInfo.found) {
        // Keep minimal essential info only
      }
    } else {
      if (roundInfo.timeInfo && roundInfo.timeInfo.found) {
        // Keep minimal essential info only
      }
    }
    
    // เช็คช่วงเวลา 08:00-16:00 จากเวลาที่อ่านจากเว็บไซต์
    if (roundInfo.timeInfo && roundInfo.timeInfo.found) {
      const webHour = roundInfo.timeInfo.hour;
      const webMinute = roundInfo.timeInfo.minute;
      const webTime = webHour * 60 + webMinute; // เปลี่ยนเป็นนาที
      const startTime = 8 * 60;  // 08:00 = 480 นาที
      const endTime = 16 * 60;   // 16:00 = 960 นาที
      
      if (webTime < startTime || webTime > endTime) {
        if (browser) {
          await browser.close();
        }
        return;
      }
    } else {
      // Continue without time check
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.toLocaleString('en-US', { month: 'long' });
    const day = String(now.getDate()).padStart(2, '0');
    const monthNum = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = `${year}-${monthNum}-${day}`; // เปลี่ยนเป็น yyyy-mm-dd
    const folderPath = path.join('/mnt/synonas/exchange', 'K-BANK', year.toString(), month);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    let filename;
    if (roundInfo.found) {
      const roundFilename = `k-bank ${dateStr} #${roundInfo.roundNumber}.pdf`;
      const roundFilePath = path.join(folderPath, roundFilename);
      if (fs.existsSync(roundFilePath)) {
        console.log(`⚠️ File already exists: ${roundFilename}`);
        if (browser) {
          await browser.close();
        }
        return;
      }
      filename = roundFilePath;
    } else {
      let sequenceNumber = 1;
      const baseFilename = `k-bank ${dateStr}`;
      if (fs.existsSync(folderPath)) {
        const existingFiles = fs.readdirSync(folderPath);
        const todayFiles = existingFiles.filter(file => file.startsWith(baseFilename) && file.endsWith('.pdf'));
        if (todayFiles.length > 0) {
          const numbers = todayFiles.map(file => {
            const match = file.match(/#(\d+)\.pdf$/);
            return match ? parseInt(match[1]) : 0;
          });
          sequenceNumber = Math.max(...numbers) + 1;
        }
      }
      filename = path.join(folderPath, `${baseFilename} #${sequenceNumber}.pdf`);
    }
    await page.pdf({
      path: filename,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '50px',
        bottom: '200px',
        left: '20px',
        right: '20px'
      },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size: 10px; text-align: center; width: 100%; margin: 0 20px;"><span>Kasikorn Bank - Foreign Exchange Rates</span></div>`,
      footerTemplate: `<div style="font-size: 10px; text-align: center; width: 100%; margin: 0 20px;"><span>Generated on ${now.toLocaleString('th-TH')} | Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
    });
    console.log(`✅ PDF created successfully: ${path.basename(filename)}`);
  } catch (error) {
    console.error('❌ Error occurred:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// Export specific table only
async function exportSpecificTable() {
  let browser;
  try {
    console.log('🚀 Starting browser for table export...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      if (resourceType === 'script' && (
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook') ||
        url.includes('hotjar') ||
        url.includes('cookie') ||
        url.includes('consent') ||
        url.includes('analytics') ||
        url.includes('tracking')
      )) {
        req.abort();
      } else {
        req.continue();
      }
    });
    console.log('📄 Navigating to Kasikorn Bank exchange rate page...');
    await page.goto('https://www.kasikornbank.com/th/rate/Pages/Foreign-Exchange.aspx', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    try {
      await page.waitForSelector('table', { timeout: 15000 });
    } catch (error) {
      console.log('🔍 Trying alternative selectors...');
      const selectors = ['.table', '[class*="table"]', '[class*="rate"]', '.content', 'tbody'];
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 });
          break;
        } catch (e) {
          continue;
        }
      }
    }
    console.log('🍪 Closing cookie popups...');
    try {
      const cookieSelectors = [
        '[data-testid="cookie-banner"]',
        '.cookie-consent',
        '.cookie-banner',
        '.cookie-popup',
        '.cookies-popup',
        '.gdpr-popup',
        '.consent-banner',
        '#cookie-consent',
        '#cookieConsent',
        '.modal-backdrop',
        '.cookie-overlay',
        '[class*="cookie"]',
        '[id*="cookie"]'
      ];
      for (const selector of cookieSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.evaluate(el => el.remove());
          }
        } catch (e) {}
      }
    } catch (error) {
      console.log('ℹ️ No cookie popups found to close');
    }
    const tableContent = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      let mainTable = null;
      for (const table of tables) {
        const text = table.textContent.toLowerCase();
        if (text.includes('currency') || text.includes('สกุลเงิน') || text.includes('buying') || text.includes('selling') || text.includes('ซื้อ') || text.includes('ขาย')) {
          mainTable = table;
          break;
        }
      }
      if (mainTable) {
        return mainTable.outerHTML;
      }
      return null;
    });
    if (tableContent) {
      const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kasikorn Bank - Foreign Exchange Rates</title><style>body{font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", Arial, sans-serif; margin: 20px; padding: 0;}h1{text-align: center; color: #333; margin-bottom: 20px;}table{width: 100%; border-collapse: collapse; margin: 0 auto;}th, td{border: 1px solid #ddd; padding: 8px; text-align: center;}th{background-color: #f2f2f2; font-weight: bold;}tr:nth-child(even){background-color: #f9f9f9;}.header-info{text-align: center; margin-bottom: 20px; font-size: 14px; color: #666;}</style></head><body><h1>Kasikorn Bank - Foreign Exchange Rates</h1><div class="header-info">Generated on: ${new Date().toLocaleString('th-TH')}</div>${tableContent}</body></html>`;
      const tablePage = await browser.newPage();
      await tablePage.setContent(htmlContent);
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const filename = `kasikorn-table-only-${dateStr}_${timeStr}.pdf`;
      console.log('📊 Generating table-only PDF...');
      await tablePage.pdf({
        path: filename,
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
      });
      console.log(`✅ Table PDF exported successfully: ${filename}`);
      console.log(`📂 File location: ${path.resolve(filename)}`);
    } else {
      console.log('❌ Could not find exchange rate table');
    }
  } catch (error) {
    console.error('❌ Error occurred:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('🏦 Kasikorn Bank Exchange Rate Exporter');
  console.log('='.repeat(50));
  await exportKbankRatesToPDF();
  console.log('\n✨ Export completed!');
}


if (require.main === module) {
  exportKbankRatesToPDF()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 K-Bank export failed:', error);
      process.exit(1);
    });
}

module.exports = {
  exportKbankRatesToPDF,
  exportSpecificTable
};
