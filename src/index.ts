#!/usr/bin/env node
import { Command } from 'commander';
import { checkForUpdates } from './update.js';
import { VERSION } from './version.js';

// Nothing here may statically import a module that validates configuration.
// Reading NOTEBOOKLM_BASE_URL throws on a malformed value, and `--help` and
// `--version` have to keep working so the user can find out what to set. The
// command handlers below import those modules once a command actually runs.
const program = new Command();

program
  .name('notebooklm-mcp-server')
  .description('NotebookLM MCP Server (Node.js)')
  .version(VERSION);

program
  .command('server')
  .description('Start the MCP server (default)')
  .action(async () => {
    await checkForUpdates(true);
    await import('./server.js');
  });

program
  .command('auth')
  .description('Run interactive authentication')
  .action(async () => {
    await checkForUpdates(false);
    const { runAuthCli } = await import('./auth-cli.js');
    await runAuthCli();
  });

// Default to server if no command provided
const args = process.argv.slice(2);
if (!args.length || !['auth', 'server', '--version', '-h', '--help'].includes(args[0])) {
  // If no args or unknown command, start server
  (async () => {
    await checkForUpdates();
    import('./server.js');
  })();
} else {
  program.parse();
}
