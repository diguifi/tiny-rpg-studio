import { describe, expect, it } from 'vitest';
import {
  CURRENT_APP_VERSION,
  createVersionManifest,
  resolveVersionJsonUrl,
} from '../../pwa/AppVersion';

describe('PWA app version metadata', () => {
  it('exposes a non-empty bundled app version', () => {
    expect(CURRENT_APP_VERSION).toEqual(expect.any(String));
    expect(CURRENT_APP_VERSION.trim()).not.toBe('');
  });

  it('creates the static version.json payload emitted at build time', () => {
    expect(createVersionManifest('1.4.0+20260702-abc123')).toEqual({
      version: '1.4.0+20260702-abc123',
    });
  });

  it('resolves version.json against relative Vite base URLs and subdirectory deployments', () => {
    expect(resolveVersionJsonUrl('./', 'https://example.com/tiny-rpg-studio/editor/?tab=game#room').href)
      .toBe('https://example.com/tiny-rpg-studio/editor/version.json');
    expect(resolveVersionJsonUrl('../', 'https://example.com/tiny-rpg-studio/app/index.html').href)
      .toBe('https://example.com/tiny-rpg-studio/version.json');
    expect(resolveVersionJsonUrl('/studio/', 'https://example.com/tiny-rpg-studio/app/').href)
      .toBe('https://example.com/studio/version.json');
  });
});
