import { colorLuminance, mixColors } from '../colorUtils';
import type { TileEffectPaintContext } from '../types';

/** Paint a slow, low-amplitude translucent wave. */
export function paintCalmWave({
    ctx,
    host,
    pixels,
    px,
    py,
    step,
    timeMs,
}: TileEffectPaintContext): void {
    const height = pixels.length;
    const width = pixels[0]?.length ?? 0;
    const time = timeMs / 1800;

    for (let y = 0; y < height; y++) {
        const row = pixels[y];
        for (let x = 0; x < width; x++) {
            const color = row[x];
            if (host.isEmptyPixel(color)) continue;

            const luma = colorLuminance(color as string);
            const baseAlpha = 0.36 + (0.6 - 0.36) * luma;
            const wave = Math.sin(x * 0.55 + y * 0.25 + time * Math.PI * 2);
            const waveColor = wave >= 0 ? '#d7f4ff' : '#174c78';
            ctx.save();
            ctx.globalAlpha = Math.max(0.16, Math.min(0.95, baseAlpha * (0.94 + wave * 0.06)));
            ctx.fillStyle = mixColors(color as string, waveColor, 0.1 + Math.abs(wave) * 0.08);
            ctx.fillRect(px + x * step, py + y * step, step, step);
            ctx.restore();
        }
    }
}
