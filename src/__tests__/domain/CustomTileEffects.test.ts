import { describe, expect, it } from 'vitest';
import {
  BASE_TILE_EFFECT_IDS,
  CUSTOM_TILE_EFFECT_LIMITS,
  createCustomTileEffect,
  normalizeCustomTileEffectColor,
  normalizeCustomTileEffects,
  normalizeTileVisualEffect,
} from '../../runtime/domain/definitions/customTileEffects';

describe('custom tile effect definitions', () => {
  it('creates trimmed definitions with stable short IDs and ordered passes', () => {
    const first = createCustomTileEffect([], '  Magic glow  ', ['glow', 'sparkle']);
    expect(first).toEqual({
      ok: true,
      definition: { id: 'custom:0', name: 'Magic gl', baseEffectIds: ['glow', 'sparkle'] },
    });
    const second = createCustomTileEffect(
      first.ok ? [first.definition] : [],
      'Mist',
      ['cool-tint'],
    );
    expect(second.ok && second.definition.id).toBe('custom:1');
  });

  it('normalizes strict six-digit colors and omits unsupported values', () => {
    expect(normalizeCustomTileEffectColor('#a1b2c3')).toBe('#A1B2C3');
    expect(normalizeCustomTileEffectColor('#ABCDEF')).toBe('#ABCDEF');
    for (const invalid of ['#abc', '#12345678', '123456', 'inherit', null, 123]) {
      expect(normalizeCustomTileEffectColor(invalid)).toBeUndefined();
    }

    expect(createCustomTileEffect([], 'Color', ['glow'], '#00ff7f')).toEqual({
      ok: true,
      definition: {
        id: 'custom:0', name: 'Color', baseEffectIds: ['glow'], color: '#00FF7F',
      },
    });
    expect(createCustomTileEffect([], 'Legacy', ['glow'], '#bad')).toEqual({
      ok: true,
      definition: { id: 'custom:0', name: 'Legacy', baseEffectIds: ['glow'] },
    });
  });

  it('rejects invalid drafts and case-insensitive duplicate names', () => {
    const existing = [{ id: 'custom:0', name: 'Glow', baseEffectIds: ['glow'] }];
    expect(createCustomTileEffect(existing, ' ', ['glow'])).toEqual({ ok: false, error: 'empty-name' });
    expect(createCustomTileEffect(existing, 'gLoW', ['sparkle'])).toEqual({ ok: false, error: 'duplicate-name' });
    expect(createCustomTileEffect(existing, 'Empty', [])).toEqual({ ok: false, error: 'empty-passes' });
    expect(createCustomTileEffect(existing, 'Bad', ['glow', 'glow'])).toEqual({ ok: false, error: 'invalid-passes' });
    expect(createCustomTileEffect(existing, 'Bad', ['arbitrary-code'])).toEqual({ ok: false, error: 'invalid-passes' });
  });

  it('normalizes untrusted input deterministically', () => {
    const inherited: unknown = Object.create({ id: 'custom:9', name: 'Inherited', baseEffectIds: ['glow'] });
    const normalized = normalizeCustomTileEffects([
      inherited,
      { id: 'bad', name: 'Bad id', baseEffectIds: ['glow'] },
      { id: 'custom:0', name: ' First ', baseEffectIds: ['glow', 'unknown', 'glow', 'sparkle'] },
      { id: 'custom:0', name: 'Duplicate id', baseEffectIds: ['caustic'] },
      { id: 'custom:1', name: 'first', baseEffectIds: ['caustic'] },
      { id: 'custom:2', name: 'No passes', baseEffectIds: ['unknown'] },
    ]);
    expect(normalized).toEqual([
      { id: 'custom:0', name: 'First', baseEffectIds: ['glow', 'sparkle'] },
    ]);
  });

  it('preserves only own valid color data from normalized definitions', () => {
    Object.defineProperty(Object.prototype, 'color', {
      configurable: true,
      value: '#123456',
    });
    try {
      expect(normalizeCustomTileEffects([
        { id: 'custom:0', name: 'Inherited', baseEffectIds: ['glow'] },
        { id: 'custom:1', name: 'Lower', baseEffectIds: ['cool-tint'], color: '#abcdef' },
        { id: 'custom:2', name: 'Alpha', baseEffectIds: ['glow'], color: '#12345678' },
      ])).toEqual([
        { id: 'custom:0', name: 'Inherite', baseEffectIds: ['glow'] },
        { id: 'custom:1', name: 'Lower', baseEffectIds: ['cool-tint'], color: '#ABCDEF' },
        { id: 'custom:2', name: 'Alpha', baseEffectIds: ['glow'] },
      ]);
    } finally {
      delete (Object.prototype as { color?: string }).color;
    }
  });

  it('enforces project limits and turns dangling assignments into none', () => {
    const definitions = Array.from({ length: CUSTOM_TILE_EFFECT_LIMITS.maxDefinitions }, (_, index) => ({
      id: `custom:${index.toString(36)}`,
      name: `FX ${index}`,
      baseEffectIds: [BASE_TILE_EFFECT_IDS[index % BASE_TILE_EFFECT_IDS.length]],
    }));
    expect(createCustomTileEffect(definitions, 'Overflow', ['glow'])).toEqual({ ok: false, error: 'project-limit' });
    expect(normalizeTileVisualEffect('custom:0', definitions)).toBe('custom:0');
    expect(normalizeTileVisualEffect('custom:zzz', definitions)).toBe('none');
    expect(normalizeTileVisualEffect('__proto__', definitions)).toBe('none');
  });
});
