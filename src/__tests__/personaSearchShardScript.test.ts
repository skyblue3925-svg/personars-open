import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

test('builds a fixture search manifest and shard files from Nemotron JSONL', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'persona-search-shards-'));

  try {
    await execFileAsync('node', [
      'scripts/build-nemotron-persona-search-shards.mjs',
      '--input',
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
    expect(shard).toHaveLength(1);
    expect(shard[0].source.personaType).toBe('family_persona');
    expect(shard[0].background).toContain('고등학생 자녀');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
