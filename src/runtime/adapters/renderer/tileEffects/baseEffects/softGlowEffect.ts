import type { TileEffectPaintContext } from '../types';
import { colorWithAlpha, mixColors } from '../colorUtils';

const GLOW_OUTER = 'rgba(255, 110, 30, 0.24)';
const GLOW_INNER = 'rgba(255, 175, 65, 0.2)';
const GLOW_CORE = 'rgba(255, 225, 135, 0.12)';

/** Paint a wide, low-opacity warm glow below a tile. */
export function paintSoftGlow({ ctx, px, py, size, customColor }: TileEffectPaintContext): void {
    const inset = Math.max(0, Math.floor(size * 0.18));
    const blur = Math.max(2, Math.floor(size * 0.58));
    const extent = Math.max(1, size - inset * 2);

    ctx.save();
    const outer = customColor ? colorWithAlpha(customColor, 0.24) : GLOW_OUTER;
    const inner = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.3), 0.2)
        : GLOW_INNER;
    const core = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.66), 0.12)
        : GLOW_CORE;

    ctx.shadowColor = outer;
    ctx.shadowBlur = blur;
    ctx.fillStyle = inner;
    ctx.fillRect(px + inset, py + inset, extent, extent);
    ctx.restore();

    const coreInset = inset + Math.max(1, Math.floor(size * 0.1));
    const coreExtent = Math.max(1, size - coreInset * 2);
    ctx.save();
    ctx.shadowColor = core;
    ctx.shadowBlur = Math.max(2, Math.floor(blur * 0.5));
    ctx.fillStyle = core;
    ctx.fillRect(px + coreInset, py + coreInset, coreExtent, coreExtent);
    ctx.restore();
}
