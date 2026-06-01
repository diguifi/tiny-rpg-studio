import { beforeAll, describe, expect, it } from 'vitest';
import { setupShareGlobals, ShareConstants, ShareEncoder, ShareDecoder, ShareVariableCodec, SharePositionCodec } from './shareTestUtils';

type ShareTestData = {
  objects?: Array<Record<string, unknown>>;
  sprites?: Array<Record<string, unknown>>;
  enemies?: Array<Record<string, unknown>>;
};

const decodeShare = (code: string | null | undefined): ShareTestData | null =>
  ShareDecoder.decodeShareCode(code) as ShareTestData | null;

describe('Share — 16 variables', () => {
  beforeAll(() => {
    setupShareGlobals();
  });

  it('exposes 16 variable ids plus skill:bard (17 total), skill:bard kept at index 9', () => {
    const ids = ShareConstants.VARIABLE_IDS;
    expect(ids.length).toBe(17);
    expect(ids[9]).toBe('skill:bard'); // preserved for backward compatibility
    expect(ids.includes('var-16')).toBe(true);
    expect(ShareConstants.VARIABLE_NAMES.length).toBe(17);
    expect(ShareConstants.VARIABLE_COLORS.length).toBe(17);
  });

  it('round-trips var-16 as the highest index (byte-encoded, exceeds nibble range)', () => {
    // var-16 is at index 16 → ref value 17, which does not fit in a 4-bit nibble
    const nibble = ShareVariableCodec.variableIdToNibble('var-16');
    expect(nibble).toBe(17);
    expect(ShareVariableCodec.nibbleToVariableId(17)).toBe('var-16');
  });

  it('round-trips var-16 referenced by a logic gate output', () => {
    const game = {
      title: 'V16',
      author: 'A',
      start: { x: 1, y: 1, roomIndex: 0 },
      sprites: [],
      enemies: [],
      objects: [
        { type: 'logic-gate-and', roomIndex: 0, x: 1, y: 1, inputVariableId: 'var-15', inputVariableId2: 'var-10', outputVariableId: 'var-16' },
        { type: 'logic-led', roomIndex: 0, x: 2, y: 1, variableId: 'var-16' },
      ],
      variables: [],
    };
    const decoded = decodeShare(ShareEncoder.buildShareCode(game));
    const gate = decoded?.objects?.find((o) => o.type === 'logic-gate-and');
    const led = decoded?.objects?.find((o) => o.type === 'logic-led');
    expect(gate?.inputVariableId).toBe('var-15');
    expect(gate?.inputVariableId2).toBe('var-10');
    expect(gate?.outputVariableId).toBe('var-16');
    expect(led?.variableId).toBe('var-16');
  });

  it('round-trips var-16 on a switch and a variable-door', () => {
    const game = {
      title: 'V16', author: 'A', start: { x: 1, y: 1, roomIndex: 0 }, sprites: [], enemies: [],
      objects: [
        { type: 'switch', roomIndex: 0, x: 0, y: 0, variableId: 'var-16', on: true },
        { type: 'door-variable', roomIndex: 0, x: 1, y: 0, variableId: 'var-13' },
      ],
      variables: [],
    };
    const decoded = decodeShare(ShareEncoder.buildShareCode(game));
    const sw = decoded?.objects?.find((o) => o.type === 'switch');
    const door = decoded?.objects?.find((o) => o.type === 'door-variable');
    expect(sw?.variableId).toBe('var-16');
    expect(door?.variableId).toBe('var-13');
  });

  it('preserves var-16 ON/OFF state through the variable bitmask', () => {
    const variables = ShareConstants.VARIABLE_IDS
      .filter((id) => id.startsWith('var-'))
      .map((id) => ({ id, value: id === 'var-16' || id === 'var-1' }));
    const game = {
      title: 'V16', author: 'A', start: { x: 1, y: 1, roomIndex: 0 }, sprites: [], enemies: [], objects: [],
      variables,
    };
    const decoded = ShareDecoder.decodeShareCode(ShareEncoder.buildShareCode(game)) as { variables?: Array<{ id: string; value: boolean }> } | null;
    const byId = new Map((decoded?.variables ?? []).map((v) => [v.id, v.value]));
    expect(byId.get('var-16')).toBe(true);
    expect(byId.get('var-1')).toBe(true);
    expect(byId.get('var-8')).toBe(false);
  });

  it('backward compatibility: a v30 (nibble) share with a var-9 switch still decodes correctly', () => {
    // Hand-craft a v30 share: switch at (0,0) room 0 referencing var-9 via NIBBLE encoding.
    const versionToken = 'v' + (30).toString(36);
    const switchPos = 'J' + SharePositionCodec.encodePositions([{ x: 0, y: 0, roomIndex: 0 }]);
    const switchVar = 'K' + ShareVariableCodec.encodeVariableNibbleArray([9]); // var-9 (nibble 9)
    const switchState = 'L' + ShareVariableCodec.encodeVariableNibbleArray([1]); // on
    const code = [versionToken, switchPos, switchVar, switchState].join('.');

    const decoded = decodeShare(code);
    const sw = decoded?.objects?.find((o) => o.type === 'switch');
    expect(sw).toBeTruthy();
    expect(sw?.variableId).toBe('var-9');
    expect(sw?.on).toBe(true);
  });
});
