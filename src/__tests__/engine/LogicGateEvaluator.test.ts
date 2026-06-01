import { describe, it, expect, vi, afterEach } from 'vitest';
import { StateVariableManager } from '../../runtime/domain/state/StateVariableManager';
import { ITEM_TYPES } from '../../runtime/domain/constants/itemTypes';
import type { ObjectEntry } from '../../runtime/domain/state/StateObjectManager';
import type { GameDefinition, RuntimeState } from '../../types/gameState';

const makeGame = (): GameDefinition => ({
  title: 'Game',
  author: 'Author',
  palette: ['#000000', '#111111', '#222222'],
  roomSize: 8,
  world: { rows: 1, cols: 1 },
  rooms: [],
  start: { x: 1, y: 1, roomIndex: 0 },
  sprites: [],
  enemies: [],
  items: [],
  objects: [],
  variables: [],
  exits: [],
  tileset: { tiles: [], maps: [], map: { ground: [], overlay: [] } },
});

const makeManager = () => {
  const game = makeGame();
  const state = { variables: [] } as unknown as RuntimeState;
  const manager = new StateVariableManager(game, state);
  game.variables = manager.normalizeVariables([]);
  state.variables = manager.cloneVariables(game.variables);
  return manager;
};

const gate = (type: string, input: string | null, input2: string | null, output: string | null): ObjectEntry => ({
  id: `${type}-0`,
  type: type as ObjectEntry['type'],
  roomIndex: 0,
  x: 1,
  y: 1,
  isLogicGate: true,
  inputVariableId: input,
  inputVariableId2: input2,
  outputVariableId: output,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateLogicGates - truth tables', () => {
  it('NOT inverts the single input', () => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_NOT, 'var-1', null, 'var-2')];

    m.setVariableValue('var-1', false);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-2')).toBe(true);

    m.setVariableValue('var-1', true);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-2')).toBe(false);
  });

  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])('AND(%s, %s) = %s', (a, b, expected) => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_AND, 'var-1', 'var-2', 'var-3')];
    m.setVariableValue('var-1', a);
    m.setVariableValue('var-2', b);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-3')).toBe(expected);
  });

  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])('OR(%s, %s) = %s', (a, b, expected) => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_OR, 'var-1', 'var-2', 'var-3')];
    m.setVariableValue('var-1', a);
    m.setVariableValue('var-2', b);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-3')).toBe(expected);
  });

  it.each([
    [false, false, true],
    [true, false, true],
    [false, true, true],
    [true, true, false],
  ])('NAND(%s, %s) = %s', (a, b, expected) => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_NAND, 'var-1', 'var-2', 'var-3')];
    m.setVariableValue('var-1', a);
    m.setVariableValue('var-2', b);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-3')).toBe(expected);
  });

  it.each([
    [false, false, true],
    [true, false, false],
    [false, true, false],
    [true, true, false],
  ])('NOR(%s, %s) = %s', (a, b, expected) => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_NOR, 'var-1', 'var-2', 'var-3')];
    m.setVariableValue('var-1', a);
    m.setVariableValue('var-2', b);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-3')).toBe(expected);
  });
});

describe('evaluateLogicGates - edge cases', () => {
  it('treats null inputs as false', () => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_AND, null, null, 'var-3')];
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-3')).toBe(false);
  });

  it('discards result when output is null (no error)', () => {
    const m = makeManager();
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_NOT, 'var-1', null, null)];
    expect(() => m.evaluateLogicGates(objects)).not.toThrow();
  });

  it('returns empty array when there are no gates', () => {
    const m = makeManager();
    expect(m.evaluateLogicGates([])).toEqual([]);
  });
});

describe('evaluateLogicGates - chaining', () => {
  it('propagates through chained gates in one call', () => {
    const m = makeManager();
    // NOT(var-1) -> var-2 ; AND(var-2, var-3) -> var-4
    const objects = [
      gate(ITEM_TYPES.LOGIC_GATE_NOT, 'var-1', null, 'var-2'),
      gate(ITEM_TYPES.LOGIC_GATE_AND, 'var-2', 'var-3', 'var-4'),
    ];
    m.setVariableValue('var-1', false); // NOT -> var-2 = true
    m.setVariableValue('var-3', true);
    m.evaluateLogicGates(objects);
    expect(m.isVariableOn('var-2')).toBe(true);
    expect(m.isVariableOn('var-4')).toBe(true);
  });
});

describe('evaluateLogicGates - cycle protection', () => {
  it('stops at the iteration limit and warns without throwing', () => {
    const m = makeManager();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Oscillating cycle: NOT(var-1) -> var-1
    const objects = [gate(ITEM_TYPES.LOGIC_GATE_NOT, 'var-1', null, 'var-1')];
    expect(() => m.evaluateLogicGates(objects)).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
