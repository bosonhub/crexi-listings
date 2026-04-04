# Brian Weinhold – Crexi Listings Page

An automatically-updating webpage that displays all active commercial real estate listings for **Brian Weinhold** of **Vanguard Realty Group**, sourced from his [Crexi profile](https://www.crexi.com/profile/brian-weinhold-brianweinho).

## How It Works

1. **GitHub Actions** runs a scheduled job every day at 6:00 AM UTC
2. The job launches a headless Chromium browser (via **Playwright**) and visits Brian's Crexi profile
3. It scrapes all active For Sale and For Lease listings and saves them to `listings.json`
4. The updated `listings.json` is committed back to the repo automatically
5. **GitHub Pages** serves `index.html`, which reads `listings.json` and renders the cards

## Setup Instructions

### 1. Fork or clone this repository to your GitHub account

### 2. Enable GitHub Pages
- Go to **Settings → Pages**
- Set **Source** to `Deploy from a branch`
- Set **Branch** to `main` and folder to `/ (root)`
- Click **Save**
- Your site will be live at: `https://<your-username>.github.io/<repo-name>/`

### 3. Enable GitHub Actions
- Go to **Actions** tab
- If prompted, click **"I understand my workflows, go ahead and enable them"**
- The scraper will now run automatically every day at 6 AM UTC
- You can also trigger it manually from the Actions tab → **"Scrape Crexi Listings"** → **"Run workflow"**

## Files

| File | Purpose |
|---|---|
| `index.html` | The public-facing webpage |
| `listings.json` | Auto-updated listings data (also used as fallback seed) |
| `scripts/scrape.js` | Playwright headless browser scraper |
| `.github/workflows/scrape.yml` | GitHub Actions daily schedule |
| `package.json` | Node.js dependencies (Playwright) |

## Manual Scrape

To run the scraper locally:

```bash
npm install
npx playwright install chromium
npm run scrape
```

This will update `listings.json` with the latest data from Crexi.

---

*All information is deemed reliable but not guaranteed. Data sourced from Crexi.com.*
