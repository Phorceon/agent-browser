const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_PROFILE_PATH = '/Users/aditya/Library/Application Support/Google/Chrome/Profile 12';

async function launchBrowser() {
  // Guard: Check if Chrome executable exists
  if (!fs.existsSync(CHROME_EXECUTABLE)) {
    throw new Error(`Chrome executable not found at: ${CHROME_EXECUTABLE}\nPlease verify the path.`);
  }

  // Guard: Check if profile path exists
  if (!fs.existsSync(CHROME_PROFILE_PATH)) {
    throw new Error(`Chrome profile path not found at: ${CHROME_PROFILE_PATH}\nPlease verify the profile path.`);
  }

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
      '--disable-blink-features=AutomationControlled'
    ]
  });

  console.log('✅ Chrome launched with Profile 12!');

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('🌐 Starting YouTube...');
  await page.goto('https://www.youtube.com', { waitUntil: 'networkidle' });
  console.log('📄 YouTube loaded');

  await page.waitForTimeout(2000);

  console.log('🔍 Searching for Judelow...');
  await page.goto('https://www.youtube.com/results?search_query=Judelow', { waitUntil: 'networkidle' });

  await page.waitForTimeout(2000);

  const videoSelector = 'ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer';
  const video = await page.waitForSelector(videoSelector, { timeout: 10000 });
  console.log('📋 Found video, clicking...');
  await video.click();

  await page.waitForTimeout(4000);
  console.log('✅ Video page loaded');

  console.log('⬇️ Scrolling to comments...');
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(500);
    const comments = await page.$('ytd-comments, ytd-comment-thread-renderer, #comments');
    if (comments) {
      console.log('💬 Comments found!');
      break;
    }
  }

  await page.screenshot({ path: 'youtube_judelow.png', fullPage: true });
  console.log('📸 Screenshot saved!');
  console.log('✅ Done! Chrome with Profile 12 is now active');

  return { browser, page };
}

launchBrowser().catch(console.error);