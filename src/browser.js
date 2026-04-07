/**
 * browser.js — Edge Profile 12 connection via Playwright
 *
 * Uses launchPersistentContext so playwright drives your REAL Edge profile
 * (all cookies, logins, extensions intact). Only touches Profile 12.
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';

const EDGE_EXECUTABLE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEFAULT_USER_DATA = join(homedir(), 'Library/Application Support/Microsoft Edge');

let browserContext = null;
let activePage = null;

// ─── Profile Discovery ────────────────────────────────────────────────────────

/**
 * Read Edge's Local State file to get all profile names + folder names
 */
export function getEdgeProfiles(userDataDir = DEFAULT_USER_DATA) {
  const localStatePath = join(userDataDir, 'Local State');
  if (!existsSync(localStatePath)) {
    throw new Error(`Edge Local State not found at: ${localStatePath}\nIs Edge installed?`);
  }

  const localState = JSON.parse(readFileSync(localStatePath, 'utf8'));
  const profileCache = localState?.profile?.info_cache || {};

  const profiles = Object.entries(profileCache).map(([folder, info]) => ({
    folder,
    name: info.name || folder,
    email: info.user_name || '',
    isDefault: folder === 'Default',
  }));

  // Sort: Default first, then Profile 1, Profile 2, etc.
  profiles.sort((a, b) => {
    if (a.folder === 'Default') return -1;
    if (b.folder === 'Default') return 1;
    const numA = parseInt(a.folder.replace('Profile ', '') || '0');
    const numB = parseInt(b.folder.replace('Profile ', '') || '0');
    return numA - numB;
  });

  return profiles;
}

// ─── Browser Launch ───────────────────────────────────────────────────────────

/**
 * Launch Edge with the specified profile, or connect to existing CDP session.
 * Returns the browser context (Playwright).
 */
export async function launchBrowser(config = {}) {
  const {
    profileDir = process.env.EDGE_PROFILE_DIR || 'Profile 11',
    userDataDir = process.env.EDGE_USER_DATA_DIR || DEFAULT_USER_DATA,
    headless = process.env.HEADLESS !== 'false' ? false : false,
    cdpUrl = process.env.CDP_URL || 'http://localhost:9222',
  } = config;

  // 1. Try to connect to existing CDP first (This enables persistence between Agent restarts!)
  try {
    const browser = await chromium.connectOverCDP(cdpUrl);
    browserContext = browser.contexts()[0];
    activePage = browserContext.pages()[0] || await browserContext.newPage();
    
    // Wire up events
    browserContext.on('close', () => {
      browserContext = null;
      activePage = null;
    });

    console.log(chalk.green(`✓ Connected to existing Edge session via CDP`));
    return browserContext;
  } catch (err) {
    // Port closed, meaning Edge is not running (or not running with debugger port). We will spawn it natively.
  }

  // Profile Path
  const profilePath = join(userDataDir, profileDir);

  if (!existsSync(profilePath)) {
    throw new Error(
      `Edge profile folder not found: ${profilePath}\n` +
      `Check your .env or run \`node scripts/setup.js\``
    );
  }

  console.log(chalk.dim(`Launching Edge natively in background mode (Profile: ${profileDir})`));

  // 2. Spawn a detached process so Edge STAYS open when the Agent quits
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    '--start-maximized',
    `--profile-directory=${profileDir}`,
    '--disable-blink-features=AutomationControlled',
    '--test-type',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ];

  try {
    const edgeProcess = spawn(EDGE_EXECUTABLE, args, {
      detached: true,
      stdio: 'ignore'
    });
    
    // Unref allows the current Node process to exit without waiting for this child
    edgeProcess.unref();

    // Give Edge ~2.5 seconds to fully launch and bind the WebSocket debug port
    await new Promise(r => setTimeout(r, 2500));

    // 3. Connect to the fresh browser we just spawned via CDP
    const browser = await chromium.connectOverCDP(cdpUrl);
    browserContext = browser.contexts()[0];
    activePage = browserContext.pages()[0] || await browserContext.newPage();

    browserContext.on('close', () => {
      browserContext = null;
      activePage = null;
    });

  } catch (err) {
    // If it fails here, Edge spawned but instantly delegated to an already running window without debugging
    throw new Error(
      `PROFILE IN USE: Edge Profile "${profileDir}" is already open but lacks the debugger port.\n\n` +
      `Option A: Fully Quit Edge (Cmd+Q) and try /reconnect.\n` +
      `Option B: Keep your current Edge but manually restart it using this command in a new terminal:\n` +
      `   /Applications/Microsoft\\ Edge.app/Contents/MacOS/Microsoft\\ Edge --remote-debugging-port=9222`
    );
  }

  // Setup global hooks to suppress OS Finder dialogues
  const setupPageHooks = (page) => {
    page.on('filechooser', () => {
      console.log(chalk.yellow(`\n  ⚠ Native OS File Picker intercepted and suppressed. Agent must use upload_file instead!`));
    });
  };
  browserContext.on('page', setupPageHooks);
  browserContext.pages().forEach(setupPageHooks);

  // Get active tab
  const pages = browserContext.pages();
  activePage = pages.length > 0 ? pages[pages.length - 1] : await browserContext.newPage();

  return browserContext;
}

// ─── Tab Management ───────────────────────────────────────────────────────────

export function getContext() {
  if (!browserContext) throw new Error('Browser not connected. Call launchBrowser() first.');
  return browserContext;
}

export async function getAllTabs() {
  const ctx = getContext();
  const pages = ctx.pages();
  return Promise.all(pages.map(async (page, index) => {
    try {
      return {
        index,
        id: index,
        url: page.url(),
        title: await page.title().catch(() => '(loading)'),
        isActive: page === activePage,
      };
    } catch {
      return { index, id: index, url: 'about:blank', title: '(closed)', isActive: false };
    }
  }));
}

export async function getActivePage() {
  if (!activePage || activePage.isClosed()) {
    const pages = getContext().pages();
    activePage = pages[pages.length - 1] || await getContext().newPage();
  }
  return activePage;
}

export async function switchToTab(index) {
  const pages = getContext().pages();
  if (index < 0 || index >= pages.length) {
    throw new Error(`Tab index ${index} out of range (0-${pages.length - 1})`);
  }
  activePage = pages[index];
  return activePage;
}

export async function newTab(url = 'about:blank') {
  const page = await getContext().newPage();
  activePage = page;
  if (url && url !== 'about:blank') {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  return page;
}

export async function closeTab(index) {
  const pages = getContext().pages();
  if (pages.length <= 1) throw new Error('Cannot close the last tab');
  if (index < 0 || index >= pages.length) throw new Error(`Tab index ${index} out of range`);
  await pages[index].close();
  // Switch active page if we closed the active one
  if (pages[index] === activePage) {
    const remaining = getContext().pages();
    activePage = remaining[remaining.length - 1];
  }
}

export async function closeBrowser() {
  if (browserContext) {
    try {
      // Use disconnect instead of close so Edge stays open!
      const browser = browserContext.browser();
      if (browser) {
        await browser.disconnect();
      }
    } catch(e) {}
    browserContext = null;
    activePage = null;
  }
}
