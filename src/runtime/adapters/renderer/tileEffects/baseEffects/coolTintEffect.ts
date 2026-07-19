import type { TileEffectPaintContext } from '../types';
import { colorWithAlpha, mixColors, modulateColor } from '../colorUtils';

const DEPTH_TINT = 'rgba(30, 110, 200, 0.14)';
const SOFT_LIGHT_TINT = 'rgba(90, 170, 230, 0.18)';

/** Add a cool translucent tint over the content behind a tile. */
export function paintCoolTint({ ctx, px, py, size, customColor }: TileEffectPaintContext): void {
    ctx.save();
    ctx.fillStyle = customColor
        ? colorWithAlpha(modulateColor(customColor, 0.82), 0.14)
        : DEPTH_TINT;
    ctx.fillRect(px, py, size, size);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = customColor
        ? colorWithAlpha(mixColors(customColor, '#FFFFFF', 0.35), 0.18)
        : SOFT_LIGHT_TINT;
    ctx.fillRect(px, py, size, size);
    ctx.restore();
}
