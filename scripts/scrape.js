/** Brian's featured listings only. No bypasses; fail closed on blocked/incomplete pages. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PROFILE = 'https://www.crexi.com/profile/brian-weinhold-brianweinho';
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'listings.json');
const STATUS = path.join(ROOT, 'scrape-status.json');
const FLAG = path.join(ROOT, '.scraper_updated');
const TYPES = ['For Sale', 'For Lease'];

function listingURL(value) {
  const url = new URL(value, PROFILE);
  if (url.protocol !== 'https:' || !['www.crexi.com', 'crexi.com'].includes(url.hostname) ||
      !/^\/(?:lease\/)?properties\/\d+\//.test(url.pathname)) throw new Error('Invalid listing URL');
  url.search = ''; url.hash = ''; return url.href;
}
function validate(listings, completed) {
  if (!TYPES.every(type => completed.includes(type))) throw new Error('Incomplete sale/lease collection; previous data retained');
  if (!listings.length) throw new Error('No verified listings; previous data retained');
  const seen = new Set();
  for (const item of listings) {
    if (!TYPES.includes(item.type) || !item.name?.trim() || !item.address?.trim()) throw new Error('Incomplete listing fields');
    item.url = listingURL(item.url);
    const key = item.type + ':' + item.url;
    if (seen.has(key)) throw new Error('Duplicate listing; possible tab/pagination failure');
    seen.add(key);
  }
  return listings;
}
function categories(text) {
  const rules = {office:/\boffice\b/i, industrial:/\b(industrial|warehouse|manufacturing)\b/i,
    retail:/\b(retail|storefront|shopping)\b/i, 'multi-family':/\b(multi[ -]?family|apartment|duplex|triplex)\b/i, land:/\b(land|acreage)\b/i};
  return Object.keys(rules).filter(key => rules[key].test(text));
}
function atomicJSON(filename, value) {
  const temporary = filename + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, filename);
}
async function assertAccessible(page) {
  const text = await page.locator('body').innerText();
  if (/verify (?:you are|that you are) human|access denied|unusual traffic|checking your browser|captcha/i.test(text)) {
    throw new Error('Source requires human verification or blocks access. No bypass attempted.');
  }
  if (!/Weinhold/i.test(text)) throw new Error('Profile did not render verified Brian Weinhold content');
}
async function main() {
  fs.rmSync(FLAG, {force:true});
  const started = new Date().toISOString();
  let browser, page;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}, locale:'en-US'});
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    const response = await page.goto(PROFILE, {waitUntil:'domcontentloaded', timeout:60000});
    if (!response?.ok()) throw new Error('Profile HTTP status ' + response?.status());
    await page.getByText(/Brian Weinhold/i).first().waitFor({state:'visible', timeout:30000});
    await assertAccessible(page);
    const listings = [], completed = [];
    for (const type of TYPES) {
      // Accessible names survive Angular's generated tab IDs changing.
      const tab = page.getByRole('tab', {name:new RegExp(type, 'i')});
      if (await tab.count() !== 1) throw new Error('Could not uniquely identify ' + type + ' tab');
      await tab.click();
      await page.waitForFunction(label => [...document.querySelectorAll('[role="tab"]')]
        .some(el => el.getAttribute('aria-selected') === 'true' && el.textContent.includes(label)), type);
      const panel = page.getByRole('tabpanel').filter({visible:true});
      if (await panel.count() !== 1) throw new Error('Could not identify active listing panel');
      // Wait for actual cards, not an arbitrary network-idle state or fixed sleep.
      await panel.locator('cui-card').first().waitFor({state:'visible', timeout:30000});
      await assertAccessible(page);
      const raw = await panel.locator('cui-card').evaluateAll(cards => cards.map(card => {
        const text = selectors => card.querySelector(selectors)?.textContent?.trim() || '';
        const link = card.querySelector('a[href*="/properties/"]');
        const image = card.querySelector('img');
        return {name:text('h5, .name, [class*="name"]'),
          price:text('.price, [class*="price"]'), address:text('h4, .address, [class*="address"]'),
          description:text('p, .description, [class*="description"]'),
          propertyType:text('[class*="property-type"], [class*="propertyType"]'),
          url:link?.href || '', image:image?.currentSrc || image?.src || null};
      }));
      // Do not publish a single page as a complete feed if pagination is present.
      const more = panel.getByRole('button', {name:/^(next(?: page)?|load more|show more)$/i});
      for (const button of await more.all()) if (await button.isVisible() && await button.isEnabled()) {
        throw new Error('Additional listing pages detected; publication stopped to prevent truncation');
      }
      const count = (await tab.innerText()).match(/\((\d+)\)/);
      if (count && Number(count[1]) !== raw.length) throw new Error(type + ' count does not match rendered cards');
      for (const item of raw) {
        item.url = listingURL(item.url);
        if ((type === 'For Lease') !== item.url.includes('/lease/properties/')) throw new Error('Listing does not match active tab');
        listings.push({...item, type, category:categories(item.propertyType)});
      }
      completed.push(type);
    }
    validate(listings, completed);
    const previous = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : {};
    if (previous.listings?.length && listings.length < previous.listings.length * 0.6) {
      throw new Error('Listing count dropped by more than 40%; requires review before publishing');
    }
    const output = {lastUpdated:new Date().toISOString(), coverage:'Brian Weinhold featured listings only; not all-market inventory',
      agent:previous.agent || {name:'Brian Weinhold',brokerage:'Vanguard Realty Group',profileUrl:PROFILE}, listings};
    const dryRun = process.env.DRY_RUN === 'true';
    if (!dryRun) { atomicJSON(OUTPUT, output); fs.writeFileSync(FLAG, output.lastUpdated); }
    else atomicJSON(path.join(ROOT, 'listings-candidate.json'), output);
    atomicJSON(STATUS, {attemptedAt:started, status:dryRun?'validated-dry-run':'success', count:listings.length,
      lastSuccessfulUpdate:dryRun ? previous.lastUpdated || null : output.lastUpdated});
    console.log(`${dryRun ? 'Validated candidate' : 'Published'} ${listings.length} listings`);
  } catch (error) {
    atomicJSON(STATUS, {attemptedAt:started,status:'failed',message:error.message,previousDataRetained:true});
    fs.mkdirSync(path.join(ROOT,'diagnostics'),{recursive:true});
    if (page) await page.screenshot({path:path.join(ROOT,'diagnostics','source-failure.png'),fullPage:true}).catch(()=>{});
    console.error('Scrape failed; listings.json is unchanged:', error.message);
    process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
}
function selfTest() {
  const assert = require('node:assert/strict');
  assert.equal(listingURL('/properties/123/oregon-office'), 'https://www.crexi.com/properties/123/oregon-office');
  assert.equal(listingURL('https://www.crexi.com/properties/123/oregon-office?ref=test'), 'https://www.crexi.com/properties/123/oregon-office');
  assert.throws(()=>listingURL('https://example.com/properties/123/fake'));
  assert.throws(()=>validate([], TYPES));
  const item={type:'For Sale',name:'Test',address:'123 Main St',url:'/properties/123/oregon-office'};
  assert.throws(()=>validate([{...item}], ['For Sale']));
  assert.throws(()=>validate([{...item},{...item}], TYPES));
  assert.throws(()=>validate([{...item,address:''}], TYPES));
  assert.equal(validate([{...item}], TYPES).length, 1);
  assert.deepEqual(categories('Retail / Office'), ['office','retail']);
  assert.deepEqual(categories('Unspecified'), []);
  console.log('10 data-integrity checks passed');
}
if (require.main === module) { if (process.argv.includes('--self-test')) selfTest(); else main(); }
module.exports={listingURL,validate,categories,selfTest};
