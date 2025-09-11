const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const fs = require('fs-extra');
const path = require('path');

const BASE_URL = 'https://www.exim.go.th/th/exchange_rate/exchange.aspx';
const OUTPUT_ROOT = path.join('/mnt/synonas/exchange', 'Exim');

async function findContentFrame(page, { timeout = 15000 } = {}) {
    const roundSelector = '#p_lt_ctl02_pageplaceholder_p_lt_ctl01_WebPartZone_WebPartZone_zone_Custom_EximExchangeRate_DropDownList1';
    
    // 1. Try to find dropdown in main page first
    try {
        const mainPageDropdown = await page.$(roundSelector);
        if (mainPageDropdown) {
            return page;
        }
    } catch (_) {}

    // 2. Try to find generic dropdown in main page
    try {
        const genericDropdown = await page.$('select[id*="DropDownList1"], select[name*="DropDownList1"]');
        if (genericDropdown) {
            return page;
        }
    } catch (_) {}

    // 3. Search in iframes if not found in main page
    const deadline = Date.now() + timeout;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (Date.now() < deadline && attempts < maxAttempts) {
        attempts++;
        const frames = page.frames();
        
        for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            try {
                // Skip main frame
                if (f === page.mainFrame()) continue;
                
                const hasRound = await f.$(roundSelector);
                if (hasRound) {
                    return f;
                }
                
                const maybe = await f.$('select[id*="DropDownList1"], select[name*="DropDownList1"]');
                if (maybe) {
                    return f;
                }
            } catch (e) {
                // ignore detached frames during navigation
            }
        }
        
        // Wait and try again if not found
        if (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // 4. Final fallback: return main page
    return page;
}async function exportEximRatesToPDF() {
	console.log('🔗 Loading EXIM website...');
	const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
	const page = await browser.newPage();
	await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
	console.log('✅ Website loaded successfully');

	// 1. Close cookie popup if exists
	try {
		await page.waitForSelector('#c-p-bn', { timeout: 5000 });
		await page.click('#c-p-bn');
	} catch (e) {
		try {
			await page.waitForSelector('#c-cancel-bn', { timeout: 2000 });
			await page.click('#c-cancel-bn');
		} catch (e2) {
			try {
				await page.waitForSelector('button', { timeout: 1000 });
				await page.evaluate(() => {
					const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('ยอมรับ') || b.textContent.includes('Accept') || b.textContent.includes('ตกลง'));
					if (btn) btn.click();
				});
			} catch (e3) {
				// No cookie popup found
			}
		}
	}

	// Find frame containing the dropdown
	let frame = await findContentFrame(page, { timeout: 30000 });

    // Wait for dropdown selector in the found frame
    const roundSelector = '#p_lt_ctl02_pageplaceholder_p_lt_ctl01_WebPartZone_WebPartZone_zone_Custom_EximExchangeRate_DropDownList1';

    try {
        await frame.waitForSelector(roundSelector, { timeout: 15000 });
    } catch (e) {
        try {
            await frame.waitForSelector('select[id*="DropDownList1"], select[name*="DropDownList1"]', { timeout: 10000 });
        } catch (_) {
            console.error(`❌ Dropdown selector not found`);
            await browser.close();
            return;
        }
    }	// Get dropdown options for rounds
	const rounds = await frame.$$eval(`${roundSelector} option`, opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })).filter(o => o.value));
	if (!rounds.length) {
		console.error('❌ No options found in dropdown');
		await browser.close();
		return;
	}

	// Filter rounds within business hours (08:00-16:00)
	const validRounds = rounds.filter(round => {
		// Extract time from text like "รอบที่ 1 เวลา 08:33"
		const timeMatch = round.text.match(/(\d{2}):(\d{2})/);
		if (timeMatch) {
			const hour = parseInt(timeMatch[1]);
			const minute = parseInt(timeMatch[2]);
			const timeInMinutes = hour * 60 + minute;
			const startTime = 8 * 60; // 08:00
			const endTime = 16 * 60;   // 16:00
			return timeInMinutes >= startTime && timeInMinutes <= endTime;
		}
		return false;
	});

	console.log(`📋 Found ${validRounds.length} rounds within business hours (08:00-16:00)`);

	if (!validRounds.length) {
		console.log('⚠️ No rounds within business hours - stopping');
		await browser.close();
		return;
	}

	// Get date from webpage
	let dateStr = '';
	try {
		dateStr = await frame.$eval('#p_lt_ctl02_pageplaceholder_p_lt_ctl01_WebPartZone_WebPartZone_zone_Custom_EximExchangeRate_datetime', el => el.textContent.trim());
	} catch (e) {
		dateStr = dayjs().format('DD/MM/YYYY');
	}
	
	// Convert Thai months to English
	const thaiMonths = {
		'มกราคม': 'January', 'กุมภาพันธ์': 'February', 'มีนาคม': 'March',
		'เมษายน': 'April', 'พฤษภาคม': 'May', 'มิถุนายน': 'June',
		'กรกฎาคม': 'July', 'สิงหาคม': 'August', 'กันยายน': 'September',
		'ตุลาคม': 'October', 'พฤศจิกายน': 'November', 'ธันวาคม': 'December'
	};
	
	let englishDateStr = dateStr;
	for (const [thai, eng] of Object.entries(thaiMonths)) {
		englishDateStr = englishDateStr.replace(thai, eng);
	}
	
	const date = dayjs(englishDateStr, 'D MMMM YYYY', 'th');
	const year = date.format('YYYY');
	const monthName = date.format('MMMM');

	// Create output directory
	const outputDir = path.join(OUTPUT_ROOT, year, monthName);
	await fs.ensureDir(outputDir);

	// Check existing files and find missing rounds
	const existingFiles = [];
	const missingRounds = [];

	for (let i = 0; i < validRounds.length; i++) {
		const filename = `Exim ${date.format('YYYY-MM-DD')} #${i+1}.pdf`;
		const filepath = path.join(outputDir, filename);
		
		if (fs.existsSync(filepath)) {
			existingFiles.push({ round: validRounds[i], index: i + 1, filepath });
		} else {
			missingRounds.push({ round: validRounds[i], index: i + 1, filename, filepath });
		}
	}

	if (missingRounds.length === 0) {
		console.log('✅ All PDF files already exist');
		await browser.close();
		return;
	}

	console.log(`� Creating ${missingRounds.length} missing PDF files`);

	// Export PDFs for missing rounds only
	for (let i = 0; i < missingRounds.length; i++) {
		const { round, index, filename: targetFilename, filepath: targetFilepath } = missingRounds[i];

		// Re-find frame each round to avoid stale handles
		try {
			frame = await findContentFrame(page, { timeout: 10000 });
		} catch (e) {
			// If can't find frame, use main page instead
			frame = page;
		}

        // 2. Select round from dropdown
        try {
            await frame.select(roundSelector, round.value);
        } catch (e) {
            // fallback via evaluate (some frames may require manual change event)
            try {
                await frame.evaluate((sel, val) => {
                    const el = document.querySelector(sel) || document.querySelector('select[id*="DropDownList1"], select[name*="DropDownList1"]');
                    if (el) {
                        el.value = val;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                    return false;
                }, roundSelector, round.value);
            } catch (e2) {
                console.error(`❌ Cannot select round ${index}:`, e2.message);
                continue;
            }
        }

        // 3. Click search button to load exchange rate data
        try {
            const searchClicked = await frame.evaluate(() => {
                const btn = document.querySelector('#btnSearch') || 
                    Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]')).find(el => (el.textContent||'').includes('ค้นหา') || (el.value||'').includes('ค้นหา'));
                if (btn) {
                    (btn instanceof HTMLElement) && btn.click();
                    return true;
                }
                return false;
            });
            
            if (searchClicked) {
                // Wait for navigation or ajax loading
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                    page.waitForFunction(() => {
                        // Wait until table data appears
                        const tables = document.querySelectorAll('table');
                        return Array.from(tables).some(table => {
                            const text = table.textContent || '';
                            return text.includes('USD') && (text.includes('ซื้อ') || text.includes('ขาย'));
                        });
                    }, { timeout: 15000 }).catch(() => {})
                ]);
            }
        } catch (e) {
            // Search may not cause navigation
        }
		try {
			await Promise.all([
				page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
				frame.evaluate(() => {
					const btn = document.querySelector('#btnSearch') || 
						Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]')).find(el => (el.textContent||'').includes('ค้นหา') || (el.value||'').includes('ค้นหา'));
					if (btn) (btn instanceof HTMLElement) && btn.click();
				})
			]);
		} catch (e) {
			// Search may not cause navigation
		}

        // 4. Wait for data to load and check if page is ready
        
        // Wait a bit before checking
        await new Promise(res => setTimeout(res, 3000));

        // Check only 2 important values: hasPrintButton and hasRateData
        let pageReady = false;
        let retryCount = 0;
        const maxRetry = 3; // 3 times x 15 seconds = 45 seconds
        
        do {
            const pageStatus = await page.evaluate(() => {
                // Check Print button
                const btn = document.querySelector('#btnPrint') ||
                    Array.from(document.querySelectorAll('button,input[type="button"],a')).find(el => (el.textContent||'').includes('พิมพ์') || (el.value||'').includes('พิมพ์') || (el.textContent||'').toLowerCase().includes('print') || (el.value||'').toLowerCase().includes('print'));
                
                // Check exchange rate data
                const text = document.body.textContent || '';
                const hasRateData = text.includes('ซื้อ') || text.includes('ขาย') || text.includes('อัตรา');
                
                return {
                    hasPrintButton: !!btn,
                    hasRateData: hasRateData
                };
            });
            
            pageReady = pageStatus.hasPrintButton && pageStatus.hasRateData;
            
            if (!pageReady && retryCount < maxRetry) {
                // If no data found, refresh and start over
                if (!pageStatus.hasRateData) {
                    try {
                        // Refresh the webpage
                        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                        
                        // Wait for page to load
                        await new Promise(res => setTimeout(res, 3000));
                        
                        // Find frame again
                        frame = await findContentFrame(page, { timeout: 15000 });
                        
                        // Select round again
                        await frame.select(roundSelector, round.value);
                        
                        // Click search button again
                        const searchClicked = await frame.evaluate(() => {
                            const btn = document.querySelector('#btnSearch') || 
                                Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]')).find(el => (el.textContent||'').includes('ค้นหา') || (el.value||'').includes('ค้นหา'));
                            if (btn) {
                                (btn instanceof HTMLElement) && btn.click();
                                return true;
                            }
                            return false;
                        });
                        
                        if (searchClicked) {
                            // Wait for navigation or ajax loading
                            await Promise.race([
                                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                                page.waitForFunction(() => {
                                    const tables = document.querySelectorAll('table');
                                    return Array.from(tables).some(table => {
                                        const text = table.textContent || '';
                                        return text.includes('USD') && (text.includes('ซื้อ') || text.includes('ขาย'));
                                    });
                                }, { timeout: 10000 }).catch(() => {})
                            ]);
                        }
                    } catch (retryErr) {
                        // Retry failed
                    }
                }
                
                await new Promise(res => setTimeout(res, 15000)); // Wait 15 seconds
                retryCount++;
            }
        } while (!pageReady && retryCount < maxRetry);

        // 5. Export PDF directly
        try {
            await page.pdf({
                path: targetFilepath,
                format: 'A4',
                printBackground: true,
                margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
            });
            console.log(`✅ PDF created successfully: ${targetFilename}`);
        } catch (pdfError) {
            console.error(`❌ Cannot export PDF for round ${index}:`, pdfError.message);
        }

		// Wait before next round
		await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await browser.close();
}

module.exports = {
	exportEximRatesToPDF
};

// If this file is called directly, run the function
if (require.main === module) {
    exportEximRatesToPDF()
        .then(() => {
            console.log('🎉 EXIM export completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 EXIM export failed:', error);
            process.exit(1);
        });
}
