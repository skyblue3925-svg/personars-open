import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
// 환경변수 PYTHON으로 실행 파일을 지정할 수 있다. 없으면 PATH의 python을 쓴다.
const pythonExe = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PYTHON ?? 'python';

test('python shard generator builds fixture shards without loading the full index into memory', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'persona-python-search-shards-'));

  try {
    await execFileAsync(pythonExe, [
      'scripts/build-nemotron-persona-search-shards.py',
      '--input-jsonl',
      'src/__tests__/fixtures/nemotron-sample.jsonl',
      '--output-dir',
      outputDir,
      '--partial',
    ]);

    const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8'));
    expect(manifest.sourceRecordCount).toBe(1);
    expect(manifest.expandedPersonaCount).toBe(7);
    expect(manifest.isComplete).toBe(false);
    expect(manifest.shards).toContain('family_persona|서울특별시|40대|여성');

    const shardFile = encodeURIComponent('family_persona|서울특별시|40대|여성') + '.json';
    const shard = JSON.parse(await readFile(join(outputDir, 'shards', shardFile), 'utf8'));
    expect(shard[0].id).toBe('nemotron-fixture-jsonl-001-family_persona');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('python compact row shard generator builds fixture source-row shards', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'persona-python-row-shards-'));

  try {
    await execFileAsync(pythonExe, [
      'scripts/build-nemotron-persona-record-search-shards.py',
      '--input-jsonl',
      'src/__tests__/fixtures/nemotron-sample.jsonl',
      '--output-dir',
      outputDir,
      '--partial',
    ]);

    const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8'));
    expect(manifest.sourceRecordCount).toBe(1);
    expect(manifest.expandedPersonaCount).toBe(7);
    expect(manifest.shardStrategy).toBe('province/district/ageGroup/sex source rows');
    expect(manifest.shards).toContain('서울특별시|강남구|40대|여성');

    const shardFile = encodeURIComponent('서울특별시|강남구|40대|여성') + '.json';
    const shard = JSON.parse(await readFile(join(outputDir, 'shards', shardFile), 'utf8'));
    expect(shard).toHaveLength(1);
    expect(shard[0].family_persona).toContain('고등학생 자녀');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
