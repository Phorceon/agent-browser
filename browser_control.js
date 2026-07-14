const puppeteer = require('puppeteer-core');

const CHROME_EXECUTABLE = process.env.CHROME_EXECUTABLE ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_PROFILE_PATH = process.env.CHROME_PROFILE_PATH ||
  '/Users/aditya/Library/Application Support/Google/Chrome/Profile 12';

/**
 * Safe replacement for deprecated page.waitForTimeout().
 * Uses a plain setTimeout wrapped in a Promise.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Launch a real Chrome instance with the given profile, navigate to YouTube,
 * search for a query, click the first result, scroll to comments, and
 * capture a full-page screenshot.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.searchQuery]  – YouTube search term (default: 'Judelow')
 * @param {string}  [opts.screenshotPath] – output file (default: 'youtube_judelow.png')
 * @param {number}  [opts.scrollSteps]  – max scroll iterations (default: 15)
 * @returns {Promise<{browser: import('puppeteer-core').Browser, page: import('puppeteer-core').Page}>}
 */
async function launchBrowser(opts = {}) {
  const {
    searchQuery = 'Judelow',
    screenshotPath = 'youtube_judelow.png',
    scrollSteps = 15,
  } = opts;

  console.log('🚀 Launching YOUR Chrome with Profile 12...');
  console.log(`🔵 Chrome: ${CHROME_EXECUTABLE}`);
  console.log(`📁 Profile: ${CHROME_PROFILE_PATH}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    devtools: true,
    userDataDir: CHROME_PROFILE_PATH,
    defaultViewport: null,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  console.log('✅ Chrome launched with Profile 12!');

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('🌐 Starting YouTube...');
  await page.goto('https://www.youtube.com', { waitUntil: 'networkidle' });
  console.log('📄 YouTube loaded');

  await delay(2000);

  console.log(`🔍 Searching for ${searchQuery}...`);
  await page.goto(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
    { waitUntil: 'networkidle' },
  );

  await delay(2000);

  const videoSelector = 'ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer';
  const video = await page.waitForSelector(videoSelector, { timeout: 10000 });
  if (!video) {
    throw new Error(`No video found matching selector: ${videoSelector}`);
  }
  console.log('📋 Found video, clicking...');
  await video.click();

  await delay(4000);
  console.log('✅ Video page loaded');

  console.log('⬇️ Scrolling to comments...');
  for (let i = 0; i < scrollSteps; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await delay(500);
    const comments = await page.$('ytd-comments, ytd-comment-thread-renderer, #comments');
    if (comments) {
      console.log('💬 Comments found!');
      break;
    }
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved to ${screenshotPath}`);
  console.log('✅ Done! Chrome with Profile 12 is now active');

  return { browser, page };
}

// Only auto-execute when run directly (not when imported as a module)
if (require.main === module) {
  launchBrowser().catch(console.error);
}

module.exports = { launchBrowser, delay };
