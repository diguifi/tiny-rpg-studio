/**
 * PerformanceProfiler — a self-contained, opt-in runtime profiler for the game.
 *
 * It is dormant until {@link PerformanceProfiler.enable} is called (the app calls
 * it automatically when the page is loaded with a `?profile` query flag). Once
 * enabled it gathers, without depending on any engine internals:
 *
 *  - Display frame cadence (FPS + frame-interval distribution + jank buckets),
 *    measured from `requestAnimationFrame`.
 *  - Per-section wall-clock timings for any code path wrapped via
 *    {@link instrument} / {@link time} (the engine's draw pipeline and enemy AI
 *    tick are wired up in {@link attach}).
 *  - Long tasks (`PerformanceObserver('longtask')`) and total blocking time.
 *  - JS heap usage over time (`performance.memory`, Chromium only).
 *  - Navigation, paint (FCP) and resource timing snapshots.
 *  - A description of the scene under test (canvas size, entity counts).
 *
 * Everything is summarised by {@link getReport}, which a Playwright harness reads
 * off `window.__TINY_RPG_PROFILER` to produce the performance report.
 */

type TimingTarget = Record<string, unknown>;

type AnyFunction = (...args: unknown[]) => unknown;

type MemorySample = {
  /** Milliseconds since the profiler was enabled. */
  t: number;
  usedMB: number;
  totalMB: number;
};

type LongTaskSample = {
  startTime: number;
  duration: number;
  name: string;
};

type SceneInfo = {
  canvasWidth: number;
  canvasHeight: number;
  npcCount: number;
  enemyCount: number;
  objectCount: number;
  roomCount: number;
  /** Extra counts supplied by the harness that built the scene. */
  notes: Record<string, number>;
};

type StatSummary = {
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
};

type FrameReport = StatSummary & {
  /** Wall-clock window the frames were observed over (ms). */
  windowMs: number;
  /** Mean frames per second across the window. */
  fps: number;
  /** Frames slower than ~16.7 ms (below 60 fps). */
  over16ms: number;
  /** Frames slower than ~33.3 ms (below 30 fps). */
  over33ms: number;
  /** Frames slower than 50 ms (visible hitch). */
  over50ms: number;
};

type ProfilerReport = {
  meta: {
    generatedAt: string;
    durationMs: number;
    userAgent: string;
    renderLoop: boolean;
    hardwareConcurrency: number;
    deviceMemoryGB: number | null;
  };
  scene: SceneInfo;
  frame: FrameReport;
  sections: Record<string, StatSummary>;
  longTasks: {
    supported: boolean;
    count: number;
    totalMs: number;
    maxMs: number;
    /** Total time spent in chunks beyond the 50 ms long-task threshold. */
    totalBlockingMs: number;
    samples: LongTaskSample[];
  };
  memory: {
    supported: boolean;
    sampleCount: number;
    usedMB: { min: number; max: number; avg: number; last: number } | null;
    limitMB: number | null;
    growthMB: number | null;
    samples: MemorySample[];
  };
  navigation: Record<string, number> | null;
  paint: { firstPaintMs: number | null; firstContentfulPaintMs: number | null };
  resources: {
    count: number;
    totalTransferKB: number;
    totalDecodedKB: number;
    slowest: { name: string; durationMs: number; transferKB: number }[];
  };
  dom: { nodeCount: number };
};

type ProfilerEngine = {
  draw?: () => void;
  canvas?: { width?: number; height?: number };
  renderer?: {
    draw?: () => void;
    tileRenderer?: TimingTarget;
    entityRenderer?: TimingTarget;
    hudRenderer?: TimingTarget;
  };
  enemyManager?: TimingTarget & { tick?: () => void };
  movementManager?: TimingTarget;
  getSprites?: () => unknown;
  getActiveEnemies?: () => unknown;
  getObjects?: () => unknown;
  isIntroVisible?: () => boolean;
  isGameOver?: () => boolean;
  isLevelUpOverlayActive?: () => boolean;
  isPickupOverlayActive?: () => boolean;
  gameState?: {
    getDialog?: () => { active?: boolean };
    getPlayer?: () => { x?: number; y?: number; roomIndex?: number } | null;
  };
};

/** A lightweight live snapshot of game state used to drive automated play. */
type GameSnapshot = {
  intro: boolean;
  gameOver: boolean;
  levelUp: boolean;
  pickup: boolean;
  dialog: boolean;
  playerX: number;
  playerY: number;
  playerRoom: number;
};

const MS_PER_MB = 1024 * 1024;

const perfNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const arrayLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Fixed-capacity numeric sample accumulator that can compute distribution
 * statistics (mean, percentiles, standard deviation) on demand.
 */
class Series {
  private samples: number[] = [];
  private readonly cap: number;

  constructor(cap = 50000) {
    this.cap = cap;
  }

  add(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.samples.length < this.cap) {
      this.samples.push(value);
    }
  }

  get length(): number {
    return this.samples.length;
  }

  raw(): readonly number[] {
    return this.samples;
  }

  summary(): StatSummary {
    const n = this.samples.length;
    if (n === 0) {
      return { count: 0, totalMs: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, stdDevMs: 0 };
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    let total = 0;
    for (const value of sorted) total += value;
    const avg = total / n;
    let variance = 0;
    for (const value of sorted) variance += (value - avg) * (value - avg);
    variance /= n;
    const percentile = (p: number): number => {
      const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
      return sorted[idx];
    };
    return {
      count: n,
      totalMs: round(total),
      avgMs: round(avg),
      minMs: round(sorted[0]),
      maxMs: round(sorted[n - 1]),
      p50Ms: round(percentile(50)),
      p95Ms: round(percentile(95)),
      p99Ms: round(percentile(99)),
      stdDevMs: round(Math.sqrt(variance)),
    };
  }
}

class PerformanceProfiler {
  private enabled = false;
  private renderLoop = false;
  private startTime = 0;
  private readonly sections = new Map<string, Series>();
  private readonly frameIntervals = new Series();
  private frameCount = 0;
  private lastFrameTime = 0;
  private firstFrameTime = 0;
  private over16 = 0;
  private over33 = 0;
  private over50 = 0;
  private rafId: number | null = null;
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly memorySamples: MemorySample[] = [];
  private readonly longTasks: LongTaskSample[] = [];
  private longTaskSupported = false;
  private longTaskObserver: PerformanceObserver | null = null;
  private readonly unwrappers: (() => void)[] = [];
  private engine: ProfilerEngine | null = null;
  private readonly sceneNotes: Record<string, number> = {};

  /** Whether the current page requested profiling via the `?profile` flag. */
  static isRequested(): boolean {
    if (typeof globalThis.location === 'undefined') return false;
    try {
      const params = new URLSearchParams(globalThis.location.search);
      return params.has('profile') || params.has('profiler');
    } catch {
      return false;
    }
  }

  /** Whether the requested profiling run should also drive a redraw loop. */
  static renderLoopRequested(): boolean {
    if (typeof globalThis.location === 'undefined') return false;
    try {
      const params = new URLSearchParams(globalThis.location.search);
      return params.get('profile') === 'render' || params.has('render-loop');
    } catch {
      return false;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  enable(options: { renderLoop?: boolean } = {}): void {
    if (this.enabled) return;
    this.enabled = true;
    this.renderLoop = Boolean(options.renderLoop);
    this.startTime = perfNow();
    this.lastFrameTime = 0;
    this.firstFrameTime = 0;
    this.installLongTaskObserver();
    this.startMemorySampling();
    this.startFrameLoop();
  }

  /** Record a single timing sample (in ms) under a named section. */
  record(label: string, ms: number): void {
    if (!this.enabled) return;
    let series = this.sections.get(label);
    if (!series) {
      series = new Series();
      this.sections.set(label, series);
    }
    series.add(ms);
  }

  /** Time a synchronous function and record it under `label`. */
  time<T>(label: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const start = perfNow();
    try {
      return fn();
    } finally {
      this.record(label, perfNow() - start);
    }
  }

  /**
   * Monkey-patch `target[method]` so every call is timed under `label`. The
   * original is restored on {@link reset}/{@link disable}.
   */
  instrument(target: TimingTarget | undefined, method: string, label: string): void {
    if (!this.enabled || !target) return;
    const original = target[method];
    if (typeof original !== 'function') return;
    const fn = original as AnyFunction;
    const profiler = this;
    const wrapped = function (this: unknown, ...args: unknown[]): unknown {
      const start = perfNow();
      try {
        return fn.apply(this, args);
      } finally {
        profiler.record(label, perfNow() - start);
      }
    };
    target[method] = wrapped;
    this.unwrappers.push(() => {
      target[method] = original;
    });
  }

  /** Wire the profiler into a running game engine and capture the scene. */
  attach(engine: ProfilerEngine): void {
    if (!this.enabled) return;
    this.engine = engine;
    const renderer = engine.renderer;
    if (renderer) {
      this.instrument(renderer as TimingTarget, 'draw', 'render.frame');
      this.instrument(renderer.tileRenderer, 'drawTiles', 'render.tiles');
      this.instrument(renderer.tileRenderer, 'drawWalls', 'render.walls');
      this.instrument(renderer.entityRenderer, 'drawObjects', 'render.objects');
      this.instrument(renderer.entityRenderer, 'drawItems', 'render.items');
      this.instrument(renderer.entityRenderer, 'drawNPCs', 'render.npcs');
      this.instrument(renderer.entityRenderer, 'drawEnemies', 'render.enemies');
      this.instrument(renderer.entityRenderer, 'drawPlayer', 'render.player');
      this.instrument(renderer.hudRenderer, 'drawHUD', 'render.hud');
      this.instrument(renderer.hudRenderer, 'drawInventory', 'render.inventory');
    }
    this.instrument(engine.enemyManager, 'tick', 'sim.enemyTick');
    this.instrument(engine.movementManager, 'tryMove', 'sim.tryMove');
    this.captureScene();
  }

  /** Merge harness-supplied counts (authoritative scene description). */
  setSceneNotes(notes: Record<string, number>): void {
    Object.assign(this.sceneNotes, notes);
  }

  /**
   * Reads a live snapshot of the attached engine's UI/player state so an
   * automation harness can play the game reactively (dismiss the intro, advance
   * dialogs, resolve overlays, restart on death) instead of blindly pressing keys.
   */
  getGameSnapshot(): GameSnapshot {
    const engine = this.engine;
    const player = engine?.gameState?.getPlayer?.() ?? null;
    const dialog = engine?.gameState?.getDialog?.();
    return {
      intro: Boolean(engine?.isIntroVisible?.()),
      gameOver: Boolean(engine?.isGameOver?.()),
      levelUp: Boolean(engine?.isLevelUpOverlayActive?.()),
      pickup: Boolean(engine?.isPickupOverlayActive?.()),
      dialog: Boolean(dialog?.active),
      playerX: typeof player?.x === 'number' ? player.x : -1,
      playerY: typeof player?.y === 'number' ? player.y : -1,
      playerRoom: typeof player?.roomIndex === 'number' ? player.roomIndex : -1,
    };
  }

  private captureScene(): void {
    const engine = this.engine;
    if (!engine) return;
    try {
      this.sceneNotes.npcCount = arrayLength(engine.getSprites?.());
      this.sceneNotes.enemyCount = arrayLength(engine.getActiveEnemies?.());
      this.sceneNotes.objectCount = arrayLength(engine.getObjects?.());
    } catch {
      /* scene capture is best-effort */
    }
  }

  private startFrameLoop(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    const tick = (timestamp: number): void => {
      if (!this.enabled) return;
      if (this.lastFrameTime > 0) {
        const interval = timestamp - this.lastFrameTime;
        this.frameIntervals.add(interval);
        this.frameCount += 1;
        if (interval > 16.7) this.over16 += 1;
        if (interval > 33.3) this.over33 += 1;
        if (interval > 50) this.over50 += 1;
      } else {
        this.firstFrameTime = timestamp;
      }
      this.lastFrameTime = timestamp;
      if (this.renderLoop && this.engine && typeof this.engine.draw === 'function') {
        this.engine.draw();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private startMemorySampling(): void {
    const sample = (): void => {
      const memory = this.readMemory();
      if (!memory) return;
      this.memorySamples.push({
        t: round(perfNow() - this.startTime),
        usedMB: round(memory.used / MS_PER_MB),
        totalMB: round(memory.total / MS_PER_MB),
      });
    };
    sample();
    this.memoryTimer = setInterval(sample, 250);
  }

  private readMemory(): { used: number; total: number; limit: number } | null {
    if (typeof performance === 'undefined') return null;
    const candidate = (performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }).memory;
    if (!candidate) return null;
    return {
      used: candidate.usedJSHeapSize,
      total: candidate.totalJSHeapSize,
      limit: candidate.jsHeapSizeLimit,
    };
  }

  private installLongTaskObserver(): void {
    if (typeof PerformanceObserver !== 'function') return;
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            startTime: round(entry.startTime),
            duration: round(entry.duration),
            name: entry.name,
          });
        }
      });
      this.longTaskObserver.observe({ type: 'longtask', buffered: true });
      this.longTaskSupported = true;
    } catch {
      this.longTaskSupported = false;
    }
  }

  private collectNavigation(): Record<string, number> | null {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return null;
    }
    const entries = performance.getEntriesByType('navigation');
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return null;
    return {
      dnsMs: round(nav.domainLookupEnd - nav.domainLookupStart),
      connectMs: round(nav.connectEnd - nav.connectStart),
      requestMs: round(nav.responseStart - nav.requestStart),
      responseMs: round(nav.responseEnd - nav.responseStart),
      domInteractiveMs: round(nav.domInteractive),
      domContentLoadedMs: round(nav.domContentLoadedEventEnd),
      loadEventMs: round(nav.loadEventEnd),
    };
  }

  private collectPaint(): { firstPaintMs: number | null; firstContentfulPaintMs: number | null } {
    const result = { firstPaintMs: null as number | null, firstContentfulPaintMs: null as number | null };
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return result;
    }
    for (const entry of performance.getEntriesByType('paint')) {
      if (entry.name === 'first-paint') result.firstPaintMs = round(entry.startTime);
      if (entry.name === 'first-contentful-paint') result.firstContentfulPaintMs = round(entry.startTime);
    }
    return result;
  }

  private collectResources(): ProfilerReport['resources'] {
    const empty: ProfilerReport['resources'] = { count: 0, totalTransferKB: 0, totalDecodedKB: 0, slowest: [] };
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
      return empty;
    }
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    let totalTransfer = 0;
    let totalDecoded = 0;
    for (const entry of entries) {
      totalTransfer += entry.transferSize || 0;
      totalDecoded += entry.decodedBodySize || 0;
    }
    const slowest = [...entries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 8)
      .map((entry) => ({
        name: entry.name.split('/').slice(-1)[0] || entry.name,
        durationMs: round(entry.duration),
        transferKB: round((entry.transferSize || 0) / 1024),
      }));
    return {
      count: entries.length,
      totalTransferKB: round(totalTransfer / 1024),
      totalDecodedKB: round(totalDecoded / 1024),
      slowest,
    };
  }

  private noteValue(key: string): number {
    const value = (this.sceneNotes as Record<string, number | undefined>)[key];
    return value === undefined ? 0 : value;
  }

  private buildScene(): SceneInfo {
    const engine = this.engine;
    const canvas = engine?.canvas;
    return {
      canvasWidth: typeof canvas?.width === 'number' ? canvas.width : 0,
      canvasHeight: typeof canvas?.height === 'number' ? canvas.height : 0,
      npcCount: this.noteValue('npcCount'),
      enemyCount: this.noteValue('enemyCount'),
      objectCount: this.noteValue('objectCount'),
      roomCount: this.noteValue('roomCount'),
      notes: { ...this.sceneNotes },
    };
  }

  private buildFrameReport(): FrameReport {
    const summary = this.frameIntervals.summary();
    const windowMs = this.lastFrameTime > 0 ? this.lastFrameTime - this.firstFrameTime : 0;
    const fps = windowMs > 0 ? round((this.frameCount / windowMs) * 1000) : 0;
    return {
      ...summary,
      windowMs: round(windowMs),
      fps,
      over16ms: this.over16,
      over33ms: this.over33,
      over50ms: this.over50,
    };
  }

  private buildMemoryReport(): ProfilerReport['memory'] {
    const samples = this.memorySamples;
    if (samples.length === 0) {
      return { supported: false, sampleCount: 0, usedMB: null, limitMB: null, growthMB: null, samples: [] };
    }
    let min = Infinity;
    let max = -Infinity;
    let total = 0;
    for (const sample of samples) {
      min = Math.min(min, sample.usedMB);
      max = Math.max(max, sample.usedMB);
      total += sample.usedMB;
    }
    const memory = this.readMemory();
    const first = samples[0].usedMB;
    const last = samples[samples.length - 1].usedMB;
    return {
      supported: true,
      sampleCount: samples.length,
      usedMB: { min: round(min), max: round(max), avg: round(total / samples.length), last: round(last) },
      limitMB: memory ? round(memory.limit / MS_PER_MB) : null,
      growthMB: round(last - first),
      samples,
    };
  }

  private readDeviceMemory(): number | null {
    if (typeof navigator === 'undefined') return null;
    const value: number | undefined = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return typeof value === 'number' ? value : null;
  }

  getReport(): ProfilerReport {
    const sections: Record<string, StatSummary> = {};
    for (const [label, series] of [...this.sections.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      sections[label] = series.summary();
    }
    const longTaskTotal = this.longTasks.reduce((sum, task) => sum + task.duration, 0);
    const longTaskBlocking = this.longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);
    const longTaskMax = this.longTasks.reduce((max, task) => Math.max(max, task.duration), 0);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        durationMs: round(perfNow() - this.startTime),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        renderLoop: this.renderLoop,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0,
        deviceMemoryGB: this.readDeviceMemory(),
      },
      scene: this.buildScene(),
      frame: this.buildFrameReport(),
      sections,
      longTasks: {
        supported: this.longTaskSupported,
        count: this.longTasks.length,
        totalMs: round(longTaskTotal),
        maxMs: round(longTaskMax),
        totalBlockingMs: round(longTaskBlocking),
        samples: this.longTasks.slice(0, 50),
      },
      memory: this.buildMemoryReport(),
      navigation: this.collectNavigation(),
      paint: this.collectPaint(),
      resources: this.collectResources(),
      dom: { nodeCount: typeof document !== 'undefined' ? document.getElementsByTagName('*').length : 0 },
    };
  }

  /** Stop sampling and restore every instrumented method. */
  disable(): void {
    this.enabled = false;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    if (this.memoryTimer !== null) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
      this.longTaskObserver = null;
    }
    while (this.unwrappers.length) {
      const undo = this.unwrappers.pop();
      undo?.();
    }
  }
}

const performanceProfiler = new PerformanceProfiler();

// Exposed for tooling/automation (e.g. the Playwright profiling harness) to read
// the live report off the page. The codebase augments globals via casts rather
// than ambient `declare global` blocks.
if (typeof globalThis !== 'undefined') {
  (globalThis as typeof globalThis & { __TINY_RPG_PROFILER?: PerformanceProfiler }).__TINY_RPG_PROFILER =
    performanceProfiler;
}

export { PerformanceProfiler, performanceProfiler };
export type { ProfilerReport, StatSummary, FrameReport, SceneInfo };
