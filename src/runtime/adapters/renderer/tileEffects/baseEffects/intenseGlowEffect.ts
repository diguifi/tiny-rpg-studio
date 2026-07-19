import type { TileEffectPaintContext } from '../types';
import { colorWithAlpha, mixColors, modulateColor } from '../colorUtils';

const GLOW_OUTER = 'rgba(255, 45, 0, 0.62)';
const GLOW_INNER = 'rgba(255, 145, 20, 0.48)';
const GLOW_CORE = 'rgba(255, 245, 170, 0.34)';

/** Paint a compact, high-intensity warm glow below a tile. */
export function paintIntenseGlow({ ctx, px, py, size, customColor }: TileEffectPaintContext): void {
    const inset = Math.max(0, Math.floor(size * 0.06));
    const blur = Math.max(2, Math.floor(size * 0.32));
    const extent = Math.max(1, size - inset * 2);

    ctx.save();
    const outer = customColor
        ? colorWithAlpha(modulateColor(customColor, 0.88), 0.62)
        : GLOW_OUTER;
    const inner = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.34), 0.48)
        : GLOW_INNER;
    const core = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.74), 0.34)
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
