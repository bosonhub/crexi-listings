const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.crexi.com/profile/brian-weinhold-brianweinho';

async function scrapeListings() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const listings = [];

  try {
    console.log('Navigating to profile...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // --- Scrape For Sale listings ---
    console.log('Scraping For Sale listings...');
    const forSaleTab = page.locator('[id="mat-tab-group-0-label-0"]');
    await forSaleTab.click();
    await page.waitForTimeout(2000);

    const forSaleCards = await page.locator('mat-tab-group').first().locator('cui-card').all();
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

    // --- Scrape For Lease listings ---
    console.log('Scraping For Lease listings...');
    const forLeaseTab = page.locator('[id="mat-tab-group-0-label-1"]');
    await forLeaseTab.click();
    await page.waitForTimeout(2000);

    const forLeaseCards = await page.locator('mat-tab-group').first().locator('cui-card').all();
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

    // --- Enrich each listing with detail page data ---
    console.log(`Enriching ${listings.length} listings with detail page data...`);
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      if (!listing.url) continue;

      try {
        console.log(`  [${i + 1}/${listings.length}] ${listing.url}`);
        const detailPage = await context.newPage();
        await detailPage.goto(listing.url, { waitUntil: 'networkidle', timeout: 60000 });
        await detailPage.waitForTimeout(2000);

        // Property type
        const propTypeEl = detailPage.locator('text=Property Type').first();
        if (await propTypeEl.count() > 0) {
          const row = propTypeEl.locator('..').first();
          listing.propertyType = await row.innerText().catch(() => '');
        }

        // Building description
        const descEl = detailPage.locator('[class*="description"] p, .description p, .building-description p').first();
        if (await descEl.count() > 0) {
          listing.fullDescription = await descEl.innerText().catch(() => '');
        }

        // Square footage
        const sqftEl = detailPage.locator('text=SqFt').first();
        if (await sqftEl.count() > 0) {
          listing.sqft = await sqftEl.innerText().catch(() => '');
        }

        await detailPage.close();
      } catch (e) {
        console.warn(`  Error enriching listing ${listing.url}:`, e.message);
      }
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
  console.log(`\nScraped ${listings.length} listings total.`);

  const outputPath = path.join(__dirname, '..', 'listings.json');
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

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Listings saved to ${outputPath}`);
})();
