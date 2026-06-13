/**
 * Crexi Listings Scraper — Vanguard Realty Group
 * Uses Patchright (patched Playwright) for stealth bot-detection bypass.
 * Scrapes Brian Weinhold's Crexi profile for active listings,
 * then visits each listing page to extract the primary property image URL.
 *
 * Output: listings.json with full listing data including image URLs.
 */

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.crexi.com/profile/brian-weinhold-brianweinho';
const OUTPUT_PATH = path.join(__dirname, '..', 'listings.json');

// ── Stealth context options ────────────────────────────────────────────────
const CONTEXT_OPTIONS = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  },
};

// ── Image extraction helper ────────────────────────────────────────────────
/**
 * Visit a single Crexi listing page and extract the primary property image URL.
 * Returns null if no image is found or the page fails to load.
 */
async function extractListingImage(browser, listingUrl) {
  if (!listingUrl) return null;

  let ctx;
  try {
    ctx = await browser.newContext(CONTEXT_OPTIONS);
    const page = await ctx.newPage();

    console.log(`  → Fetching image from: ${listingUrl}`);
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for React SPA to render images
    await page.waitForTimeout(4000);

    // Try to find the largest property image from the Crexi CDN
    const imageUrl = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const cxImgs = imgs
        .filter(img =>
          img.src &&
          img.src.includes('images.crexi.com') &&
          img.naturalWidth > 200 &&
          img.naturalHeight > 150
        )
        .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));

      if (cxImgs.length > 0) {
        // Upgrade to a larger size variant
        return cxImgs[0].src.replace(/_\d+x\d+_resize/, '_undefinedx600_resize');
      }

      // Fallback: look for og:image meta tag
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage && ogImage.content && ogImage.content.includes('crexi')) {
        return ogImage.content;
      }

      return null;
    });

    await ctx.close();
    return imageUrl || null;

  } catch (e) {
    console.warn(`  ⚠️  Could not extract image from ${listingUrl}: ${e.message}`);
    if (ctx) { try { await ctx.close(); } catch (_) {} }
    return null;
  }
}

// ── Main scraper ───────────────────────────────────────────────────────────
async function scrapeListings() {
  console.log('Launching Patchright (stealth Chromium)...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext(CONTEXT_OPTIONS);
  const page = await context.newPage();
  const listings = [];

  try {
    console.log('Navigating to Crexi profile...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(5000);

    // Check if page loaded with actual content
    const pageContent = await page.content();
    if (
      !pageContent.includes('brian') &&
      !pageContent.includes('Weinhold') &&
      !pageContent.includes('crexi')
    ) {
      console.warn('⚠️  Page content does not appear to contain profile data — possible bot block.');
      await browser.close();
      return null;
    }

    // ── Scrape For Sale listings ──
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
              image: null,
            });
          }
        } catch (e) {
          console.warn('Error parsing For Sale card:', e.message);
        }
      }
    } catch (e) {
      console.warn('Error scraping For Sale tab:', e.message);
    }

    // ── Scrape For Lease listings ──
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
              image: null,
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
    await context.close();
  }

  // ── Image extraction pass ──────────────────────────────────────────────
  if (listings.length > 0) {
    console.log(`\nExtracting images for ${listings.length} listings...`);
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      if (listing.url) {
        listing.image = await extractListingImage(browser, listing.url);
        console.log(`  [${i + 1}/${listings.length}] ${listing.name}: ${listing.image ? '✅ image found' : '❌ no image'}`);
        if (i < listings.length - 1) {
          await new Promise(r => setTimeout(r, 2500));
        }
      }
    }
  }

  await browser.close();
  return listings;
}

// ── Entry point ────────────────────────────────────────────────────────────
(async () => {
  const listings = await scrapeListings();

  if (listings === null || listings.length === 0) {
    console.warn('⚠️  Scraper returned no listings — Crexi may have blocked the request.');
    console.warn('⚠️  Keeping existing listings.json unchanged to preserve current data.');
    process.exit(0);
  }

  console.log(`\n✅ Scraped ${listings.length} listings total.`);
  const withImages = listings.filter(l => l.image).length;
  console.log(`📸 ${withImages} listings have images, ${listings.length - withImages} do not.`);

  const output = {
    lastUpdated: new Date().toISOString(),
    agent: {
      name: 'Brian Weinhold',
      title: 'Retail/Office Specialist | 20 years experience',
      brokerage: 'Vanguard Realty Group',
      location: 'Corvallis, OR',
      license: '201213216',
      profileUrl: 'https://www.crexi.com/profile/brian-weinhold-brianweinho',
    },
    listings,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Listings saved to ${OUTPUT_PATH}`);

  const flagPath = path.join(__dirname, '..', '.scraper_updated');
  fs.writeFileSync(flagPath, new Date().toISOString());
  console.log('Flag file written — workflow will commit the updated listings.');
})();
