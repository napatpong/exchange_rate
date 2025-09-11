const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const dayjs = require('dayjs');

// ตั้งค่า dayjs
require('dayjs/locale/th');
dayjs.locale('th');

async function exportUOBRatesToPDF() {
  let browser;
  
  try {
    console.log('🚀 Starting browser...');
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
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    console.log('� Loading UOB website...');
    await page.goto('https://ereport.uob.co.th/UOBWebFrontService/Exchange/FxRateThNew.jsp?flags=LastFx', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // รอให้หน้าโหลดเสร็จ
    console.log('✅ Website loaded successfully');
    await new Promise(resolve => setTimeout(resolve, 15000));

    // ตรวจสอบจำนวนรอบที่มีจริงบนเว็บ
    const availableRounds = await page.evaluate(() => {
      const countSelect = document.querySelector('select[name="count_form"]');
      if (countSelect) {
        const options = Array.from(countSelect.options);
        const roundNumbers = options
          .map(opt => parseInt(opt.value))
          .filter(val => !isNaN(val) && val > 0)
          .sort((a, b) => a - b);
        return roundNumbers;
      }
      return [];
    });

    console.log(`📋 Found ${availableRounds.length} available rounds on website: [${availableRounds.join(', ')}]`);

    if (availableRounds.length === 0) {
      console.log('❌ No rounds found on website');
      return;
    }

    // วนลูปตามรอบที่มีจริงบนเว็บ
    for (const round of availableRounds) {
      console.log(`\n📄 ========== Round ${round} ==========`);
      
      // เลือกรอบจาก dropdown
      const roundSelected = await selectRound(page, round);
      if (!roundSelected) {
        console.log(`⚠️ Cannot select round ${round}`);
        continue;
      }

      // รอโหลด 10 วินาที
      console.log('⏳ Loading data for 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // อ่านข้อมูลจากเว็บ
      const pageInfo = await getPageInfo(page, round);

      // ตรวจสอบเวลา
      if (!isBusinessHours(pageInfo.time)) {
        console.log(`⚠️ Round ${round} is outside business hours (8:00-16:00) - Skipped`);
        continue;
      }

      // สร้าง PDF
      try {
        const wasGenerated = await generatePDF(page, pageInfo);
        if (wasGenerated) {
          console.log(`✅ PDF created successfully for round ${round}: ${pageInfo.date ? `uob ${pageInfo.date} #${pageInfo.round}.pdf` : 'uob-' + round + '.pdf'}`);
        } else {
          console.log(`⚠️ File already exists for round ${round}: ${pageInfo.date ? `uob ${pageInfo.date} #${pageInfo.round}.pdf` : 'uob-' + round + '.pdf'}`);
        }
      } catch (error) {
        console.error(`❌ Error creating PDF for round ${round}:`, error.message);
      }

      // รอระหว่างรอบ
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

  } catch (error) {
    console.error('❌ Error in UOB export:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function selectRound(page, targetRound) {
  const roundSelected = await page.evaluate((round) => {
    const countSelect = document.querySelector('select[name="count_form"]');
    if (countSelect) {
      const targetOption = Array.from(countSelect.options).find(opt => opt.value === round.toString());
      if (targetOption) {
        countSelect.value = round.toString();
        countSelect.dispatchEvent(new Event('change'));
        
        if (typeof chkValid4 === 'function') {
          chkValid4();
        }
        
        return true;
      }
    }
    return false;
  }, targetRound);

  if (roundSelected) {
    console.log(`✅ Round ${targetRound} selected successfully`);
  }
  
  return roundSelected;
}

async function getPageInfo(page, currentRound) {
  const pageInfo = await page.evaluate(() => {
    const allText = document.body.innerText || document.body.textContent || '';
    
    let foundInfo = {
      date: null,
      time: null,
      round: null,
      fullDateTime: null
    };
    
    // ค้นหาข้อมูลจากรูปแบบ "วันที่   10 / 09 / 2568       ครั้งที่ : 5       เวลา : 14:02:35"
    const mainPattern = /วันที่\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s+ครั้งที่\s*:\s*(\d+)\s+เวลา\s*:\s*(\d{1,2}):(\d{2}):(\d{2})/;
    const mainMatch = allText.match(mainPattern);
    
    if (mainMatch) {
      const [, day, month, year, round, hour, minute, second] = mainMatch;
      
      // แปลงปี พ.ศ. เป็น ค.ศ.
      const adYear = parseInt(year) - 543;
      
      foundInfo.date = `${adYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      foundInfo.time = `${hour.padStart(2, '0')}:${minute}`;
      foundInfo.round = round;
      foundInfo.fullDateTime = `${foundInfo.date} ${foundInfo.time}:${second}`;
      return foundInfo;
    }
    
    // หากไม่พบจากรูปแบบหลัก ลองหารูปแบบอื่น
    const datePattern = /วันที่\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/;
    const dateMatch = allText.match(datePattern);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const adYear = parseInt(year) - (parseInt(year) > 2500 ? 543 : 0);
      foundInfo.date = `${adYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    const roundPattern = /ครั้งที่\s*:\s*(\d+)/;
    const roundMatch = allText.match(roundPattern);
    if (roundMatch) {
      foundInfo.round = roundMatch[1];
    }
    
    const timePattern = /เวลา\s*:\s*(\d{1,2}):(\d{2}):(\d{2})/;
    const timeMatch = allText.match(timePattern);
    if (timeMatch) {
      foundInfo.time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    }
    
    return foundInfo;
  });

  // ถ้าไม่มีข้อมูลครั้งที่ ให้ใช้ค่าที่ส่งเข้ามา
  if (!pageInfo.round) {
    pageInfo.round = currentRound.toString();
  }

  // ถ้าไม่มีข้อมูลวันที่ ให้ใช้วันที่ปัจจุบัน
  if (!pageInfo.date) {
    pageInfo.date = dayjs().format('YYYY-MM-DD');
  }

  // ถ้าไม่มีข้อมูลเวลา ให้ใช้เวลาปัจจุบัน
  if (!pageInfo.time) {
    pageInfo.time = dayjs().format('HH:mm');
  }
  
  return pageInfo;
}

function isBusinessHours(timeString) {
  if (!timeString) {
    timeString = dayjs().format('HH:mm');
  }

  const [hour] = timeString.split(':').map(Number);
  const isInRange = hour >= 8 && hour <= 16;
  
  return isInRange;
}

async function generatePDF(page, pageInfo) {
  // จัดแต่งหน้าเว็บ
  await page.evaluate(() => {
    // ซ่อนส่วนที่ไม่ต้องการ
    const elementsToHide = [
      'header', 'nav', 'footer',
      '.header', '.navigation', '.footer',
      '#header', '#nav', '#footer'
    ];
    
    elementsToHide.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        el.style.display = 'none';
      });
    });

    // ซ่อน td ที่มี width="25%" และ align="center"
    const tdElements = document.querySelectorAll('td[width="25%"][align="center"]');
    tdElements.forEach(td => {
      td.style.display = 'none';
    });

    // จัดแต่งตาราง
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      table.style.borderCollapse = 'collapse';
      table.style.width = '100%';
      table.style.margin = '10px 0';
    });

    // จัดแต่งเซลล์
    const cells = document.querySelectorAll('td, th');
    cells.forEach(cell => {
      cell.style.border = '1px solid #ddd';
      cell.style.padding = '8px';
      cell.style.textAlign = 'center';
      cell.style.fontSize = '14px';
    });

    // จัดแต่งหัวตาราง
    const headers = document.querySelectorAll('th');
    headers.forEach(header => {
      header.style.backgroundColor = '#f5f5f5';
      header.style.fontWeight = 'bold';
    });
  });

  // เพิ่ม CSS
  await page.addStyleTag({
    content: `
      body { 
        background: white !important; 
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
      }
      * { background-color: transparent !important; }
      table { 
        background: white !important; 
        border-collapse: collapse !important;
        width: 100% !important;
        margin: 10px 0 !important;
      }
      tr, td, th { 
        background: white !important; 
        border: 1px solid #ddd !important;
        padding: 8px !important;
        text-align: center !important;
        font-size: 14px !important;
      }
      th {
        background: #f5f5f5 !important;
        font-weight: bold !important;
        font-size: 15px !important;
      }
    `
  });
  
  // รอให้การเปลี่ยนแปลงติด
  await new Promise(resolve => setTimeout(resolve, 2000));

  // สร้างชื่อไฟล์รูปแบบ yyyy-mm-dd
  const filename = `uob ${pageInfo.date} #${pageInfo.round}.pdf`;
  
  // ใช้ชื่อเดือนภาษาอังกฤษ
  const dateObj = dayjs(pageInfo.date);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[dateObj.month()];
  
  const dirPath = path.join('/mnt/synonas/exchange', 'UOB', dateObj.format('YYYY'), monthName);
  await fs.ensureDir(dirPath);
  
  const filePath = path.join(dirPath, filename);
  
  // ตรวจสอบว่าไฟล์มีอยู่แล้วหรือไม่
  if (await fs.pathExists(filePath)) {
    return false;
  }
  
  // สร้าง PDF
  await page.pdf({
    path: filePath,
    format: 'A4',
    printBackground: false,
    margin: {
      top: '60px',
      right: '20px',
      bottom: '60px',
      left: '20px'
    },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size: 12px; text-align: center; width: 100%;">UOB - อัตราแลกเปลี่ยน ครั้งที่ ${pageInfo.round} เวลา ${pageInfo.time || 'N/A'}</div>`,
    footerTemplate: `<div style="font-size: 10px; text-align: center; width: 100%; white-space: nowrap;">อัพเดท ณ วันที่ ${pageInfo.date} เวลา ${pageInfo.time || 'N/A'} - Page <span class="pageNumber"></span></div>`
  });
  
  console.log(`✅ PDF generated: ${filename}`);
  return true;
}

module.exports = { exportUOBRatesToPDF };

// สำหรับรันโดยตรง
if (require.main === module) {
  exportUOBRatesToPDF()
    .then(() => {
      console.log('🎉 UOB export completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 UOB export failed:', error);
      process.exit(1);
    });
}
