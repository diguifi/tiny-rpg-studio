import type { TileEffectPaintContext } from '../types';
import { colorWithAlpha, mixColors } from '../colorUtils';

const GLOW_OUTER = 'rgba(255, 90, 0, 0.4)';
const GLOW_INNER = 'rgba(255, 180, 40, 0.32)';
const GLOW_CORE = 'rgba(255, 240, 120, 0.2)';
const GLOW_BLUR_FACTOR = 0.42;
const GLOW_INSET_FACTOR = 0.12;

/** Paint a warm blurred glow below a tile. */
export function paintGlow({ ctx, px, py, size, customColor }: TileEffectPaintContext): void {
    const inset = Math.max(0, Math.floor(size * GLOW_INSET_FACTOR));
    const blur = Math.max(3, Math.floor(size * GLOW_BLUR_FACTOR));
    const width = Math.max(1, size - inset * 2);
    const height = Math.max(1, size - inset * 2);

    ctx.save();
    const outer = customColor ? colorWithAlpha(customColor, 0.4) : GLOW_OUTER;
    const inner = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.35), 0.32)
        : GLOW_INNER;
    const core = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.7), 0.2)
        : GLOW_CORE;

    ctx.shadowColor = outer;
    ctx.shadowBlur = blur;
    ctx.fillStyle = inner;
    ctx.fillRect(px + inset, py + inset, width, height);
    ctx.restore();

    const coreInset = inset + Math.max(1, Math.floor(size * 0.12));
    const coreWidth = Math.max(1, size - coreInset * 2);
    const coreHeight = Math.max(1, size - coreInset * 2);
    ctx.save();
    ctx.shadowColor = core;
    ctx.shadowBlur = Math.max(2, Math.floor(blur * 0.55));
    ctx.fillStyle = core;
    ctx.fillRect(px + coreInset, py + coreInset, coreWidth, coreHeight);
    ctx.restore();
}
