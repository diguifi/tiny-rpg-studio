import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { TinyRPG } from '../../src/sdk';
import type { EnemyType, NpcType } from '../../src/sdk';

/**
 * Performance profiling harness.
 *
 * Builds a deliberately heavy game (all 9 rooms filled with varied/animated
 * tiles, dozens of NPCs and enemies), loads it with the runtime profiler
 * enabled (`?profile=render` also drives a per-frame redraw loop), exercises it
 * for a fixed window, then reads the structured report off
 * `window.__TINY_RPG_PROFILER` and writes it to `perf-artifacts/`.
 */

const SIZE = 8; // tiles per room side (GameConfig.world.roomSize)
const ROOMS = 9; // 3x3 world (GameConfig.world.rows * cols)

// Walkable ground tiles; id 1 ("Grama Alta") is animated, so the map keeps the
// tile-animation redraw loop busy while remaining traversable.
const GROUND_TILES = [0, 1, 2, 3, 4, 16, 17, 1];
// Collision decorations used as a border ring (walls, trees, torches, rocks).
const BORDER_DECOR = [10, 8, 9, 7, 15, 11];

const NPC_TYPES: NpcType[] = [
  'villager-man', 'villager-woman', 'old-mage', 'child', 'king', 'knight', 'thief', 'blacksmith',
  'villager-man-elf', 'villager-woman-elf', 'old-mage-elf', 'child-elf',
  'villager-man-dwarf', 'villager-woman-dwarf', 'old-mage-dwarf', 'knight-dwarf',
];

const ENEMY_TYPES: EnemyType[] = [
  'giant-rat', 'bandit', 'skeleton', 'dark-knight', 'necromancer', 'dragon', 'fallen-king', 'ancient-demon',
];

const NPCS_PER_ROOM = 8;
const ENEMIES_PER_ROOM = 6;
const DRIVE_DURATION_MS = 20000;

type Cell = [number, number];

function buildGround(room: number): number[][] {
  const matrix: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < SIZE; x++) {
      row.push(GROUND_TILES[(x + y * 3 + room) % GROUND_TILES.length]);
    }
    matrix.push(row);
  }
  return matrix;
}

function buildOverlay(room: number): (number | null)[][] {
  const matrix: (number | null)[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: (number | null)[] = [];
    for (let x = 0; x < SIZE; x++) {
      const isBorder = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
      row.push(isBorder ? BORDER_DECOR[(x + y + room) % BORDER_DECOR.length] : null);
    }
    matrix.push(row);
  }
  return matrix;
}

/** Interior cells (1..6) from bottom-right back to top-left, so entities cluster
 * away from the player's top-left spawn and leave room to roam. */
function interiorCells(): Cell[] {
  const cells: Cell[] = [];
  for (let y = SIZE - 2; y >= 1; y--) {
    for (let x = SIZE - 2; x >= 1; x--) {
      cells.push([x, y]);
    }
  }
  return cells;
}

function buildDenseGameCode(): { code: string; counts: Record<string, number> } {
  const builder = new TinyRPG()
    .setTitle('Perf Stress World')
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

    const cells = interiorCells();
    const playerCell = room === 0 ? `${1},${1}` : '';
    const free = cells.filter(([x, y]) => `${x},${y}` !== playerCell);

    let idx = 0;
    for (let n = 0; n < NPCS_PER_ROOM && idx < free.length; n++, idx++) {
      const [x, y] = free[idx];
      rb.addNPC({
        type: NPC_TYPES[npcCursor++ % NPC_TYPES.length],
        x,
        y,
        text: `NPC ${npcCursor} in room ${room}.`,
      });
      totalNpcs++;
    }

    // Keep the spawn room combat-free so the player survives and keeps moving;
    // in solo mode every enemy in every room still ticks each interval.
    const enemiesHere = room === 0 ? 0 : ENEMIES_PER_ROOM;
    for (let e = 0; e < enemiesHere && idx < free.length; e++, idx++) {
      const [x, y] = free[idx];
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

type ProfilerWindow = Window & {
  __TINY_RPG_PROFILER?: {
    isEnabled: boolean;
    getReport: () => unknown;
    setSceneNotes: (notes: Record<string, number>) => void;
  };
};

test('profiles a dense world and writes a performance report', async ({ page }) => {
  test.setTimeout(120000);

  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const { code, counts } = buildDenseGameCode();

  await page.goto(`/?profile=render#${code}`);

  // Profiler installs itself during app boot.
  await page.waitForFunction(() => Boolean((window as ProfilerWindow).__TINY_RPG_PROFILER?.isEnabled));

  await page.evaluate((notes) => {
    (window as ProfilerWindow).__TINY_RPG_PROFILER?.setSceneNotes(notes);
  }, counts);

  await expect(page.locator('#game-canvas')).toHaveCount(1);

  // Dismiss the intro screen so the simulation starts running.
  await page.keyboard.press('ArrowDown');

  // Drive the game: continuous movement plus periodic confirm to clear NPC
  // dialogs. The render loop + enemy timer run independently in the page.
  const moves = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  const start = Date.now();
  let step = 0;
  while (Date.now() - start < DRIVE_DURATION_MS) {
    await page.keyboard.press(moves[step % moves.length]);
    if (step % 6 === 0) await page.keyboard.press('Enter');
    step += 1;
    await page.waitForTimeout(110);
  }

  const report = await page.evaluate(() => (window as ProfilerWindow).__TINY_RPG_PROFILER?.getReport());
  expect(report).toBeTruthy();

  const outDir = path.join(process.cwd(), 'perf-artifacts');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'performance-report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'game-share-code.txt'), code, 'utf8');
  await fs.writeFile(
    path.join(outDir, 'scene-counts.json'),
    JSON.stringify({ ...counts, shareCodeLength: code.length, pageErrors: consoleErrors }, null, 2),
    'utf8',
  );

  // The instrumented draw pipeline and frame loop must have produced samples.
  const typedReport = report as { frame?: { count?: number }; sections?: Record<string, unknown> };
  expect(typedReport.frame?.count ?? 0).toBeGreaterThan(0);
  expect(typedReport.sections && 'render.frame' in typedReport.sections).toBeTruthy();
});
