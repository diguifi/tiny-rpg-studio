import { mixColors, modulateColor, normalizeTileLabel } from './colorUtils';
import type { TileEffectDefinition, TileEffectPaintContext, TileEffectSource } from './types';

const GLOW_OUTER = 'rgba(255, 90, 0, 0.4)';
const GLOW_INNER = 'rgba(255, 180, 40, 0.32)';
const GLOW_CORE = 'rgba(255, 240, 120, 0.2)';
const GLOW_BLUR_FACTOR = 0.42;
const GLOW_INSET_FACTOR = 0.12;
const FLOW_SPEED = 1.85;
const RIDGE_COLOR = 'rgba(255, 250, 200, 0.9)';
const HIGHLIGHT_COLOR = 'rgba(255, 220, 100, 0.6)';
const SHADOW_COLOR = 'rgba(120, 30, 10, 0.22)';
const TROUGH_COLOR = '#8b2808';
const CREST_COLOR = '#ffe066';
const VEIN_COLOR = 'rgba(255, 200, 60, 0.55)';
const EMBER_COLOR = 'rgba(255, 230, 140, 0.85)';

function matchesHeuristic(tile: TileEffectSource): boolean {
    const category = normalizeTileLabel(tile.category || '');
    const name = normalizeTileLabel(tile.name || '');
    return category === 'perigo' || name.includes('lava');
}

/** Multi-octave flowing height field. Values roughly in [-1.4, 1.4]. */
export function buildLavaHeightField(width: number, height: number, t: number): number[][] {
    const field: number[][] = [];
    for (let y = 0; y < height; y++) {
        const row: number[] = [];
        for (let x = 0; x < width; x++) {
            const h =
                Math.sin(x * 0.95 + y * 0.4 + t * 2.1) +
                0.55 * Math.sin(x * 0.35 - y * 0.95 + t * 1.45) +
                0.4 * Math.sin((x + y) * 0.75 - t * 2.6);
            row.push(h);
        }
        field.push(row);
    }
    return field;
}

function paintGlowUnderlay(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    const inset = Math.max(0, Math.floor(size * GLOW_INSET_FACTOR));
    const blur = Math.max(3, Math.floor(size * GLOW_BLUR_FACTOR));
    const w = Math.max(1, size - inset * 2);
    const h = Math.max(1, size - inset * 2);

    ctx.save();
    ctx.shadowColor = GLOW_OUTER;
    ctx.shadowBlur = blur;
    ctx.fillStyle = GLOW_INNER;
    ctx.fillRect(px + inset, py + inset, w, h);
    ctx.restore();

    const coreInset = inset + Math.max(1, Math.floor(size * 0.12));
    const coreW = Math.max(1, size - coreInset * 2);
    const coreH = Math.max(1, size - coreInset * 2);
    ctx.save();
    ctx.shadowColor = GLOW_CORE;
    ctx.shadowBlur = Math.max(2, Math.floor(blur * 0.55));
    ctx.fillStyle = GLOW_CORE;
    ctx.fillRect(px + coreInset, py + coreInset, coreW, coreH);
    ctx.restore();
}

function paintWaveOverlays(
    ctx: CanvasRenderingContext2D,
    host: TileEffectPaintContext['host'],
    pixels: (string | null)[][],
    field: number[][],
    px: number,
    py: number,
    step: number,
    width: number,
    height: number
): void {
    for (let y = 0; y < height; y++) {
        const row = pixels[y];
        for (let x = 0; x < width; x++) {
            if (host.isEmptyPixel(row[x])) continue;
            const h = field[y][x];
            const hDown = field[Math.min(height - 1, y + 1)][x];
            const slopeY = h - hDown;

            if (h > 0.55 && slopeY > 0.25) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.95, 0.35 + slopeY * 0.7 + (h - 0.55) * 0.5);
                ctx.fillStyle = RIDGE_COLOR;
                const band = Math.max(1, Math.floor(step * 0.4));
                ctx.fillRect(px + x * step, py + y * step, step, band);
                ctx.globalAlpha *= 0.55;
                ctx.fillStyle = HIGHLIGHT_COLOR;
                ctx.fillRect(px + x * step, py + y * step + band, step, Math.max(1, step - band));
                ctx.restore();
            }

            if (h < -0.25 && slopeY < -0.2) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.28, 0.1 + Math.abs(slopeY) * 0.22);
                ctx.fillStyle = SHADOW_COLOR;
                ctx.fillRect(
                    px + x * step,
                    py + y * step + Math.floor(step * 0.35),
                    step,
                    Math.max(1, Math.ceil(step * 0.65))
                );
                ctx.restore();
            }
        }
    }
}

function paintEmissivePass(
    ctx: CanvasRenderingContext2D,
    host: TileEffectPaintContext['host'],
    pixels: (string | null)[][],
    field: number[][],
    px: number,
    py: number,
    step: number,
    width: number,
    height: number
): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let y = 0; y < height; y++) {
        const row = pixels[y];
        for (let x = 0; x < width; x++) {
            if (host.isEmptyPixel(row[x])) continue;
            const h = field[y][x];
            const hRight = field[y][Math.min(width - 1, x + 1)];
            const hDown = field[Math.min(height - 1, y + 1)][x];

            if (h > 0.5) {
                ctx.globalAlpha = Math.min(0.45, 0.12 + (h - 0.5) * 0.4);
                ctx.fillStyle = CREST_COLOR;
                ctx.fillRect(px + x * step, py + y * step, step, step);
            }

            const slope = Math.abs(h - hRight) + Math.abs(h - hDown);
            if (slope > 0.55 && h > -0.1) {
                ctx.globalAlpha = Math.min(0.55, 0.15 + slope * 0.25);
                ctx.fillStyle = VEIN_COLOR;
                const veinH = Math.max(1, Math.floor(step * 0.35));
                ctx.fillRect(
                    px + x * step,
                    py + y * step + Math.floor((step - veinH) * 0.5),
                    step,
                    veinH
                );
            }
        }
    }

    ctx.restore();
}

function paintEmbers(
    ctx: CanvasRenderingContext2D,
    field: number[][],
    px: number,
    py: number,
    step: number,
    width: number,
    height: number,
    t: number
): void {
    const phase = Math.floor(t * 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const hash = (x * 13 + y * 29 + phase * 7) % 11;
            if (hash !== 0 && hash !== 3) continue;
            if (field[y][x] < 0.15) continue;

            const ember = Math.max(1, Math.floor(step * 0.22));
            const drift = (phase + x + y) % Math.max(1, step - ember);
            ctx.globalAlpha = 0.55 + (hash === 0 ? 0.25 : 0);
            ctx.fillStyle = EMBER_COLOR;
            ctx.fillRect(
                px + x * step + drift,
                py + y * step + (Math.floor(drift * 0.5) % Math.max(1, step - ember)),
                ember,
                ember
            );
        }
    }

    ctx.restore();
}

function paint(context: TileEffectPaintContext): void {
    const { ctx, host, pixels, px, py, step, size, timeMs } = context;
    if (pixels.length === 0) return;
    const height = pixels.length;
    const width = pixels[0]?.length ?? 0;
    if (width === 0) return;

    paintGlowUnderlay(ctx, px, py, size);

    const t = (timeMs / 1000) * FLOW_SPEED;
    const field = buildLavaHeightField(width, height, t);

    if (host.isSpriteOutlineEnabled()) {
        ctx.fillStyle = host.getSpriteOutlineColor();
        for (let y = 0; y < height; y++) {
            const row = pixels[y];
            for (let x = 0; x < row.length; x++) {
                if (host.isEmptyPixel(row[x])) continue;
                for (const [dx, dy] of [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                ] as const) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    if (!host.isEmptyPixel(pixels[ny][nx])) continue;
                    ctx.fillRect(px + nx * step, py + ny * step, step, step);
                }
            }
        }
    }

    for (let y = 0; y < height; y++) {
        const row = pixels[y];
        for (let x = 0; x < width; x++) {
            const col = row[x];
            if (host.isEmptyPixel(col)) continue;

            const h = field[y][x];
            const hDown = field[Math.min(height - 1, y + 1)][x];
            const hRight = field[y][Math.min(width - 1, x + 1)];
            const slopeY = h - hDown;
            const slopeX = h - hRight;
            const light = Math.max(0.92, 1.08 + h * 0.28 + slopeY * 0.32 + slopeX * 0.14);

            let color = modulateColor(col as string, light);
            if (h < -0.45) {
                color = mixColors(color, TROUGH_COLOR, Math.min(0.32, (-h - 0.45) * 0.45));
            }
            if (h > 0.25) {
                color = mixColors(color, CREST_COLOR, Math.min(0.65, (h - 0.25) * 0.95));
            }

            ctx.fillStyle = color;
            ctx.fillRect(px + x * step, py + y * step, step, step);
        }
    }

    paintWaveOverlays(ctx, host, pixels, field, px, py, step, width, height);
    paintEmissivePass(ctx, host, pixels, field, px, py, step, width, height);
    paintEmbers(ctx, field, px, py, step, width, height, t);
}

/** Glowy flowing lava with height-field lighting, veins, and embers. */
export const lavaTileEffect: TileEffectDefinition = {
    id: 'lava',
    matchesHeuristic,
    paint,
};
