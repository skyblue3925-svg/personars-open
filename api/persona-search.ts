import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  searchPersonaRecordShards,
  searchPersonaShards,
  shardFileName,
  type PersonaSearchManifest,
  type PersonaSearchRequest,
  type PersonaSearchSourceRow,
} from '../src/lib/personaSearchIndex';
import type { PersonaSeed } from '../src/types/research';
import { guard } from './_lib/guard.js';

declare const process: {
  cwd: () => string;
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (key: string, value: string) => void;
  status: (status: number) => { json: (value: unknown) => void };
  json: (value: unknown) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (guard(req, res)) return;

  const request = normalizeBody(req.body);
  if (!isValidSearchRequest(request)) return res.status(400).json({ error: 'invalid_request' });

  const root = process.env.PERSONA_SEARCH_INDEX_DIR || resolve(process.cwd(), 'public/data/nemotron-search');

  try {
    const manifest = await readManifest(root);
    const result =
      manifest.shardStrategy === 'province/ageGroup/sex source rows' || manifest.shardStrategy === 'province/district/ageGroup/sex source rows'
        ? await searchPersonaRecordShards({
            manifest,
            request,
            loadShard: (key) => readRowShard(root, key),
          })
        : await searchPersonaShards({
            manifest,
            request,
            loadShard: (key) => readShard(root, key),
          });

    if (result.searchedShardCount > 0 && result.failedShardCount === result.searchedShardCount) {
      return res.status(503).json({ error: 'persona_search_unavailable' });
    }

    return res.status(200).json(result);
  } catch {
    return res.status(503).json({ error: 'persona_search_unavailable' });
  }
}

function normalizeBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isValidSearchRequest(body: unknown): body is PersonaSearchRequest {
  const request = body as PersonaSearchRequest;
  if (!request || typeof request !== 'object') return false;
  if (request.limit !== undefined && (!Number.isFinite(request.limit) || request.limit < 1 || request.limit > 100)) return false;
  return [
    request.ageGroup,
    request.sex,
    request.province,
    request.educationLevel,
    request.familyType,
    request.personaType,
    request.occupationKeyword,
  ].some(hasSearchValue);
}

function hasSearchValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
}

async function readManifest(root: string): Promise<PersonaSearchManifest> {
  return JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as PersonaSearchManifest;
}

async function readShard(root: string, key: string): Promise<PersonaSeed[]> {
  return JSON.parse(await readFile(join(root, 'shards', shardFileName(key)), 'utf8')) as PersonaSeed[];
}

async function readRowShard(root: string, key: string): Promise<PersonaSearchSourceRow[]> {
  return JSON.parse(await readFile(join(root, 'shards', shardFileName(key)), 'utf8')) as PersonaSearchSourceRow[];
}
