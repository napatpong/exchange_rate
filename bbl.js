const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const dayjs = require('dayjs');

async function exportBBLExchangeRates() {
  console.log('🔗 Loading Bangkok Bank website...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // Navigate to Bangkok Bank exchange rates page
    await page.goto('https://www.bangkokbank.com/th-TH/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('✅ Website loaded successfully');

    // Wait for the dropdown to load
    await page.waitForSelector('.select-time-exchange.dynamic-select select', { timeout: 10000 });

    // Get all available time options from dropdown (filter 8:00-16:00)
    const { timeOptions, debugInfo } = await page.evaluate(() => {
      const select = document.querySelector('.select-time-exchange.dynamic-select select');
      const debug = {
        selectFound: !!select,
        totalSelects: document.querySelectorAll('select').length,
        optionsCount: 0,
        allOptions: []
      };
      
      if (!select) {
        return { timeOptions: [], debugInfo: debug };
      }
      
      const options = Array.from(select.options);
      debug.optionsCount = options.length;
      
      const validOptions = [];
      
      options.forEach((option, index) => {
        const value = option.value.trim();
        const text = option.textContent.trim();
        
        debug.allOptions.push({ index, value, text });
        
        if (value && text) {
          // Check if time is between 8:00-16:00
          const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
          if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2]);
            
            if (hour >= 8 && hour <= 16) {
              validOptions.push({
                value: value,
                text: text,
                hour: hour,
                minute: minute
              });
            }
          }
        }
      });
      
      return { 
        timeOptions: validOptions.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)),
        debugInfo: debug
      };
    });

    console.log('🔍 Debug Information:');
    console.log(`  - Select element found: ${debugInfo.selectFound}`);
    console.log(`  - Total select elements on page: ${debugInfo.totalSelects}`);
    console.log(`  - Options in dropdown: ${debugInfo.optionsCount}`);
    console.log('📋 All options:');
    debugInfo.allOptions.forEach(opt => {
      console.log(`  ${opt.index}: "${opt.text}" (value: "${opt.value}")`);
    });

    console.log(`📋 Found ${timeOptions.length} valid time options:`, timeOptions.map(opt => opt.text));

    if (timeOptions.length === 0) {
      console.log('❌ No valid time options found in 8:00-16:00 range');
      await browser.close();
      return;
    }

    // Download and process logo first
    console.log('🏛️ Processing Bangkok Bank logo...');
    const logoUrl = 'https://www.bangkokbank.com/-/media/feature/identity/bbl-corporate/site-logos/logo.svg?iar=0&sc_lang=th-th&hash=F331843FC0A9C31982171CF5B6DFE284';
    
    const logoResponse = await page.goto(logoUrl);
    const logoBuffer = await logoResponse.buffer();
    
    // Convert SVG to base64 and modify all colors to black
    let logoSvg = logoBuffer.toString('utf-8');
    logoSvg = logoSvg
      .replace(/fill="[^"]*"/g, 'fill="black"')
      .replace(/stroke="[^"]*"/g, 'stroke="black"')
      .replace(/#[0-9A-Fa-f]{6}/g, '#000000')
      .replace(/#[0-9A-Fa-f]{3}/g, '#000')
      .replace(/fill:\s*[^;]+/g, 'fill: black')
      .replace(/stroke:\s*[^;]+/g, 'stroke: black')
      .replace(/color="[^"]*"/g, 'color="black"')
      .replace(/color:\s*[^;]+/g, 'color: black');
    
    const logoBase64 = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
    
    console.log('✅ Logo processed and converted to black');

    // Go back to exchange rates page
    await page.goto('https://www.bangkokbank.com/th-TH/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates', {
      waitUntil: 'networkidle2'
    });

    // Create output directory
    const now = dayjs();
    const year = now.format('YYYY');
    const month = now.format('MMMM'); // Full month name in English (January, February, etc.)
    const dateStr = now.format('YYYY-MM-DD');
    
    const dirPath = path.join('/mnt/synonas/exchange', 'BBL', year, month);
    await fs.ensureDir(dirPath);

    // Process each time option
    for (let i = 0; i < timeOptions.length; i++) {
      const option = timeOptions[i];
      const fileNumber = i + 1;
      const filename = `BBL ${dateStr} #${fileNumber}.pdf`;
      const filePath = path.join(dirPath, filename);

      // Check if file already exists
      if (await fs.pathExists(filePath)) {
        console.log(`⏭️ File already exists: ${filename} - skipping...`);
        continue;
      }

      console.log(`\n📊 Processing time option ${fileNumber}/${timeOptions.length}: ${option.text}`);

      try {
        // Wait for the selector to be available (especially important for subsequent iterations)
        try {
          await page.waitForSelector('.select-time-exchange.dynamic-select select', { timeout: 10000 });
        } catch (waitError) {
          console.log('⚠️ Primary selector not found, trying alternative selectors...');
          
          // Try alternative selectors
          const alternatives = [
            'select[name*="time"]',
            '.dynamic-select select',
            'select.form-control',
            'select'
          ];
          
          let selectorFound = false;
          for (const altSelector of alternatives) {
            try {
              await page.waitForSelector(altSelector, { timeout: 3000 });
              console.log(`✅ Found alternative selector: ${altSelector}`);
              selectorFound = true;
              break;
            } catch (e) {
              continue;
            }
          }
          
          if (!selectorFound) {
            throw new Error('No time selector found with any alternative');
          }
        }
        
        // Select the time option with error handling
        try {
          await page.select('.select-time-exchange.dynamic-select select', option.value);
          console.log(`⏰ Selected time: ${option.text}`);
        } catch (selectError) {
          console.log('⚠️ Primary selector failed, trying alternatives...');
          
          // Try alternative selection methods
          const success = await page.evaluate((optionValue) => {
            const selectors = [
              '.select-time-exchange.dynamic-select select',
              'select[name*="time"]',
              '.dynamic-select select',
              'select.form-control'
            ];
            
            for (const selector of selectors) {
              const select = document.querySelector(selector);
              if (select) {
                select.value = optionValue;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
            return false;
          }, option.value);
          
          if (!success) {
            throw new Error(`Failed to select time option: ${option.text}`);
          }
          
          console.log(`⏰ Selected time using alternative method: ${option.text}`);
        }

        // Click GO button
        await page.click('#get-fxrates');
        console.log('🔄 Clicked GO button');

        // Wait for table to update (10 seconds)
        console.log('⏳ Waiting 10 seconds for table update...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Wait for section-1 to be available
        await page.waitForSelector('#section-1', { timeout: 5000 });

        // Check if table has data
        const hasTableData = await page.evaluate(() => {
          const section1 = document.querySelector('#section-1');
          const table = section1 ? section1.querySelector('table') : null;
          const rows = table ? table.querySelectorAll('tr') : [];
          return rows.length > 1; // At least header + 1 data row
        });

        if (!hasTableData) {
          console.log(`⚠️ No table data found for ${option.text}, skipping...`);
          continue;
        }

        // Extract and clean content (remove section-2) but preserve original styling
        const contentData = await page.evaluate((selectedTime) => {
          console.log('🧹 Extracting only table content...');
          
          // Remove ALL section-2 elements
          document.querySelectorAll('#section-2, [id*="section-2"], .section-2, [class*="section-2"]').forEach(el => {
            el.remove();
          });

          // Find section-1
          const section1 = document.querySelector('#section-1');
          if (!section1) return null;

          // Find the table only
          const table = section1.querySelector('table');
          if (!table) return null;

          // Get only the table HTML
          const tableHTML = table.outerHTML;
          
          // Extract unit and note information
          let unitText = '';
          let noteTexts = [];
          
          // Look for the specific div with class "text-grey text-x-small"
          const targetDiv = document.querySelector('.text-grey.text-x-small');
          if (targetDiv) {
            console.log('🎯 Found target div with text-grey text-x-small');
            
            // Extract unit text from the first paragraph
            const unitParagraph = targetDiv.querySelector('p.pad-bot-md');
            if (unitParagraph) {
              unitText = unitParagraph.textContent.trim();
              console.log('💰 Found unit text:', unitText);
            }
            
            // Extract note title and content
            const strongElement = targetDiv.querySelector('strong');
            const allParagraphs = targetDiv.querySelectorAll('p');
            
            if (strongElement && allParagraphs.length > 1) {
              // Skip the first paragraph (unit text) and get the rest
              for (let i = 1; i < allParagraphs.length; i++) {
                const noteContent = allParagraphs[i].textContent.trim();
                if (noteContent) {
                  noteTexts.push(noteContent);
                }
              }
              console.log('📝 Found note texts:', noteTexts);
            }
          } else {
            console.log('⚠️ Target div not found');
          }
          
          // Create update text with current date and time
          const now = new Date();
          const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 
                             'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          const day = now.getDate();
          const month = thaiMonths[now.getMonth()];
          const year = now.getFullYear() + 543;
          const updateText = `อัพเดท ณ วันที่ ${day} ${month} ${year} ครั้งที่ ${selectedTime}`;
          
          // Also get the page's CSS styles
          const styles = Array.from(document.styleSheets).map(sheet => {
            try {
              return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
            } catch (e) {
              return '';
            }
          }).join('\n');

          return {
            tableHTML: tableHTML,
            styles: styles,
            updateText: updateText,
            unitText: unitText,
            noteTexts: noteTexts
          };
        }, option.text);

        if (!contentData) {
          console.log(`⚠️ No content data found for ${option.text}, skipping...`);
          continue;
        }

        // Set content with only table
        await page.setContent(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>BBL Exchange Rates</title>
            <style>
              /* Original page styles preserved */
              ${contentData.styles}
              
              /* Reset and base styles for PDF */
              * {
                box-sizing: border-box !important;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              
              body { 
                margin: 0 !important; 
                padding: 2px 5px !important; 
                background: white !important; 
                font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", sans-serif !important;
                font-size: 14px !important;
                line-height: 1.2 !important;
                color: #333 !important;
              }
              
              /* Hide any remaining section-2 references completely */
              #section-2, [id*="section-2"], .section-2, [class*="section-2"],
              *[class*="section-2"], *[id*="section-2"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
              }
              
              /* Update text styling */
              .update-info {
                text-align: left !important;
                margin: 100px 0 15px 0 !important;
                font-size: 18px !important;
                color: #333 !important;
                font-weight: bold !important;
                font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", sans-serif !important;
              }
              
              /* Unit and note styling */
              .unit-info {
                text-align: left !important;
                margin: 20px 0 10px 0 !important;
                font-size: 15px !important;
                color: #666 !important;
                font-weight: normal !important;
                font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", sans-serif !important;
                letter-spacing: -0.1px !important;
              }
              
              .note-section {
                margin: 15px 0 0 0 !important;
                font-size: 15px !important;
                color: #555 !important;
                line-height: 1.4 !important;
                text-align: left !important;
                font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", sans-serif !important;
              }
              
              .note-title {
                font-weight: bold !important;
                margin-bottom: 8px !important;
                text-align: left !important;
                font-size: 15px !important;
                font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", sans-serif !important;
              }
              
              .note-content {
                margin-bottom: 12px !important;
                text-align: left !important;
                font-size: 13px !important;
                font-family: "Loma", "Garuda", "Kinnari", "Norasi", "Purisa", "Sawasdee", "TlwgMono", "TlwgTypewriter", "TlwgTypist", "TlwgTypo", "Umpush", "Waree", "Noto Sans Thai", sans-serif !important;
                line-height: 1.3 !important;
                display: -webkit-box !important;
                -webkit-line-clamp: 2 !important;
                -webkit-box-orient: vertical !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
              }
              
              /* Table styling to match web appearance */
              table {
                page-break-inside: avoid !important;
                border-collapse: collapse !important;
                width: 100% !important;
                margin: 20px 0 0 0 !important;
                background: white !important;
                font-size: inherit !important;
              }
              
              tr {
                page-break-inside: avoid !important;
                background: white !important;
              }
              
              th, td {
                border: 1px solid #ddd !important;
                padding: 4px !important;
                text-align: center !important;
                background: white !important;
                font-size: 14px !important;
                font-weight: bold !important;
                vertical-align: middle !important;
                height: 30px !important;
                line-height: 1.2 !important;
              }
              
              th {
                background: #f8f9fa !important;
                font-weight: bold !important;
                color: #495057 !important;
                border-bottom: 2px solid #dee2e6 !important;
                font-size: 15px !important;
                height: 35px !important;
              }
              
              /* Custom column widths */
              table td:nth-child(1), table th:nth-child(1) {
                width: 15% !important;
                max-width: 15% !important;
                text-align: left !important;
                padding-left: 10px !important;
              }
              table td:nth-child(2), table th:nth-child(2) {
                width: 25% !important;
                max-width: 25% !important;
                text-align: left !important;
                padding-left: 10px !important;
              }
              table td:nth-child(3), table th:nth-child(3),
              table td:nth-child(4), table th:nth-child(4),
              table td:nth-child(5), table th:nth-child(5),
              table td:nth-child(6), table th:nth-child(6),
              table td:nth-child(7), table th:nth-child(7) {
                width: 12% !important;
                max-width: 12% !important;
              }
            </style>
          </head>
          <body>
            <div class="update-info">${contentData.updateText}</div>
            ${contentData.tableHTML}
            
            ${contentData.unitText ? `<div class="unit-info">${contentData.unitText}</div>` : ''}
            
            ${contentData.noteTexts && contentData.noteTexts.length > 0 ? `
            <div class="note-section">
              <div class="note-title">หมายเหตุ</div>
              ${contentData.noteTexts.map(note => `<div class="note-content">${note}</div>`).join('')}
            </div>
            ` : ''}
          </body>
          </html>
        `);

        console.log('✅ Content set with table only');

        // Wait for styling to apply and ensure proper rendering
        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate PDF with web-like layout
        await page.pdf({
          path: filePath,
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: `
            <div style="font-size: 10px; width: 100%; text-align: center; margin: 0; padding: 3px 0; background: white;">
              <img src="${logoBase64}" style="height: 30px; margin-bottom: 2px;" alt="Bangkok Bank Logo">
              <div style="font-size: 18px; color: #003366; font-weight: bold;">ธนาคารกรุงเทพ จำกัด (มหาชน)</div>
              <div style="font-size: 16px; color: #003366; font-weight: bold; margin-top: 25px;">อัตราแลกเปลี่ยนเงินตราต่างประเทศ</div>
            </div>
          `,
          footerTemplate: `
            <div style="font-size: 9px; width: 100%; text-align: center; margin: 0; padding: 2px 0; color: #666;">
              <span>อัตราแลกเปลี่ยนเงินตราต่างประเทศ - ธนาคารกรุงเทพ | ${option.text} | หน้า <span class="pageNumber"></span> จาก <span class="totalPages"></span></span>
            </div>
          `,
          margin: {
            top: '65px',
            right: '10px',
            bottom: '25px',
            left: '10px'
          }
        });

        console.log(`✅ PDF created: ${filename}`);

      } catch (error) {
        console.error(`❌ Error processing ${option.text}:`, error.message);
      }
      
      // Refresh page between iterations to ensure clean state (except for the last iteration)
      if (i < timeOptions.length - 1) {
        console.log('🔄 Refreshing page for next time option...');
        await page.goto('https://www.bangkokbank.com/th-TH/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates', {
          waitUntil: 'networkidle2'
        });
        // Small delay to ensure page is fully loaded
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n🎉 All BBL exchange rate exports completed! Created ${timeOptions.length} PDF files.`);

  } catch (error) {
    console.error('❌ Error in BBL exchange rate export:', error.message);
  } finally {
    await browser.close();
  }
}

// Export the function for use in other modules
module.exports = {
  exportBBLRatesToPDF: exportBBLExchangeRates
};

// Run directly if this file is executed directly
if (require.main === module) {
  exportBBLExchangeRates();
}
