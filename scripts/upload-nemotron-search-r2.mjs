import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const indexDir = resolve(args.indexDir ?? 'C:/tmp/nemotron-row-search-district-full');
const bucket = args.bucket ?? 'persona-nemotron-search';
const concurrency = Number(args.concurrency ?? 6);
const statePath = resolve(args.state ?? join(indexDir, '.r2-upload-state.json'));
const manifestPath = join(indexDir, 'manifest.json');
const shardDir = join(indexDir, 'shards');

if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`);
if (!existsSync(shardDir)) throw new Error(`Missing shard directory: ${shardDir}`);

const state = loadState(statePath);
const shardNames = (await readdir(shardDir)).filter((name) => name.endsWith('.json')).sort((a, b) => a.localeCompare(b));
const remaining = shardNames.filter((name) => !state.uploaded.includes(`shards/${name}`));
let completed = shardNames.length - remaining.length;
let failed = 0;

console.log(`Bucket: ${bucket}`);
console.log(`Index: ${indexDir}`);
console.log(`Shards: ${shardNames.length}`);
console.log(`Already uploaded in state: ${completed}`);
console.log(`Remaining: ${remaining.length}`);
console.log(`Concurrency: ${concurrency}`);

await runPool(remaining, concurrency, async (name) => {
  const key = `shards/${name}`;
  await wrangler(['r2', 'object', 'put', `${bucket}/${key}`, '--file', join(shardDir, name), '--remote']);
  state.uploaded.push(key);
  completed += 1;
  if (completed % 50 === 0 || completed === shardNames.length) {
    saveState(statePath, state);
    console.log(`[${completed}/${shardNames.length}] uploaded`);
  }
});

saveState(statePath, state);

if (failed > 0) {
  throw new Error(`${failed} shard uploads failed. Re-run this command to resume from ${statePath}.`);
}

if (state.uploaded.length === shardNames.length) {
  console.log('Uploading manifest last...');
  await wrangler(['r2', 'object', 'put', `${bucket}/manifest.json`, '--file', manifestPath, '--remote']);
  state.manifestUploaded = true;
  saveState(statePath, state);
  console.log('R2 upload complete.');
}

async function runPool(items, size, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      try {
        await worker(item);
      } catch (error) {
        failed += 1;
        console.error(`Upload failed for ${item}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  await Promise.all(workers);
}

function wrangler(argv) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npx', ['wrangler', ...argv], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(stderr.trim() || `wrangler exited with ${code}`));
    });
  });
}

function loadState(path) {
  if (!existsSync(path)) return { uploaded: [], manifestUploaded: false };
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return {
    uploaded: Array.isArray(parsed.uploaded) ? parsed.uploaded : [],
    manifestUploaded: Boolean(parsed.manifestUploaded),
  };
}

function saveState(path, state) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--index-dir') {
      parsed.indexDir = argv[index + 1];
      index += 1;
    } else if (item === '--bucket') {
      parsed.bucket = argv[index + 1];
      index += 1;
    } else if (item === '--concurrency') {
      parsed.concurrency = argv[index + 1];
      index += 1;
    } else if (item === '--state') {
      parsed.state = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}
