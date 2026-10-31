// Watch-mode dev server that works in paths containing shell characters such as "&".
// `nest start --watch` launches node through the shell with an unquoted path, which breaks
// on Windows for folders like "R&DBots". Here nothing goes through a shell.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nestBin = join(dirname(require.resolve('@nestjs/cli/package.json')), 'bin', 'nest.js');
const entry = process.argv[2] ?? 'main';

const build = spawnSync(process.execPath, [nestBin, 'build'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [
  spawn(process.execPath, [nestBin, 'build', '--watch', '--preserveWatchOutput'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['--watch-path=dist', '--env-file-if-exists=.env', join('dist', `${entry}.js`)], {
    cwd: root,
    stdio: 'inherit',
  }),
];

const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => code && code !== 0 && process.exitCode === undefined && (process.exitCode = code)));
