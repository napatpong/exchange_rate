const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const fsExtra = require('fs-extra');

async function exportBOTRatesToPDF() {
  let browser;
  try {
    console.log('� Loading BOT website...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();
    
    await page.goto('https://www.bot.or.th/th/statistics/exchange-rate.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log('✅ Website loaded successfully');

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Create output directory
    const now = dayjs();
    const outputDir = path.join('/mnt/synonas/exchange', 'BOT', now.format('YYYY'), now.format('MMMM'));
    await fsExtra.ensureDir(outputDir);

    // Setup download behavior
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: outputDir
    });
    
    // Wait for page to fully load and JavaScript to execute
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Scroll and interact with page first
    await page.evaluate(() => {
      // Scroll down to load buttons
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Try to click GO button first to load data
    try {
      const goButtons = await page.$$('button');
      for (const btn of goButtons) {
        const text = await btn.evaluate(el => el.textContent ? el.textContent.trim() : '');
        if (text === 'GO' || text.includes('GO')) {
          await btn.click();
          await new Promise(resolve => setTimeout(resolve, 10000));
          break;
        }
      }
    } catch (error) {
      // GO button not found
    }
    
    // Look for export buttons, PDF only
    const exportSelectors = ['.btn-export'];
    let buttonFound = false;
    
    for (const selector of exportSelectors) {
      try {
        const buttons = await page.$$(selector);
        
        if (buttons.length > 0) {
          // Try clicking only button 2 (because from testing button 2 gives PDF)
          const targetButtonIndex = 1; // Button 2 (index starts from 0)
          
          if (buttons.length > targetButtonIndex) {
            try {
              const button = buttons[targetButtonIndex];
              
              // Force click without checking visibility
              await button.evaluate(el => {
                el.click();
              });
              
              // Wait and try clicking again in case it didn't work
              await new Promise(resolve => setTimeout(resolve, 10000));
              await button.evaluate(el => {
                if (el.click) el.click();
                if (el.dispatchEvent) {
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
              });
              
              buttonFound = true;
              
              await new Promise(resolve => setTimeout(resolve, 15000));
              
              // Check downloaded files (only PDF that matches ER_PDF_DDMMYYYY.pdf pattern)
              const files = fs.readdirSync(outputDir);
              const fileNamePattern = /^ER_PDF_(\d{8})\.pdf$/;
              
              const validPdfFiles = files.filter(file => 
                file.endsWith('.pdf') && 
                !file.includes('BOT ') && 
                !file.includes('documentation') &&
                !file.endsWith('.zip') &&
                fileNamePattern.test(file) // Must match ER_PDF_DDMMYYYY.pdf pattern
              );
              
              if (validPdfFiles.length > 0) {
                
                // Take the first file that matches the pattern
                const validPdfFile = validPdfFiles[0];
                
                // Convert date from filename DDMMYYYY to YYYY-MM-DD
                const match = validPdfFile.match(fileNamePattern);
                const dateStr = match[1]; // e.g. "05092025"
                const day = dateStr.substring(0, 2);   // "05"
                const month = dateStr.substring(2, 4); // "09"
                const year = dateStr.substring(4, 8);  // "2025"
                
                const formattedDate = `${year}-${month}-${day}`; // "2025-09-05"
                const newName = `BOT ${formattedDate}.pdf`;
                
                const oldPath = path.join(outputDir, validPdfFile);
                const newPath = path.join(outputDir, newName);
                
                // Check if new file already exists
                if (fs.existsSync(newPath)) {
                  console.log(`⚠️ File already exists: ${newName}`);
                  fs.unlinkSync(oldPath); // Delete original file
                } else {
                  fs.renameSync(oldPath, newPath);
                  console.log(`✅ PDF created successfully: ${newName}`);
                }
                
                // Delete other unwanted PDF files
                const allPdfFiles = files.filter(file => 
                  file.endsWith('.pdf') && 
                  file !== validPdfFile &&
                  !file.includes('BOT ') && 
                  !file.includes('documentation')
                );
                
                allPdfFiles.forEach(file => {
                  try {
                    fs.unlinkSync(path.join(outputDir, file));
                  } catch (error) {
                    // Could not remove file
                  }
                });
                
                // Delete unwanted files (CSV, Excel, ZIP)
                const unwantedFiles = files.filter(file => 
                  (file.endsWith('.csv') || 
                   file.endsWith('.xls') || 
                   file.endsWith('.xlsx') ||
                   file.endsWith('.zip')) &&
                  !file.includes('BOT ') && 
                  !file.includes('documentation')
                );
                
                unwantedFiles.forEach(file => {
                  try {
                    fs.unlinkSync(path.join(outputDir, file));
                  } catch (error) {
                    // Could not remove file
                  }
                });
                
                return; // Exit function when PDF download is successful
              } else {
                // Delete all PDF files that don't match the pattern
                const invalidPdfFiles = files.filter(file => 
                  file.endsWith('.pdf') && 
                  !file.includes('BOT ') && 
                  !file.includes('documentation') &&
                  !fileNamePattern.test(file)
                );
                
                invalidPdfFiles.forEach(file => {
                  try {
                    fs.unlinkSync(path.join(outputDir, file));
                  } catch (error) {
                    // Could not remove file
                  }
                });
              }
            } catch (clickError) {
              // Could not click target button
            }
          }
        }
      } catch (error) {
        // Error with selector
      }
    }
    
    if (!buttonFound) {
      console.log('❌ PDF export failed - no buttons found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { exportBOTRatesToPDF };

// If this file is called directly, run the function
if (require.main === module) {
  exportBOTRatesToPDF()
    .then(() => {
      console.log('🎉 BOT export completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 BOT export failed:', error);
      process.exit(1);
    });
}
