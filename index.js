#!/usr/bin/env node
/**
 * index.js — Agent Browser TUI entry point
 *
 * A terminal interface for the AI browser agent.
 * Controls Edge Profile 12 using your own AI models.
 */

import 'dotenv/config';
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import { launchBrowser, getAllTabs, closeBrowser, getActivePage } from './src/browser.js';
import { Agent } from './src/agent.js';

let lastUserLine = '';

function logInterruptedTask() {
  if (!lastUserLine) return;
  try {
    let mem = fs.readFileSync('memory.md', 'utf8');
    const interruptedText = `\n### ⚠️ Last Interrupted Task\n- ${lastUserLine}\n`;
    
    if (mem.includes('### ⚠️ Last Interrupted Task')) {
       mem = mem.replace(/### ⚠️ Last Interrupted Task\n- .*\n/, interruptedText.trim() + '\n');
    } else {
       mem += interruptedText;
    }
    fs.writeFileSync('memory.md', mem);
  } catch(e) {}
}

// ─── TUI Helpers ──────────────────────────────────────────────────────────────

const c = {
  reset: chalk.reset,
  dim: chalk.dim,
  bold: chalk.bold,
  cyan: chalk.cyan,
  green: chalk.green,
  yellow: chalk.yellow,
  red: chalk.red,
  magenta: chalk.magenta,
  blue: chalk.blue,
  gray: chalk.gray,
  white: chalk.white,
};

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function printDivider(char = '─', color = c.dim) {
  const width = Math.min(process.stdout.columns || 80, 80);
  console.log(color(char.repeat(width)));
}

function printHeader() {
  console.clear();
  printDivider('═', c.cyan);
  console.log(
    c.cyan.bold('  ◈  AGENT BROWSER  ') +
    c.dim('— AI that controls your Edge')
  );
  printDivider('═', c.cyan);
  console.log();
}

function printHelp() {
  console.log(c.dim(`Commands:`));
  console.log(c.dim(`  /tabs      — list open tabs`));
  console.log(c.dim(`  /focus     — bring Edge window to front`));
  console.log(c.dim(`  /clear     — clear conversation`));
  console.log(c.dim(`  /switch N  — switch active tab to index N`));
  console.log(c.dim(`  /stop      — stop current agent task`));
  console.log(c.dim(`  /provider  [name] — show or switch AI provider`));
  console.log(c.dim(`  /help      — show this`));
  console.log(c.dim(`  /exit      — quit`));
  console.log();
}

function printUserMessage(msg) {
  console.log();
  console.log(c.cyan.bold('You:'));
  console.log(c.white('  ' + msg.split('\n').join('\n  ')));
  console.log();
}

function printAssistantStart() {
  process.stdout.write(c.green.bold('Agent: '));
}

function getTimestamp() {
  return c.gray(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}]`);
}

function printToolCall(name, args) {
  const argStr = formatArgs(args);
  console.log();
  console.log(`${getTimestamp()}` + c.yellow(`  ⟳ ${name}`) + c.dim(argStr ? `  ${argStr}` : ''));
}

function printToolResult(name, result, err) {
  if (err) {
    console.log(`${getTimestamp()}` + c.red(`  ✗ ${name}: ${err.message}`));
  } else {
    const summary = summarizeResult(name, result);
    console.log(`${getTimestamp()}` + c.dim(`  ✓ ${summary}`));
  }
}

function formatArgs(args) {
  if (!args || Object.keys(args).length === 0) return '';
  const parts = Object.entries(args).map(([k, v]) => {
    const val = typeof v === 'string' ? `"${v.slice(0, 40)}"` : JSON.stringify(v).slice(0, 40);
    return `${k}: ${val}`;
  });
  return '(' + parts.slice(0, 3).join(', ') + (parts.length > 3 ? '…' : '') + ')';
}

function summarizeResult(name, result) {
  if (result?.error) return `Error: ${result.error}`;
  switch (name) {
    case 'get_tabs':
      return `Found ${result.tabs?.length || 0} tabs`;
    case 'navigate':
      return `Navigated to ${result.navigated_to?.slice(0, 60)}`;
    case 'get_page_content':
      return `Page: "${result.title?.slice(0, 50)}" — ${result.url?.slice(0, 50)}`;
    case 'click':
      return `Clicked: ${result.clicked?.slice(0, 50)}`;
    case 'type_text':
      return `Typed: ${result.typed?.slice(0, 50)}`;
    case 'switch_to_tab':
      return `Switched to tab ${result.switched_to?.index}: ${result.switched_to?.title?.slice(0, 40)}`;
    case 'new_tab':
      return `Opened new tab: ${result.opened?.url?.slice(0, 50)}`;
    case 'take_screenshot':
      return `Screenshot saved: ${result.saved_to}`;
    case 'evaluate_js':
      return `JS result: ${String(result.result).slice(0, 60)}`;
    default:
      return JSON.stringify(result).slice(0, 80);
  }
}

async function printTabList() {
  try {
    const tabs = await getAllTabs();
    console.log();
    printDivider('─', c.dim);
    console.log(c.cyan.bold(' Open Tabs:'));
    for (const t of tabs) {
      const indicator = t.isActive ? c.cyan(' ▶') : c.dim('  ');
      console.log(
        indicator +
        c.dim(` [${t.index}] `) +
        c.white(t.title?.slice(0, 50) || '(loading)') +
        c.dim(' — ' + t.url?.slice(0, 50))
      );
    }
    printDivider('─', c.dim);
    console.log();
  } catch (e) {
    console.log(c.red('  Could not get tabs: ' + e.message));
  }
}

// ─── Readline Setup ───────────────────────────────────────────────────────────

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: c.cyan.bold('\n◈ ') + c.white('> '),
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  // Show startup info
  const provider = process.env.AI_PROVIDER || 'openai';
  const profile = process.env.EDGE_PROFILE_DIR || 'Profile 11';
  console.log(c.dim(`  AI Provider : `) + c.cyan(provider));
  console.log(c.dim(`  Edge Profile  : `) + c.cyan(profile));
  console.log();

  // Connect to Edge
  try {
    await launchBrowser();
    clearLine(); // clear "Connecting to Edge..."
    console.log(c.green('  ✓ Edge connected'));
    const tabs = await getAllTabs();
    console.log(c.dim(`  ✓ ${tabs.length} tab(s) open`));
  } catch (err) {
    clearLine();
    console.log(c.red('  ✗ Edge connection failed:'));
    console.log(c.red('    ' + err.message));
    console.log();
    console.log(c.yellow('  Note: If Profile 12 is already open, you must close it or use /reconnect after manual launch.'));
  }

  console.log();
  printHelp();

  // Create agent
  let agentRunning = false;
  let currentAgent = null;

  const startAgent = () => {
    let inThink = false;
    let streamBuf = '';

    currentAgent = new Agent(
      // onToken — streaming output
      (tok) => {
        streamBuf += tok;
        while (streamBuf.length > 0) {
          if (!inThink) {
            const startIdx = streamBuf.indexOf('<think>');
            if (startIdx !== -1) {
              process.stdout.write(c.green(streamBuf.slice(0, startIdx)));
              inThink = true;
              streamBuf = streamBuf.slice(startIdx + 7);
              process.stdout.write(c.dim('\n[AI is thinking...]\n'));
            } else {
              const lastLt = streamBuf.lastIndexOf('<');
              if (lastLt !== -1 && '<think>'.startsWith(streamBuf.slice(lastLt))) {
                if (lastLt > 0) {
                  process.stdout.write(c.green(streamBuf.slice(0, lastLt)));
                  streamBuf = streamBuf.slice(lastLt);
                }
                break;
              } else {
                process.stdout.write(c.green(streamBuf));
                streamBuf = '';
              }
            }
          } else {
            const endIdx = streamBuf.indexOf('</think>');
            if (endIdx !== -1) {
              inThink = false;
              streamBuf = streamBuf.slice(endIdx + 8);
            } else {
              const lastLt = streamBuf.lastIndexOf('<');
              if (lastLt !== -1 && '</think>'.startsWith(streamBuf.slice(lastLt))) {
                if (lastLt > 0) streamBuf = streamBuf.slice(lastLt);
                break;
              } else {
                streamBuf = '';
                break;
              }
            }
          }
        }
      },

      // onToolCall
      (name, args) => printToolCall(name, args),

      // onToolResult
      (name, result, err) => {
        // Reset the chunk filter state cleanly between agent moves
        inThink = false;
        streamBuf = '';
        printToolResult(name, result, err);
      }
    );
    return currentAgent;
  };

  // Create initial agent
  let agent = startAgent();

  const rl = createRL();
  rl.prompt();

  rl.on('line', async (input) => {
    const line = input.trim();
    if (!line) {
      rl.prompt();
      return;
    }
    if (!line.startsWith('/')) {
      lastUserLine = line;
    }

    // ─── Commands ────────────────────────────────────────────────────────────
    if (line.startsWith('/')) {
      const [cmd, ...args] = line.slice(1).split(' ');

      switch (cmd.toLowerCase()) {
        case 'exit':
        case 'quit':
          console.log(c.dim('\nClosing browser and exiting...'));
          await closeBrowser();
          process.exit(0);

        case 'tabs':
          await printTabList();
          break;

        case 'clear':
          agent.reset();
          agent = startAgent();
          printHeader();
          console.log(c.green('  ✓ Conversation cleared'));
          console.log();
          break;

        case 'stop':
          if (agentRunning && currentAgent) {
            currentAgent.abort();
            logInterruptedTask();
            console.log(c.yellow('\n  ■ Stopping agent... logged task to memory.md'));
          } else {
            console.log(c.dim('  No agent task running.'));
          }
          break;

        case 'switch': {
          const idx = parseInt(args[0]);
          if (isNaN(idx)) {
            console.log(c.red('  Usage: /switch <tab-index>'));
          } else {
            try {
              const { switchToTab } = await import('./src/browser.js');
              const page = await switchToTab(idx);
              console.log(c.green(`  ✓ Switched to tab ${idx}`));
            } catch (e) {
              console.log(c.red('  ' + e.message));
            }
          }
          break;
        }

        case 'provider': {
          // Usage: /provider            — show current
          //        /provider model=...  — override model
          //        /provider url=...    — override base URL
          if (args.length === 0) {
            console.log(c.dim(`  Current: `) + c.cyan(agent.provider?.name || 'not set'));
          } else {
            const overrides = {};
            for (const arg of args) {
              const [k, ...v] = arg.split('=');
              const val = v.join('=');
              if (k === 'model')  overrides.model   = val;
              if (k === 'url')    overrides.baseURL  = val;
              if (k === 'key')    overrides.apiKey   = val;
              if (k === 'vision') overrides.supportsVision = val === 'true';
            }
            try {
              const name = agent.switchProvider(overrides);
              console.log(c.green(`  ✓ Provider updated: ${name}`));
            } catch (e) {
              console.log(c.red('  ' + e.message));
            }
          }
          break;
        }

        case 'focus': {
          try {
            const page = await getActivePage();
            await page.bringToFront();
            console.log(c.green('  ✓ Requested window focus'));
          } catch (e) {
            console.log(c.red('  ✗ Focus failed: ' + e.message));
          }
          break;
        }

        case 'reconnect':
          process.stdout.write(c.dim('  Attempting to reconnect to Edge...'));
          try {
            await launchBrowser();
            clearLine();
            console.log(c.green('  ✓ Edge reconnected'));
          } catch (e) {
            clearLine();
            console.log(c.red('  ✗ Connection failed: ' + e.message));
          }
          break;

        case 'help':
          printHelp();
          break;

        default:
          console.log(c.red(`  Unknown command: /${cmd}`));
          console.log(c.dim('  Type /help for commands'));
      }

      rl.prompt();
      return;
    }

    // ─── Agent task ───────────────────────────────────────────────────────────
    if (agentRunning) {
      console.log(c.yellow('  Agent is still running. Use /stop to cancel.'));
      rl.prompt();
      return;
    }

    printUserMessage(line);
    printAssistantStart();
    agentRunning = true;

    try {
      const result = await agent.run(line);
      // If we got back from the stream without anything printed via onToken, print it
      if (result && result !== '(Task stopped by user)' && result !== '(Max steps reached — task may be incomplete)') {
        // Result was already streamed
      } else if (result === '(Task stopped by user)') {
        console.log(c.yellow('\n  ■ Task stopped'));
      } else if (result === '(Max steps reached — task may be incomplete)') {
        console.log(c.yellow('\n  ⚠ Max steps reached'));
      }
    } catch (err) {
      console.log();
      console.log(c.red('\n  Error: ' + err.message));
      if (err.message.includes('API key') || err.message.includes('api_key')) {
        console.log(c.yellow('  Check your API key in .env'));
      }
    } finally {
      agentRunning = false;
      console.log();
      printDivider('─', c.dim);
      rl.prompt();
    }
  });

  rl.on('close', async () => {
    console.log(c.dim('\nExiting...'));
    await closeBrowser();
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', async () => {
    if (agentRunning && currentAgent) {
      currentAgent.abort();
      logInterruptedTask();
      console.log(c.yellow('\n  ■ Stopped agent (logged to memory) (Ctrl+C again to exit)'));
      agentRunning = false;
      rl.prompt();
    } else {
      console.log(c.dim('\nExiting...'));
      await closeBrowser();
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error(chalk.red('Fatal error: ' + err.message));
  process.exit(1);
});
