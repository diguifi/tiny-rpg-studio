import { describe, expect, it } from 'vitest';
import { ShareConstants } from '../../runtime/infra/share/ShareConstants';
import { ShareEncoder } from '../../runtime/infra/share/ShareEncoder';
import { ShareDecoder } from '../../runtime/infra/share/ShareDecoder';

describe('VERSION_36 tile visual effects', () => {
  it('registers VERSION_36 and TILE_VISUAL_EFFECT_VERSION', () => {
    expect(ShareConstants.VERSION_36).toBe(36);
    expect(ShareConstants.VERSION).toBe(36);
    expect(ShareConstants.TILE_VISUAL_EFFECT_VERSION).toBe(ShareConstants.VERSION_36);
    expect(ShareConstants.SUPPORTED_VERSIONS.has(ShareConstants.VERSION_36)).toBe(true);
  });

  it('collectTileVisualEffects keeps water/lava/none and skips unset', () => {
    const map = ShareEncoder.collectTileVisualEffects([
      { id: 0, visualEffect: undefined },
      { id: 5, visualEffect: 'water' },
      { id: 6, visualEffect: 'lava' },
      { id: 1, visualEffect: 'none' },
      { id: 2, visualEffect: 'bogus' },
    ]);
    expect(map).toEqual({
      '5': 'water',
      '6': 'lava',
      '1': 'none',
    });
  });

  it('round-trips tile visual effects through share encode/decode', () => {
    const gameData = {
      title: 'FX',
      start: { x: 1, y: 1, roomIndex: 0 },
      rooms: [],
      sprites: [],
      enemies: [],
      objects: [],
      variables: [],
      tileset: {
        tiles: [
          { id: 0, visualEffect: 'none' as const },
          { id: 5, visualEffect: 'water' as const },
          { id: 8, visualEffect: 'lava' as const },
        ],
        maps: [],
      },
    };

    const code = ShareEncoder.buildShareCode(gameData as never);
    expect(code).toContain('.0');
    expect(code.startsWith(`v${ShareConstants.VERSION_36.toString(36)}.`)).toBe(true);

    const decoded = ShareDecoder.decodeShareCode(code) as {
      tileVisualEffects?: Record<string, string>;
      enableEffects?: boolean;
    } | null;
    expect(decoded).toBeTruthy();
    expect(decoded?.tileVisualEffects).toEqual({
      '0': 'none',
      '5': 'water',
      '8': 'lava',
    });
    // Default master switch is on when absent.
    expect(decoded?.enableEffects).toBe(true);
  });

  it('round-trips global enableEffects=false under VERSION_36', () => {
    const gameData = {
      title: 'NoFX',
      enableEffects: false,
      start: { x: 1, y: 1, roomIndex: 0 },
      rooms: [],
      sprites: [],
      enemies: [],
      objects: [],
      variables: [],
      tileset: {
        tiles: [{ id: 5, visualEffect: 'water' as const }],
        maps: [],
      },
    };

    const code = ShareEncoder.buildShareCode(gameData as never);
    expect(code).toContain('.~0');

    const decoded = ShareDecoder.decodeShareCode(code) as {
      enableEffects?: boolean;
      tileVisualEffects?: Record<string, string>;
    } | null;
    expect(decoded?.enableEffects).toBe(false);
    expect(decoded?.tileVisualEffects).toEqual({ '5': 'water' });
  });
});
