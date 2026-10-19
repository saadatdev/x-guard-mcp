import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, parseConfig } from '../src/config.js';

const EXAMPLE = path.resolve(import.meta.dirname, '..', 'config.example.json');

describe('config loading', () => {
  it('accepts config.example.json', () => {
    const config = parseConfig(JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')));
    expect(config.timezone).toBe('UTC');
    expect(config.budget.daily_post_creates).toBeGreaterThan(0);
  });

  it('tells the user to copy the example when config.json is missing', () => {
    expect(() => loadConfig(path.join(import.meta.dirname, 'does-not-exist.json'))).toThrow(
      /Copy config\.example\.json to config\.json/,
    );
  });

  it('names the invalid field', () => {
    expect(() => parseConfig({ timezone: 'UTC' })).toThrow(/config\.json is invalid: topics/);
  });
});
