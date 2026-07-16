import { lavaTileEffect } from './lavaEffect';
import { waterTileEffect } from './waterEffect';
import type { TileEffectDefinition, TileVisualEffectId } from './types';

/**
 * Registered tile canvas effects.
 * Add a new effect file, implement TileEffectDefinition, then append it here.
 */
export const TILE_EFFECT_DEFINITIONS: readonly TileEffectDefinition[] = [
    waterTileEffect,
    lavaTileEffect,
];

const byId = new Map<TileVisualEffectId, TileEffectDefinition>(
    TILE_EFFECT_DEFINITIONS.map((effect) => [effect.id, effect])
);

export function getTileEffectDefinition(id: TileVisualEffectId): TileEffectDefinition | null {
    if (id === 'none') return null;
    return byId.get(id) ?? null;
}
