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

    // วนลูปตามรอบที่มีจริงบนเว็บ พร้อม retry logic
    for (const round of availableRounds) {
      let roundSuccess = false;
      let roundAttempt = 0;
      const maxRoundAttempts = 5;

      // Retry loop for each round
      while (!roundSuccess && roundAttempt < maxRoundAttempts) {
        roundAttempt++;
        console.log(`\n📄 ========== Round ${round} ${roundAttempt > 1 ? `(Attempt ${roundAttempt}/${maxRoundAttempts})` : ''} ==========`);
        
        try {
          // เลือกรอบจาก dropdown
          const roundSelected = await selectRound(page, round);
          if (!roundSelected) {
            console.log(`⚠️ Cannot select round ${round}`);
            if (roundAttempt < maxRoundAttempts) {
              console.log(`🔄 Retrying round ${round} in 5 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }
            break;
          }

          // รอโหลด 10 วินาที
          console.log('⏳ Loading data for 10 seconds...');
          await new Promise(resolve => setTimeout(resolve, 10000));

          // ตรวจสอบข้อมูลในตารางและ refresh หากจำเป็น
          let dataCheckAttempts = 0;
          const maxDataCheckAttempts = 3;
          let hasTableData = false;

      while (!hasTableData && dataCheckAttempts < maxDataCheckAttempts) {
        dataCheckAttempts++;
        console.log(`🔍 Checking table data (attempt ${dataCheckAttempts}/${maxDataCheckAttempts})...`);

        hasTableData = await page.evaluate(() => {
          const tables = document.querySelectorAll('table');
          for (let table of tables) {
            const rows = table.querySelectorAll('tr');
            // ตรวจสอบว่ามีแถวข้อมูล (มากกว่า header row)
            if (rows.length > 1) {
              // ตรวจสอบว่ามีข้อมูลในเซลล์จริงๆ
              for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                for (let cell of cells) {
                  const text = cell.textContent.trim();
                  // ตรวจสอบข้อมูลที่มีค่า (ไม่ใช่ empty หรือ placeholder)
                  if (text && text !== '-' && text !== '' && text !== 'N/A' && text.match(/\d/)) {
                    return true; // พบข้อมูลจริง
                  }
                }
              }
            }
          }
          return false; // ไม่พบข้อมูล
        });

        if (!hasTableData && dataCheckAttempts < maxDataCheckAttempts) {
          console.log(`⚠️ No table data found, refreshing page...`);
          await page.reload({ waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // เลือกรอบใหม่หลัง refresh
          const reselected = await selectRound(page, round);
          if (!reselected) {
            console.log(`❌ Failed to reselect round ${round} after refresh`);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 8000));
        }
      }

          if (!hasTableData) {
            console.log(`⚠️ Round ${round} has no table data after ${maxDataCheckAttempts} attempts`);
            if (roundAttempt < maxRoundAttempts) {
              console.log(`🔄 Retrying round ${round} in 5 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue; // Continue to next attempt
            }
            break; // Exit retry loop if max attempts reached
          }

          console.log(`✅ Table data confirmed for round ${round}`);

          // อ่านข้อมูลจากเว็บ
          const pageInfo = await getPageInfo(page, round);

          // ตรวจสอบเวลา
          if (!isBusinessHours(pageInfo.time)) {
            console.log(`⚠️ Round ${round} is outside business hours (8:00-16:00) - Skipped`);
            roundSuccess = true; // Mark as success to avoid retry
            break;
          }

          // สร้าง PDF
          try {
            const wasGenerated = await generatePDF(page, pageInfo);
            if (wasGenerated) {
              console.log(`✅ PDF created successfully for round ${round}: ${pageInfo.date ? `uob ${pageInfo.date} #${pageInfo.round}.pdf` : 'uob-' + round + '.pdf'}`);
              roundSuccess = true; // Mark as success
            } else {
              console.log(`⚠️ File already exists for round ${round}: ${pageInfo.date ? `uob ${pageInfo.date} #${pageInfo.round}.pdf` : 'uob-' + round + '.pdf'}`);
              roundSuccess = true; // File exists is also considered success
            }
          } catch (error) {
            console.error(`❌ Error creating PDF for round ${round}:`, error.message);
            if (roundAttempt < maxRoundAttempts) {
              console.log(`🔄 Retrying round ${round} in 5 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue; // Continue to next attempt
            }
          }

        } catch (error) {
          console.error(`❌ Error in round ${round} attempt ${roundAttempt}:`, error.message);
          if (roundAttempt < maxRoundAttempts) {
            console.log(`🔄 Retrying round ${round} in 5 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue; // Continue to next attempt
          }
        }
      }

      if (!roundSuccess) {
        console.log(`❌ Round ${round} failed after ${maxRoundAttempts} attempts - Skipping`);
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
  // รอให้หน้าเว็บโหลดเสร็จสมบูรณ์ (Puppeteer)
  await page.waitForSelector('body', { timeout: 10000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ตรวจสอบและรอให้ตารางโหลดเสร็จ
  const tableExists = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    console.log(`🔍 Found ${tables.length} tables before processing`);
    
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const tableText = table.textContent.toLowerCase();
      const hasExchangeData = tableText.includes('usd') || tableText.includes('eur') || 
                             tableText.includes('gbp') || tableText.includes('jpy') ||
                             tableText.includes('buying') || tableText.includes('selling') ||
                             tableText.includes('ซื้อ') || tableText.includes('ขาย');
      
      if (hasExchangeData) {
        console.log(`✅ Exchange rate table found (Table ${i + 1})`);
        console.log(`📊 Table content preview: ${tableText.substring(0, 150)}...`);
        return true;
      }
    }
    
    console.log('⚠️ No exchange rate table found');
    return false;
  });

  if (!tableExists) {
    console.log('❌ No exchange rate table detected, skipping PDF generation');
    return false;
  }

  // จัดแต่งหน้าเว็บ
  await page.evaluate(() => {
    // ลบ td ที่มี width="25%" และ align="center" ที่มีเนื้อหาโฆษณา/ลิงก์
    const adTds = document.querySelectorAll('td[width="25%"][align="center"]');
    adTds.forEach(td => {
      const tdContent = td.innerHTML.toLowerCase();
      // ตรวจสอบว่ามีเนื้อหาโฆษณาหรือไม่
      if (tdContent.includes('tab-loan') || 
          tdContent.includes('tab-dep') || 
          tdContent.includes('tab-fw-point') ||
          tdContent.includes('announcement') ||
          tdContent.includes('รายละเอียด') ||
          tdContent.includes('style type="text/css"') ||
          tdContent.includes('InterestFont')) {
        console.log('🗑️ Removing advertisement td element');
        td.remove();
      }
    });

    // ซ่อนส่วนที่ไม่ต้องการ แต่ไม่ซ่อนตาราง
    const elementsToHide = [
      'header', 'nav', 'footer',
      '.header', '.navigation', '.footer', 
      '#header', '#nav', '#footer',
      '.advertisement', '.ads', '.banner'
    ];
    
    elementsToHide.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        el.style.display = 'none';
      });
    });

    // แทนที่จะซ่อน td ให้ตรวจสอบว่าเป็นส่วนของตารางอัตราแลกเปลี่ยนหรือไม่
    const tables = document.querySelectorAll('table');
    const exchangeTables = [];
    
    tables.forEach((table, index) => {
      const tableText = table.textContent.toLowerCase();
      const hasExchangeData = tableText.includes('usd') || tableText.includes('eur') || 
                             tableText.includes('gbp') || tableText.includes('jpy') ||
                             tableText.includes('buying') || tableText.includes('selling') ||
                             tableText.includes('ซื้อ') || tableText.includes('ขาย');
      
      if (hasExchangeData) {
        exchangeTables.push(table);
        console.log(`📋 Keeping exchange table ${index + 1}`);
        
        // จัดแต่งตารางอัตราแลกเปลี่ยน
        table.style.cssText = `
          background: white !important;
          border-collapse: collapse !important;
          width: 100% !important;
          margin: 10px 0 !important;
          display: table !important;
        `;
      } else {
        // ซ่อนตารางที่ไม่เกี่ยวข้อง
        table.style.display = 'none';
      }
    });

    // จัดแต่งเซลล์ในตารางที่เกี่ยวข้องเท่านั้น
    exchangeTables.forEach(table => {
      // ลบ column ที่ว่างออก
      const rows = table.querySelectorAll('tr');
      if (rows.length > 0) {
        const firstRow = rows[0];
        const totalColumns = firstRow.querySelectorAll('td, th').length;
        
        // ตรวจสอบแต่ละ column ว่าว่างหรือไม่
        const emptyColumns = [];
        for (let colIndex = 0; colIndex < totalColumns; colIndex++) {
          let isEmpty = true;
          
          // ตรวจสอบทุก row ใน column นี้
          for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const cells = rows[rowIndex].querySelectorAll('td, th');
            if (cells[colIndex]) {
              const cellText = cells[colIndex].textContent.trim();
              // ถือว่าว่างถ้าไม่มีข้อความ หรือมีแต่ whitespace หรือ &nbsp;
              if (cellText && cellText !== '' && cellText !== '\u00A0' && cellText !== '-') {
                isEmpty = false;
                break;
              }
            }
          }
          
          if (isEmpty) {
            emptyColumns.push(colIndex);
          }
        }
        
        // ลบ column ที่ว่างออก (ลบจากหลังไปหน้าเพื่อไม่ให้ index เปลี่ยน)
        emptyColumns.reverse().forEach(colIndex => {
          rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells[colIndex]) {
              cells[colIndex].remove();
            }
          });
        });
        
        if (emptyColumns.length > 0) {
          console.log(`🗑️ Removed ${emptyColumns.length} empty columns from table`);
        }
      }
      
      const cells = table.querySelectorAll('td, th');
      cells.forEach(cell => {
        cell.style.cssText = `
          border: 1px solid #ddd !important;
          padding: 8px !important;
          text-align: center !important;
          font-size: 14px !important;
          background: white !important;
          display: table-cell !important;
        `;
      });

      const headers = table.querySelectorAll('th');
      headers.forEach(header => {
        header.style.cssText = `
          background: #f5f5f5 !important;
          font-weight: bold !important;
          font-size: 15px !important;
          border: 1px solid #ddd !important;
          padding: 8px !important;
          text-align: center !important;
          display: table-cell !important;
        `;
      });
    });

    console.log(`✅ Processed ${exchangeTables.length} exchange rate tables`);
    return exchangeTables.length;
  });

  // เพิ่ม CSS
  await page.addStyleTag({
    content: `
      body { 
        background: white !important; 
        font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", Arial, sans-serif;
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
    headerTemplate: `<div style="font-size: 12px; text-align: center; width: 100%; font-family: 'Loma', 'Garuda', 'Kinnari', 'Norasi', 'Purisa', 'Sawasdee', 'TlwgMono', 'TlwgTypewriter', 'TlwgTypist', 'TlwgTypo', 'Umpush', 'Waree', 'Noto Sans Thai', Arial, sans-serif;">UOB - อัตราแลกเปลี่ยน ครั้งที่ ${pageInfo.round} เวลา ${pageInfo.time || 'N/A'}</div>`,
    footerTemplate: `<div style="font-size: 10px; text-align: center; width: 100%; white-space: nowrap; font-family: 'Loma', 'Garuda', 'Kinnari', 'Norasi', 'Purisa', 'Sawasdee', 'TlwgMono', 'TlwgTypewriter', 'TlwgTypist', 'TlwgTypo', 'Umpush', 'Waree', 'Noto Sans Thai', Arial, sans-serif;">อัพเดท ณ วันที่ ${pageInfo.date} เวลา ${pageInfo.time || 'N/A'} - Page <span class="pageNumber"></span></div>`
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
