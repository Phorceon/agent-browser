const puppeteer = require('puppeteer-core');

const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_USER_DATA = '/Users/aditya/Library/Application Support/Google/Chrome';
const CHROME_PROFILE = 'Profile 12';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function launchBrowser() {
  console.log('🚀 Launching YOUR Chrome with Profile 12...');
  console.log(`🔵 Chrome: ${CHROME_EXECUTABLE}`);
  console.log(`📁 User Data: ${CHROME_USER_DATA}`);
  console.log(`📂 Profile: ${CHROME_PROFILE}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    devtools: true,
    userDataDir: CHROME_USER_DATA,
    defaultViewport: null,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      `--profile-directory=${CHROME_PROFILE}`
    ]
  });

  console.log('✅ Chrome launched with Profile 12!');

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  console.log('🌐 Starting YouTube...');
  await page.goto('https://www.youtube.com', { waitUntil: 'networkidle' });
  console.log('📄 YouTube loaded');

  await sleep(2000);

  console.log('🔍 Searching for Judelow...');
  await page.goto('https://www.youtube.com/results?search_query=Judelow', { waitUntil: 'networkidle' });

  await sleep(2000);

  const videoSelector = 'ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer';
  const video = await page.waitForSelector(videoSelector, { timeout: 10000 });
  if (!video) {
    console.error('❌ No video found on search results page');
    await browser.close();
    return { browser, page };
  }
  console.log('📋 Found video, clicking...');
  await video.click();

  await sleep(4000);
  console.log('✅ Video page loaded');

  console.log('⬇️ Scrolling to comments...');
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(500);
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
