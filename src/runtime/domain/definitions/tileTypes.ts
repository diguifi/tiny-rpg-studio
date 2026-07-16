export type TileFrame = string[][];
export type TileId = string | number;
export type TileVisualEffectKind = 'none' | 'water' | 'lava';

export type TileDefinition = {
  id?: TileId;
  name?: string;
  nameKey?: string;
  collision?: boolean;
  frames?: TileFrame[];
  pixels?: TileFrame;
  category?: string;
  animated?: boolean;
  layouts?: (number | null)[][][];
  /** Explicit liquid visual effect (VERSION_36+). */
  visualEffect?: TileVisualEffectKind;
};

export type TileMapLayer = (TileId | null)[][];
export type TileMap = {
  ground: TileMapLayer;
  overlay: TileMapLayer;
};

export type Tileset = {
  tiles: TileDefinition[];
  maps: TileMap[];
  map: TileMap;
};

export type GameStateApi = {
  game: {
    tileset: Tileset;
    roomSize?: number;
    world?: { rows?: number; cols?: number };
  };
};

export type TileDefinitionsSource = {
  TILE_PRESETS?: TileDefinition[];
};
