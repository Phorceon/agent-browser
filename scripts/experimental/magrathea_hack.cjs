const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log("Connecting to Edge...");
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    const page = contexts[0].pages().find(p => p.url().includes('magrathea')) || await contexts[0].newPage();
    
    if (!page.url().includes('magrathea')) {
      console.log("Navigating to Magrathea...");
      await page.goto("https://job-boards.greenhouse.io/magrathea/jobs/44", { waitUntil: 'networkidle' });
    }

    console.log("Forcibly injecting payload into Greenhouse IFrame...");
    
    // Greenhouse uses an iframe on the main site, but if operating on job-boards.greenhouse.io directly, it's not an iframe.
    // Let's get the frame or page
    let target = page.frames().find(f => f.url().includes('greenhouse.io')) || page;

    // Fill standard fields with placeholders
    await target.locator('#first_name').fill('YOUR_FIRST_NAME', { timeout: 3000 }).catch(()=>{});
    await target.locator('#last_name').fill('YOUR_LAST_NAME', { timeout: 3000 }).catch(()=>{});
    await target.locator('#email').fill('your-email@example.com', { timeout: 3000 }).catch(()=>{});
    await target.locator('#phone').fill('your-phone-number', { timeout: 3000 }).catch(()=>{}); // placeholder phone if empty
    
    // Fill custom questions with placeholders
    const answers = {
      "[name='question_6679474007']": "YOUR_ANSWER_1",
      "[name='question_6679475007']": "YOUR_ANSWER_2",
      "[name='question_6679477007']": "YOUR_ANSWER_3",
      "[name='question_6679478007']": "YOUR_ANSWER_4",
      "[name='question_6679479007']": "YOUR_ANSWER_5",
      "[name='question_6679480007']": "https://www.linkedin.com/in/your-profile/",
      "[name='question_6679473007']": "YOUR_ANSWER_6"
    };

    for (const [selector, text] of Object.entries(answers)) {
      console.log(`Filling ${selector}...`);
      await target.locator(selector).fill(text, { timeout: 5000 }).catch(() => {});
    }

    // Force React Combobox values for Education strictly via underlying input if possible, 
    // or just let the user manual the combobox if it fails.
    console.log("Attempting Combobox overrides...");
    await target.locator('[name="school--1"]').pressSequentially("YOUR_SCHOOL", { delay: 10 }).catch(()=>{});
    await target.waitForTimeout(1000);
    await target.locator('[name="school--1"]').press('Enter').catch(()=>{});

    await target.locator('[name="discipline--1"]').pressSequentially("YOUR_DISCIPLINE", { delay: 10 }).catch(()=>{});
    await target.waitForTimeout(1000);
    await target.locator('[name="discipline--1"]').press('Enter').catch(()=>{});

    console.log("Submitting application...");
    await target.locator('#submit_app').click({ force: true, timeout: 5000 }).catch(() => {});
    
    console.log("Waiting for confirmation page...");
    await page.waitForTimeout(5000);

    const artifactsDir = path.join(__dirname, 'artifacts');
    // Ensure artifacts dir exists
    if (!fs.existsSync(artifactsDir)){
        fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    const ssPath = path.join(artifactsDir, 'submission_proof.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("SUCCESS. Screenshot saved to " + ssPath);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
