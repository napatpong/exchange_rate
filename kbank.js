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

    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('✅ Website loaded successfully');

    // ปิด cookie popups
    try {
      const cookieSelectors = [
        '[data-testid="cookie-banner"]', '.cookie-consent', '.cookie-banner', 
        '.cookie-popup', '.cookies-popup', '.gdpr-popup', '.consent-banner',
        '#cookie-consent', '#cookieConsent', '.modal-backdrop', '.cookie-overlay',
        '[class*="cookie"]', '[id*="cookie"]', 'button[aria-label*="cookie"]',
        'button[aria-label*="ยอมรับ"]', 'button[aria-label*="accept"]'
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

    // ปรับแต่งสไตล์หน้าเว็บ
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

    // อ่านข้อมูลจากเว็บไซต์
    console.log('📖 Reading page information...');
    const pageInfo = await page.evaluate(() => {
      let debugInfo = {
        foundPatterns: [],
        elementFound: false,
        elementText: ''
      };

      // หาข้อมูลจาก element ที่ถูกต้อง
      const dateElement = document.querySelector('#ModDate') || document.querySelector('.date-data');
      
      let dateInfo = null;
      let timeInfo = null;
      let roundInfo = null;

      if (dateElement) {
        const elementText = dateElement.textContent || dateElement.innerText;
        debugInfo.elementFound = true;
        debugInfo.elementText = elementText;
        debugInfo.foundPatterns.push('Found element #ModDate: ' + elementText);
        debugInfo.foundPatterns.push('Element text cleaned: "' + elementText.replace(/\s+/g, ' ').trim() + '"');

        // แยกข้อมูลด้วยการหาตำแหน่งข้อความ
        debugInfo.foundPatterns.push('Parsing with string methods');
        
        try {
          // หาวันที่และเดือน (ใช้ Unicode range สำหรับตัวอักษรไทย)
          const dayMatch = elementText.match(/(\d{1,2})\s+([\u0E00-\u0E7F]+)\s+(\d{4})/);
          const timeMatch = elementText.match(/(\d{1,2}):(\d{2}):(\d{2})/);
          const roundMatch = elementText.match(/(\d+)$/); // เลขท้ายสุด
          
          if (dayMatch) {
            const day = parseInt(dayMatch[1]);
            const monthName = dayMatch[2];
            const year = parseInt(dayMatch[3]);
            
            // แปลงชื่อเดือนไทยเป็นตัวเลข
            const thaiMonths = {
              'มกราคม': '01', 'กุมภาพันธ์': '02', 'มีนาคม': '03', 'เมษายน': '04',
              'พฤษภาคม': '05', 'มิถุนายน': '06', 'กรกฎาคม': '07', 'สิงหาคม': '08',
              'กันยายน': '09', 'ตุลาคม': '10', 'พฤศจิกายน': '11', 'ธันวาคม': '12'
            };
            const month = thaiMonths[monthName] || '01';
            
            // แปลงปี พ.ศ. เป็น ค.ศ.
            const adYear = year > 2500 ? year - 543 : year;
            
            dateInfo = {
              day: day,
              month: month,
              year: adYear,
              dateString: `${adYear}-${month}-${String(day).padStart(2, '0')}`,
              found: true,
              matchedText: `วันที่ ${day} ${monthName} ${year}`
            };
            debugInfo.foundPatterns.push('Date parsed: ' + dateInfo.dateString);
          }
          
          if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2]);
            const second = parseInt(timeMatch[3]);
            
            timeInfo = {
              hour: hour,
              minute: minute,
              second: second,
              timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
              fullTimeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
              found: true,
              matchedText: `เวลา ${timeMatch[0]}`
            };
            debugInfo.foundPatterns.push('Time parsed: ' + timeInfo.fullTimeString);
          }
          
          if (roundMatch) {
            const round = parseInt(roundMatch[1]);
            roundInfo = {
              found: true,
              roundNumber: round,
              fullText: `รอบที่ ${round}`
            };
            debugInfo.foundPatterns.push('Round parsed: ' + round);
          }
          
        } catch (parseError) {
          debugInfo.foundPatterns.push('Parse error: ' + parseError.message);
        }
      } else {
        debugInfo.foundPatterns.push('Element #ModDate or .date-data not found');
        
        // หาวันที่แยก - ขยายการค้นหา
        const datePatterns = [
          /วันที่\s*(\d{1,2})\s*(\w+)\s*(\d{4})/,                    // วันที่ 12 กันยายน 2568
          /(\d{1,2})\s*(\w+)\s*(\d{4})\s*เวลา/,                     // 12 กันยายน 2568 เวลา
          /วันที่\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/,     // วันที่ 12/09/2568
          /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*เวลา/        // 12/09/2568 เวลา
        ];
        
        // ค้นหาทั้งใน textContent และ innerHTML
        const htmlContent = document.documentElement.innerHTML;
        const searchTexts = [bodyText, htmlContent];
        
        for (const searchText of searchTexts) {
          if (dateInfo) break;
          
          for (const pattern of datePatterns) {
            const match = searchText.match(pattern);
            if (match && !dateInfo) {
              debugInfo.foundPatterns.push('Date pattern in ' + (searchText === bodyText ? 'text' : 'HTML') + ': ' + match[0]);
              
              let day, month, year;
              if (pattern.toString().includes('\\w+')) { // ชื่อเดือน
                day = parseInt(match[1]);
                const monthName = match[2];
                year = parseInt(match[3]);
                
                const thaiMonths = {
                  'มกราคม': '01', 'กุมภาพันธ์': '02', 'มีนาคม': '03', 'เมษายน': '04',
                  'พฤษภาคม': '05', 'มิถุนายน': '06', 'กรกฎาคม': '07', 'สิงหาคม': '08',
                  'กันยายน': '09', 'ตุลาคม': '10', 'พฤศจิกายน': '11', 'ธันวาคม': '12'
                };
                month = thaiMonths[monthName] || '01';
              } else { // เลข/เลข/ปี
                day = parseInt(match[1]);
                month = String(parseInt(match[2])).padStart(2, '0');
                year = parseInt(match[3]);
              }
              
              const adYear = year > 2500 ? year - 543 : year;
              dateInfo = {
                day: day,
                month: month,
                year: adYear,
                dateString: `${adYear}-${month}-${String(day).padStart(2, '0')}`,
                found: true,
                matchedText: match[0]
              };
              break;
            }
          }
        }

        // หาเวลาแยก
        const timePatterns = [
          /เวลา\s*(\d{1,2}):(\d{2}):(\d{2})/,
          /(\d{1,2}):(\d{2}):(\d{2})\s*รอบที่/
        ];
        
        for (const pattern of timePatterns) {
          const match = bodyText.match(pattern);
          if (match && !timeInfo) {
            debugInfo.foundPatterns.push('Time pattern: ' + match[0]);
            
            const hour = parseInt(match[1]);
            const minute = parseInt(match[2]);
            const second = parseInt(match[3]);
            
            timeInfo = {
              hour: hour,
              minute: minute,
              second: second,
              timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
              fullTimeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
              found: true,
              matchedText: match[0]
            };
          }
        }

        // หารอบแยก
        const roundMatch = bodyText.match(/รอบที่\s*(\d+)/);
        if (roundMatch) {
          debugInfo.foundPatterns.push('Round pattern: ' + roundMatch[0]);
          roundInfo = {
            found: true,
            roundNumber: parseInt(roundMatch[1]),
            fullText: roundMatch[0]
          };
        }
      }

      return {
        date: dateInfo,
        time: timeInfo,
        round: roundInfo,
        debug: debugInfo
      };
    });

    console.log('📊 Page info extracted:');
    
    // แสดง debug ข้อมูล
    if (pageInfo.debug) {
      console.log('🔍 Debug - Found patterns:');
      pageInfo.debug.foundPatterns.forEach((pattern, idx) => {
        console.log(`  ${idx + 1}: ${pattern}`);
      });
      // ลบ debug text sample ที่มีปัญหา
    }

    if (pageInfo.date && pageInfo.date.found) {
      console.log(`📅 Date: ${pageInfo.date.dateString} (${pageInfo.date.matchedText})`);
    } else {
      console.log('📅 Date: Not found from website');
    }

    if (pageInfo.time && pageInfo.time.found) {
      console.log(`⏰ Time: ${pageInfo.time.fullTimeString} (${pageInfo.time.matchedText})`);
    } else {
      console.log('⏰ Time: Not found from website');
    }

    if (pageInfo.round && pageInfo.round.found) {
      console.log(`🔢 Round: ${pageInfo.round.roundNumber} (${pageInfo.round.fullText})`);
    } else {
      console.log('🔢 Round: Not found');
    }

    // ตรวจสอบช่วงเวลา 8:00-16:00
    if (pageInfo.time && pageInfo.time.found) {
      if (!isBusinessHours(pageInfo.time.timeString)) {
        console.log(`⚠️ Time ${pageInfo.time.timeString} is outside business hours (8:00-15:59) - Skipping export`);
        if (browser) {
          await browser.close();
        }
        return;
      }
      console.log(`✅ Time ${pageInfo.time.timeString} is within business hours - Proceeding with export`);
    } else {
      console.log('⚠️ Cannot determine time from website - Skipping export for safety');
      if (browser) {
        await browser.close();
      }
      return;
    }

    // กำหนดวันที่สำหรับใช้ในชื่อไฟล์
    let dateForFilename;
    if (pageInfo.date && pageInfo.date.found) {
      dateForFilename = pageInfo.date.dateString;
    } else {
      console.log('⚠️ Cannot determine date from website - Skipping export for safety');
      if (browser) {
        await browser.close();
      }
      return;
    }

    const dateParts = dateForFilename.split('-');
    const year = dateParts[0];
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[parseInt(dateParts[1])];

    // สร้างโฟลเดอร์
    const folderPath = path.join('/mnt/synonas/exchange', 'K-BANK', year, month);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`📁 Created folder: ${folderPath}`);
    }

    // กำหนดชื่อไฟล์
    let filename;
    if (pageInfo.round && pageInfo.round.found) {
      const roundFilename = `k-bank ${dateForFilename} #${pageInfo.round.roundNumber}.pdf`;
      const roundFilePath = path.join(folderPath, roundFilename);
      if (fs.existsSync(roundFilePath)) {
        console.log(`⚠️ File already exists: ${roundFilename}`);
        if (browser) {
          await browser.close();
        }
        return;
      }
      filename = roundFilePath;
      console.log(`📝 Will create: ${roundFilename}`);
    } else {
      // หาเลขรันที่ถัดไป
      let sequenceNumber = 1;
      const baseFilename = `k-bank ${dateForFilename}`;
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
      console.log(`📝 Will create: ${baseFilename} #${sequenceNumber}.pdf`);
    }

    // สร้าง PDF
    console.log('📄 Generating PDF...');
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
      footerTemplate: `<div style="font-size: 10px; text-align: center; width: 100%; margin: 0 20px;"><span>Generated on ${dayjs().format('DD/MM/YYYY HH:mm:ss')} | Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
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
  exportKbankRatesToPDF
};