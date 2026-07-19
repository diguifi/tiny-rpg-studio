import type { TileEffectPaintContext } from '../types';
import { colorWithAlpha, mixColors, modulateColor } from '../colorUtils';

const DEPTH_TINT = 'rgba(65, 100, 70, 0.22)';
const SOFT_LIGHT_TINT = 'rgba(155, 145, 80, 0.12)';

/** Add a muted green-brown tint over the content behind a tile. */
export function paintMurkyTint({ ctx, px, py, size, customColor }: TileEffectPaintContext): void {
    ctx.save();
    ctx.fillStyle = customColor
        ? colorWithAlpha(modulateColor(customColor, 0.72), 0.22)
        : DEPTH_TINT;
    ctx.fillRect(px, py, size, size);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.3), 0.12)
        : SOFT_LIGHT_TINT;
    ctx.fillRect(px, py, size, size);
    ctx.restore();
}
