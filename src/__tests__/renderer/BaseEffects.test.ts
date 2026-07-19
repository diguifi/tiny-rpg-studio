import { describe, expect, it, vi } from 'vitest';
import { paintCalmWave } from '../../runtime/adapters/renderer/tileEffects/baseEffects/calmWaveEffect';
import { paintChoppyWave } from '../../runtime/adapters/renderer/tileEffects/baseEffects/choppyWaveEffect';
import { paintCoolTint } from '../../runtime/adapters/renderer/tileEffects/baseEffects/coolTintEffect';
import { paintDeepTint } from '../../runtime/adapters/renderer/tileEffects/baseEffects/deepTintEffect';
import { paintDiagonalOutline } from '../../runtime/adapters/renderer/tileEffects/baseEffects/diagonalOutlineEffect';
import { paintGentleRidge } from '../../runtime/adapters/renderer/tileEffects/baseEffects/gentleRidgeEffect';
import { paintGlow } from '../../runtime/adapters/renderer/tileEffects/baseEffects/glowEffect';
import { paintInnerOutline } from '../../runtime/adapters/renderer/tileEffects/baseEffects/innerOutlineEffect';
import { paintIntenseGlow } from '../../runtime/adapters/renderer/tileEffects/baseEffects/intenseGlowEffect';
import { paintMurkyTint } from '../../runtime/adapters/renderer/tileEffects/baseEffects/murkyTintEffect';
import { paintReflectionBottom } from '../../runtime/adapters/renderer/tileEffects/baseEffects/reflectionBottomEffect';
import { paintReflectionLeft } from '../../runtime/adapters/renderer/tileEffects/baseEffects/reflectionLeftEffect';
import { paintReflectionRight } from '../../runtime/adapters/renderer/tileEffects/baseEffects/reflectionRightEffect';
import { paintSharpRidge } from '../../runtime/adapters/renderer/tileEffects/baseEffects/sharpRidgeEffect';
import { paintSoftGlow } from '../../runtime/adapters/renderer/tileEffects/baseEffects/softGlowEffect';
import { paintTranslucentWave } from '../../runtime/adapters/renderer/tileEffects/baseEffects/translucentWaveEffect';
import type {
  TileEffectHost,
  TileEffectPaintContext,
  TileEffectPainter,
} from '../../runtime/adapters/renderer/tileEffects/types';

type TestContext = CanvasRenderingContext2D & {
  fillRect: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
};

function makeCanvasContext(): TestContext {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: '',
    shadowBlur: 0,
  } as unknown as TestContext;
}

function makeHost(): TileEffectHost {
  return {
    isEmptyPixel: (color) => color === null || color === undefined,
    isSpriteOutlineEnabled: () => true,
    getSpriteOutlineColor: () => '#000000',
    drawPixelGrid: vi.fn(),
  };
}

function makePaintContext(
  ctx = makeCanvasContext(),
  pixels: (string | null)[][] = [
    ['#29ADFF', '#29ADFF'],
    ['#29ADFF', '#29ADFF'],
  ]
): TileEffectPaintContext {
  return {
    ctx,
    host: makeHost(),
    pixels,
    px: 4,
    py: 6,
    step: 8,
    size: 16,
    timeMs: 225,
  };
}

describe('standalone base effects', () => {
  function capturePaintColors(painter: TileEffectPainter, customColor?: '#00FF7F') {
    const ctx = makeCanvasContext();
    const fillStyles: string[] = [];
    const shadowColors: string[] = [];
    Object.defineProperty(ctx, 'fillStyle', {
      configurable: true,
      get: () => fillStyles.at(-1) ?? '',
      set: (value: string) => fillStyles.push(value),
    });
    Object.defineProperty(ctx, 'shadowColor', {
      configurable: true,
      get: () => shadowColors.at(-1) ?? '',
      set: (value: string) => shadowColors.push(value),
    });
    painter({ ...makePaintContext(ctx), customColor });
    return { fillStyles, shadowColors };
  }

  it('keeps exact legacy tint and glow styles when no custom color is supplied', () => {
    expect(capturePaintColors(paintCoolTint).fillStyles).toEqual([
      'rgba(30, 110, 200, 0.14)', 'rgba(90, 170, 230, 0.18)',
    ]);
    expect(capturePaintColors(paintDeepTint).fillStyles).toEqual([
      'rgba(10, 45, 120, 0.28)', 'rgba(45, 110, 190, 0.14)',
    ]);
    expect(capturePaintColors(paintMurkyTint).fillStyles).toEqual([
      'rgba(65, 100, 70, 0.22)', 'rgba(155, 145, 80, 0.12)',
    ]);
    expect(capturePaintColors(paintGlow)).toEqual({
      fillStyles: ['rgba(255, 180, 40, 0.32)', 'rgba(255, 240, 120, 0.2)'],
      shadowColors: ['rgba(255, 90, 0, 0.4)', 'rgba(255, 240, 120, 0.2)'],
    });
    expect(capturePaintColors(paintSoftGlow)).toEqual({
      fillStyles: ['rgba(255, 175, 65, 0.2)', 'rgba(255, 225, 135, 0.12)'],
      shadowColors: ['rgba(255, 110, 30, 0.24)', 'rgba(255, 225, 135, 0.12)'],
    });
    expect(capturePaintColors(paintIntenseGlow)).toEqual({
      fillStyles: ['rgba(255, 145, 20, 0.48)', 'rgba(255, 245, 170, 0.34)'],
      shadowColors: ['rgba(255, 45, 0, 0.62)', 'rgba(255, 245, 170, 0.34)'],
    });
  });

  it('derives distinct tint and glow layers from one supplied custom color', () => {
    for (const painter of [
      paintCoolTint,
      paintDeepTint,
      paintMurkyTint,
      paintGlow,
      paintSoftGlow,
      paintIntenseGlow,
    ]) {
      const { fillStyles, shadowColors } = capturePaintColors(painter, '#00FF7F');
      const colors = [...fillStyles, ...shadowColors];
      expect(new Set(colors).size).toBeGreaterThan(1);
      expect(colors.every((color) => color.startsWith('rgba('))).toBe(true);
      expect(colors.some((color) => color.includes('255, 90, 0'))).toBe(false);
    }
  });

  it('reflects a sprite upward across a target tile bottom edge without flipping its rows', () => {
    const ctx = makeCanvasContext();
    const host = makeHost();
    const sprite = [['#top'], ['#bottom']];

    paintReflectionBottom(ctx, host, sprite, 12, 48, 2, 12, 32, 16);

    expect(ctx.rect).toHaveBeenCalledWith(12, 32, 16, 16);
    expect(host.drawPixelGrid).toHaveBeenCalledWith(
      ctx,
      [['#top'], ['#bottom']],
      12,
      44,
      2
    );
    expect(ctx.globalAlpha).toBe(0.2);
  });

  it('reflects sprites horizontally across target tile edges', () => {
    const leftCtx = makeCanvasContext();
    const leftHost = makeHost();
    const rightCtx = makeCanvasContext();
    const rightHost = makeHost();
    const sprite = [['#left', '#right']];

    paintReflectionLeft(leftCtx, leftHost, sprite, 28, 20, 2, 32, 20, 16);
    paintReflectionRight(rightCtx, rightHost, sprite, 48, 20, 2, 32, 20, 16);

    expect(leftHost.drawPixelGrid).toHaveBeenCalledWith(
      leftCtx,
      [['#right', '#left']],
      32,
      20,
      2
    );
    expect(rightHost.drawPixelGrid).toHaveBeenCalledWith(
      rightCtx,
      [['#right', '#left']],
      44,
      20,
      2
    );
  });

  it('provides independently composable deep and murky tint passes', () => {
    const ctx = makeCanvasContext();
    const context = makePaintContext(ctx);
    const painters: TileEffectPainter[] = [paintDeepTint, paintMurkyTint];

    painters.forEach((paintEffect) => paintEffect(context));

    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).toHaveBeenCalledWith(4, 6, 16, 16);
    expect(ctx.globalCompositeOperation).toBe('soft-light');
  });

  it('provides independently composable soft and intense glow passes', () => {
    const ctx = makeCanvasContext();
    const context = makePaintContext(ctx);
    const painters: TileEffectPainter[] = [paintSoftGlow, paintIntenseGlow];

    painters.forEach((paintEffect) => paintEffect(context));

    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.shadowBlur).toBeGreaterThan(0);
  });

  it('provides independently composable diagonal and inner outline passes', () => {
    const ctx = makeCanvasContext();
    const pixels = [
      [null, null, null],
      [null, '#29ADFF', null],
      [null, null, null],
    ];
    const context = makePaintContext(ctx, pixels);

    paintDiagonalOutline(context);
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);

    ctx.fillRect.mockClear();
    paintInnerOutline(context);
    expect(ctx.fillRect).toHaveBeenCalledOnce();
    expect(ctx.fillRect).toHaveBeenCalledWith(12, 14, 8, 8);
  });

  it('provides independent calm and choppy wave passes with different motion', () => {
    const ctx = makeCanvasContext();
    const alphas: number[] = [];
    Object.defineProperty(ctx, 'globalAlpha', {
      configurable: true,
      get: () => alphas.at(-1) ?? 1,
      set: (value: number) => alphas.push(value),
    });
    const context = makePaintContext(ctx);

    paintCalmWave(context);
    const calmAlphas = [...alphas];
    alphas.length = 0;
    paintChoppyWave(context);

    expect(ctx.fillRect).toHaveBeenCalledTimes(8);
    expect(alphas).not.toEqual(calmAlphas);
  });

  it('makes every wave pass visibly recolor an already-painted tile body', () => {
    for (const painter of [paintCalmWave, paintChoppyWave, paintTranslucentWave]) {
      const ctx = makeCanvasContext();
      const fillStyles: string[] = [];
      Object.defineProperty(ctx, 'fillStyle', {
        configurable: true,
        get: () => fillStyles.at(-1) ?? '',
        set: (value: string) => fillStyles.push(value),
      });

      painter(makePaintContext(ctx, [['#29ADFF']]));

      expect(ctx.fillRect).toHaveBeenCalledOnce();
      expect(fillStyles).toHaveLength(1);
      expect(fillStyles[0]).not.toBe('#29ADFF');
    }
  });

  it('provides independent gentle and sharp ridge passes', () => {
    const pixels = Array.from({ length: 8 }, () => Array<string | null>(8).fill('#FF004D'));
    const gentleCtx = makeCanvasContext();
    const sharpCtx = makeCanvasContext();
    const gentleContext = {
      ...makePaintContext(gentleCtx, pixels),
      size: 64,
      timeMs: 0,
    };
    const sharpContext = {
      ...makePaintContext(sharpCtx, pixels),
      size: 64,
      timeMs: 0,
    };

    paintGentleRidge(gentleContext);
    paintSharpRidge(sharpContext);

    expect(gentleCtx.fillRect.mock.calls.length).toBeGreaterThan(0);
    expect(sharpCtx.fillRect.mock.calls.length).toBeGreaterThan(0);
    expect(gentleCtx.fillRect.mock.calls).not.toEqual(sharpCtx.fillRect.mock.calls);
  });
});
