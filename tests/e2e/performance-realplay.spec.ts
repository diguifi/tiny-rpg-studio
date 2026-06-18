import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { TinyRPG } from '../../src/sdk';
import type { EnemyType, NpcType } from '../../src/sdk';

/**
 * Headed "real play" profiling harness.
 *
 * Opens a VISIBLE Chromium window and actually plays a dense, traversable world
 * (rooms connected by doorways, player equipped with a sword + potions): it
 * explores rooms, fights enemies, advances dialogs, resolves level-up/pickup
 * overlays and restarts on death — all reactively, from a live game snapshot.
 *
 * Unlike the stress harness, rendering is left EVENT-DRIVEN (`?profile`, no forced
 * redraw loop), so the numbers reflect how the game truly behaves while played in
 * a real browser. Artifacts land in `perf-artifacts/`.
 */

const SIZE = 8;
const ROOMS = 9;
const GROUND_TILES = [0, 1, 2, 3, 4, 16, 17, 1];
const BORDER_DECOR = [10, 8, 9, 7, 15, 11];
const DOOR_LO = 3;
const DOOR_HI = 4;
const NPCS_PER_ROOM = 6;
const PLAY_DURATION_MS = 35000;

const NPC_TYPES: NpcType[] = [
  'villager-man', 'villager-woman', 'old-mage', 'child', 'king', 'knight', 'thief', 'blacksmith',
  'villager-man-elf', 'villager-woman-elf', 'old-mage-elf', 'knight-dwarf',
];
const ENEMY_TYPES: EnemyType[] = [
  'giant-rat', 'bandit', 'skeleton', 'dark-knight', 'necromancer', 'dragon', 'fallen-king', 'ancient-demon',
];

type Cell = [number, number];

function isDoorway(x: number, y: number): boolean {
  const onTopBottom = y === 0 || y === SIZE - 1;
  const onLeftRight = x === 0 || x === SIZE - 1;
  if (onTopBottom && (x === DOOR_LO || x === DOOR_HI)) return true;
  if (onLeftRight && (y === DOOR_LO || y === DOOR_HI)) return true;
  return false;
}

function buildGround(room: number): number[][] {
  const matrix: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < SIZE; x++) row.push(GROUND_TILES[(x + y * 3 + room) % GROUND_TILES.length]);
    matrix.push(row);
  }
  return matrix;
}

function buildOverlay(room: number): (number | null)[][] {
  const matrix: (number | null)[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: (number | null)[] = [];
    for (let x = 0; x < SIZE; x++) {
      const border = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
      row.push(border && !isDoorway(x, y) ? BORDER_DECOR[(x + y + room) % BORDER_DECOR.length] : null);
    }
    matrix.push(row);
  }
  return matrix;
}

/** Interior cells from bottom-right back to top-left, keeping the player's
 * top-left spawn and the doorway approaches clear. */
function entityCells(reserved: Set<string>): Cell[] {
  const cells: Cell[] = [];
  for (let y = SIZE - 2; y >= 1; y--) {
    for (let x = SIZE - 2; x >= 1; x--) {
      if (!reserved.has(`${x},${y}`)) cells.push([x, y]);
    }
  }
  return cells;
}

/** Interior cells forming a plus-shaped corridor (rows/cols 3-4), kept entity-free
 * so the player can always reach every doorway and traverse the whole world. */
function corridorReserved(): Set<string> {
  const set = new Set<string>();
  for (let y = 1; y <= SIZE - 2; y++) {
    for (let x = 1; x <= SIZE - 2; x++) {
      if (x === DOOR_LO || x === DOOR_HI || y === DOOR_LO || y === DOOR_HI) set.add(`${x},${y}`);
    }
  }
  return set;
}

function buildPlayableGameCode(): { code: string; counts: Record<string, number> } {
  const builder = new TinyRPG()
    .setTitle('Perf Real-Play World')
    .setAuthor('profiler')
    .setPlayerStart({ x: 1, y: 1, room: 0 });

  let npcCursor = 0;
  let enemyCursor = 0;
  let totalNpcs = 0;
  let totalEnemies = 0;
  let totalOverlay = 0;

  for (let room = 0; room < ROOMS; room++) {
    const rb = builder.room(room);
    rb.ground(buildGround(room));
    const overlay = buildOverlay(room);
    rb.overlay(overlay);
    totalOverlay += overlay.flat().filter((v) => v !== null).length;

    const reserved = corridorReserved();
    if (room === 0) {
      reserved.add('1,1'); // player spawn
      rb.addSword({ x: 2, y: 1, tier: 'iron' });
      rb.addPotion({ x: 1, y: 2 });
      rb.addXpScroll({ x: 2, y: 2 });
      ['2,1', '1,2', '2,2'].forEach((c) => reserved.add(c));
    }

    const cells = entityCells(reserved);
    let idx = 0;
    for (let n = 0; n < NPCS_PER_ROOM && idx < cells.length; n++, idx++) {
      const [x, y] = cells[idx];
      rb.addNPC({ type: NPC_TYPES[npcCursor++ % NPC_TYPES.length], x, y, text: `Hello from room ${room}!` });
      totalNpcs++;
    }
    const enemiesHere = room === 0 ? 2 : 5;
    for (let e = 0; e < enemiesHere && idx < cells.length; e++, idx++) {
      const [x, y] = cells[idx];
      rb.addEnemy({ type: ENEMY_TYPES[enemyCursor++ % ENEMY_TYPES.length], x, y });
      totalEnemies++;
    }
  }

  return {
    code: builder.toShareCode(),
    counts: {
      roomCount: ROOMS,
      npcCount: totalNpcs,
      enemyCount: totalEnemies,
      groundTileCount: ROOMS * SIZE * SIZE,
      overlayTileCount: totalOverlay,
    },
  };
}

type Snapshot = {
  intro: boolean;
  gameOver: boolean;
  levelUp: boolean;
  pickup: boolean;
  dialog: boolean;
  playerX: number;
  playerY: number;
  playerRoom: number;
};

type ProfilerWindow = Window & {
  __TINY_RPG_PROFILER?: {
    isEnabled: boolean;
    getReport: () => unknown;
    setSceneNotes: (notes: Record<string, number>) => void;
    getGameSnapshot: () => Snapshot;
  };
};

/**
 * Picks the next key to walk toward a doorway for the current target direction
 * (0=right, 1=down, 2=left, 3=up): first align onto the corridor rows/cols 3-4,
 * then push toward the edge so the player crosses into the neighbouring room.
 */
function decideMove(s: Snapshot, target: number): string {
  const alignVertical = s.playerY < DOOR_LO ? 'ArrowDown' : s.playerY > DOOR_HI ? 'ArrowUp' : null;
  const alignHorizontal = s.playerX < DOOR_LO ? 'ArrowRight' : s.playerX > DOOR_HI ? 'ArrowLeft' : null;
  switch (target) {
    case 0: return alignVertical ?? 'ArrowRight';
    case 1: return alignHorizontal ?? 'ArrowDown';
    case 2: return alignVertical ?? 'ArrowLeft';
    default: return alignHorizontal ?? 'ArrowUp';
  }
}

// Run with a real, visible window so the gameplay can be watched live.
test.use({
  headless: false,
  launchOptions: { slowMo: 70, args: ['--start-maximized'] },
  viewport: { width: 1280, height: 800 },
});

test('actually plays a dense world in a visible browser and profiles it', async ({ page }) => {
  test.setTimeout(120000);

  const { code, counts } = buildPlayableGameCode();
  await page.goto(`/?profile#${code}`);

  await page.waitForFunction(() => Boolean((window as ProfilerWindow).__TINY_RPG_PROFILER?.isEnabled));
  await page.evaluate((notes) => (window as ProfilerWindow).__TINY_RPG_PROFILER?.setSceneNotes(notes), counts);
  await expect(page.locator('#game-canvas')).toHaveCount(1);

  const shotDir = path.join(process.cwd(), 'perf-artifacts', 'realplay-screenshots');
  await fs.mkdir(shotDir, { recursive: true });

  const snapshot = (): Promise<Snapshot | undefined> =>
    page.evaluate(() => (window as ProfilerWindow).__TINY_RPG_PROFILER?.getGameSnapshot());

  const roomsVisited = new Set<number>();
  let gameOvers = 0;
  let levelUps = 0;
  let moveStep = 0;
  let shotIndex = 0;
  let target = 0; // current exit direction being sought
  let stuck = 0;
  let prev: Snapshot | null = null;
  const start = Date.now();

  // Reactive play loop: respond to whatever the game is currently showing.
  while (Date.now() - start < PLAY_DURATION_MS) {
    const state = await snapshot();
    if (!state) {
      await page.keyboard.press('Enter');
      prev = null;
    } else if (state.intro) {
      await page.keyboard.press('Enter');
      prev = null;
    } else if (state.gameOver) {
      gameOvers += 1;
      await page.keyboard.press('Enter'); // restart and keep playing
      prev = null;
    } else if (state.levelUp) {
      levelUps += 1;
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter'); // pick a skill
      prev = null;
    } else if (state.pickup) {
      await page.keyboard.press('Enter');
      prev = null;
    } else if (state.dialog) {
      await page.keyboard.press('Enter'); // advance NPC dialog
      prev = null;
    } else {
      roomsVisited.add(state.playerRoom);
      // Track progress vs. the previous move to rotate the target direction when
      // we cross a room boundary or get blocked (wall/NPC) for several tries.
      if (prev) {
        if (state.playerRoom !== prev.playerRoom) {
          target = (target + 1) % 4;
          stuck = 0;
        } else if (state.playerX === prev.playerX && state.playerY === prev.playerY) {
          stuck += 1;
          if (stuck >= 4) {
            target = (target + 1) % 4;
            stuck = 0;
          }
        } else {
          stuck = 0;
        }
      }
      await page.keyboard.press(decideMove(state, target));
      prev = state;
      moveStep += 1;
    }

    if (moveStep > 0 && moveStep % 30 === 0) {
      await page.screenshot({ path: path.join(shotDir, `play-${String(shotIndex++).padStart(2, '0')}.png`) });
    }
    await page.waitForTimeout(90);
  }

  // Hold the final frame on screen so the run is clearly visible before closing.
  await page.screenshot({ path: path.join(shotDir, 'play-final.png') });
  await page.waitForTimeout(6000);

  const report = await page.evaluate(() => (window as ProfilerWindow).__TINY_RPG_PROFILER?.getReport());
  expect(report).toBeTruthy();

  const outDir = path.join(process.cwd(), 'perf-artifacts');
  await fs.writeFile(path.join(outDir, 'performance-report-realplay.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'realplay-share-code.txt'), code, 'utf8');
  await fs.writeFile(
    path.join(outDir, 'realplay-meta.json'),
    JSON.stringify(
      { ...counts, roomsVisited: [...roomsVisited].sort((a, b) => a - b), gameOvers, levelUps, moves: moveStep },
      null,
      2,
    ),
    'utf8',
  );

  const typed = report as { frame?: { count?: number } };
  expect(typed.frame?.count ?? 0).toBeGreaterThan(0);
  expect(roomsVisited.size).toBeGreaterThan(0);
});
