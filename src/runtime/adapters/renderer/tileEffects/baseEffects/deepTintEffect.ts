import type { TileEffectPaintContext } from '../types';
import { colorWithAlpha, mixColors, modulateColor } from '../colorUtils';

const DEPTH_TINT = 'rgba(10, 45, 120, 0.28)';
const MULTIPLY_TINT = 'rgba(45, 110, 190, 0.14)';

/** Add a dark blue tint over the content behind a tile. */
export function paintDeepTint({ ctx, px, py, size, customColor }: TileEffectPaintContext): void {
    ctx.save();
    ctx.fillStyle = customColor
        ? colorWithAlpha(modulateColor(customColor, 0.55), 0.28)
        : DEPTH_TINT;
    ctx.fillRect(px, py, size, size);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.22), 0.14)
        : MULTIPLY_TINT;
    ctx.fillRect(px, py, size, size);
    ctx.restore();
}
