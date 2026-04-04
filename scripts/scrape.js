const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.crexi.com/profile/brian-weinhold-brianweinho';
const OUTPUT_PATH = path.join(__dirname, '..', 'listings.json');

async function scrapeListings() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Hide webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  const listings = [];

  try {
    console.log('Navigating to profile...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);

    // Check if page loaded with actual content
    const pageContent = await page.content();
    if (!pageContent.includes('brian') && !pageContent.includes('Weinhold') && !pageContent.includes('crexi')) {
      console.warn('Page content does not appear to contain profile data — possible bot block.');
      await browser.close();
      return null; // Signal that scraping was blocked
    }

    // --- Scrape For Sale listings ---
    console.log('Scraping For Sale listings...');
    try {
      const forSaleTab = page.locator('[id="mat-tab-group-0-label-0"]');
      await forSaleTab.click();
      await page.waitForTimeout(3000);

      const forSaleCards = await page.locator('mat-tab-group').first().locator('cui-card').all();
      console.log(`Found ${forSaleCards.length} For Sale cards`);

      for (const card of forSaleCards) {
        try {
          const linkEl = card.locator('a').first();
          const href = await linkEl.getAttribute('href').catch(() => null);
          const url = href ? `https://www.crexi.com${href}` : null;

          const priceEl = card.locator('.price, [class*="price"]').first();
          const price = await priceEl.innerText().catch(() => '');

          const nameEl = card.locator('h5, h4, .name, [class*="name"]').first();
          const name = await nameEl.innerText().catch(() => '');

          const descEl = card.locator('p, .description, [class*="description"]').first();
          const description = await descEl.innerText().catch(() => '');

          const addressEl = card.locator('h4, .address, [class*="address"]').first();
          const address = await addressEl.innerText().catch(() => '');

          if (url || name || price) {
            listings.push({
              type: 'For Sale',
              name: name.trim(),
              price: price.trim(),
              address: address.trim(),
              description: description.trim(),
              url: url || '',
            });
          }
        } catch (e) {
          console.warn('Error parsing For Sale card:', e.message);
        }
      }
    } catch (e) {
      console.warn('Error scraping For Sale tab:', e.message);
    }

    // --- Scrape For Lease listings ---
    console.log('Scraping For Lease listings...');
    try {
      const forLeaseTab = page.locator('[id="mat-tab-group-0-label-1"]');
      await forLeaseTab.click();
      await page.waitForTimeout(3000);

      const forLeaseCards = await page.locator('mat-tab-group').first().locator('cui-card').all();
      console.log(`Found ${forLeaseCards.length} For Lease cards`);

      for (const card of forLeaseCards) {
        try {
          const linkEl = card.locator('a').first();
          const href = await linkEl.getAttribute('href').catch(() => null);
          const url = href ? `https://www.crexi.com${href}` : null;

          const priceEl = card.locator('.price, [class*="price"]').first();
          const price = await priceEl.innerText().catch(() => '');

          const nameEl = card.locator('h5, h4, .name, [class*="name"]').first();
          const name = await nameEl.innerText().catch(() => '');

          const descEl = card.locator('p, .description, [class*="description"]').first();
          const description = await descEl.innerText().catch(() => '');

          const addressEl = card.locator('h4, .address, [class*="address"]').first();
          const address = await addressEl.innerText().catch(() => '');

          if (url || name || price) {
            listings.push({
              type: 'For Lease',
              name: name.trim(),
              price: price.trim(),
              address: address.trim(),
              description: description.trim(),
              url: url || '',
            });
          }
        } catch (e) {
          console.warn('Error parsing For Lease card:', e.message);
        }
      }
    } catch (e) {
      console.warn('Error scraping For Lease tab:', e.message);
    }

  } catch (e) {
    console.error('Fatal scrape error:', e.message);
  } finally {
    await browser.close();
  }

  return listings;
}

(async () => {
  const listings = await scrapeListings();

  // Safety guard: never overwrite with empty data
  if (listings === null || listings.length === 0) {
    console.warn('⚠️  Scraper returned no listings — Crexi may have blocked the request.');
    console.warn('⚠️  Keeping existing listings.json unchanged to preserve current data.');
    process.exit(0); // Exit cleanly so the workflow doesn't fail, just skips the commit
  }

  console.log(`\n✅ Scraped ${listings.length} listings total.`);

  const output = {
    lastUpdated: new Date().toISOString(),
    agent: {
      name: 'Brian Weinhold',
      title: 'Retail/Office Specialist | 20 years experience',
      brokerage: 'Vanguard Realty Group',
      location: 'Corvallis, OR',
      license: '200510090',
      profileUrl: 'https://www.crexi.com/profile/brian-weinhold-brianweinho',
    },
    listings,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Listings saved to ${OUTPUT_PATH}`);

  // Write a flag file so the workflow knows to commit
  const flagPath = path.join(__dirname, '..', '.scraper_updated');
  fs.writeFileSync(flagPath, new Date().toISOString());
  console.log('Flag file written — workflow will commit the updated listings.');
})();
