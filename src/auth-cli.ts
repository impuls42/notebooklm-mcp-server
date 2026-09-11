#!/usr/bin/env node
import { AuthManager } from './auth.js';
import { BASE_URL } from './constants.js';
import chalk from 'chalk';
import ora from 'ora';

export async function runAuthCli() {
  const auth = new AuthManager();
  
  // Use stderr for ALL logs to avoid breaking MCP stdout
  console.error('\n' + chalk.cyan.bold('╔═══════════════════════════════════════════╗'));
  console.error(chalk.cyan.bold('║      NotebookLM MCP Authentication        ║'));
  console.error(chalk.cyan.bold('╚═══════════════════════════════════════════╝\n'));

  try {
    await auth.runAuthentication((status) => {
      console.error(chalk.blue(`[Status] ${status}`));
    });

    // A completed browser login does not guarantee the exported cookies work
    // in the HTTP client; the two only diverge on the first real API call.
    // Verify before declaring success.
    console.error(chalk.blue('[Status] Verifying the session against the API...'));
    const check = await auth.validateSavedSession();

    if (check.status === 'ok') {
      console.error('\n' + chalk.green.bold('Authentication successful!'));
      console.error(chalk.white(check.detail));
      console.error(chalk.white('Your session is now active. You can return to your chat.'));
      return;
    }

    if (check.status === 'rejected') {
      console.error('\n' + chalk.yellow.bold('⚠  Login worked in the browser, but the API rejected the exported cookies.'));
      console.error(chalk.gray(`\nAPI response: ${check.detail}`));
      console.error(chalk.white('\nWhat to check:'));
      console.error(chalk.white('  • Re-run auth once more; the rotating session token can race the login.'));
      console.error(chalk.white('  • Confirm the service host is current. Override it with NOTEBOOKLM_BASE_URL'));
      console.error(chalk.white(`    if Google has moved again (currently ${BASE_URL}).`));
      console.error(chalk.white('  • Report the API response above; it names where the request landed.'));
      process.exit(2);
    }

    // Unexpected/network error — cookies are saved, but we could not confirm.
    console.error('\n' + chalk.yellow.bold('Login completed, but the session could not be verified.'));
    console.error(chalk.gray(`Reason: ${check.detail}`));
    console.error(chalk.white('The cookies were saved. Try using the server; if calls fail, run auth again.'));
  } catch (error: any) {
    console.error('\n' + chalk.red.bold('Authentication failed'));
    console.error(chalk.red('Error: ') + error.message);
    process.exit(1);
  }
}

// Only auto-run when invoked as the standalone auth binary. Comparing
// import.meta.url against argv[1] breaks under esbuild bundling: inside
// dist/index.js the inlined module's import.meta.url IS dist/index.js, so
// `node dist/index.js auth` used to launch the flow twice (two browser
// windows). Matching the script basename is deterministic in both builds.
import * as path from 'path';
const entryBase = process.argv[1] ? path.basename(process.argv[1]) : '';
if (entryBase.startsWith('auth-cli') || entryBase.startsWith('notebooklm-mcp-auth')) {
  runAuthCli();
}
