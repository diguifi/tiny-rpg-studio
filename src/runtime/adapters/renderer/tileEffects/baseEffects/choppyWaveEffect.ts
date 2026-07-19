import { colorLuminance, mixColors } from '../colorUtils';
import type { TileEffectPaintContext } from '../types';

/** Paint a fast translucent wave with strong alpha variation. */
export function paintChoppyWave({
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
    const time = timeMs / 520;

    for (let y = 0; y < height; y++) {
        const row = pixels[y];
        for (let x = 0; x < width; x++) {
            const color = row[x];
            if (host.isEmptyPixel(color)) continue;

            const luma = colorLuminance(color as string);
            const baseAlpha = 0.28 + (0.68 - 0.28) * luma;
            const wave = Math.sin(x * 1.45 + y * 0.8 + time * Math.PI * 2);
            const waveColor = wave >= 0 ? '#effcff' : '#0b315f';
            ctx.save();
            ctx.globalAlpha = Math.max(0.16, Math.min(0.95, baseAlpha * (0.78 + wave * 0.22)));
            ctx.fillStyle = mixColors(color as string, waveColor, 0.18 + Math.abs(wave) * 0.24);
            ctx.fillRect(px + x * step, py + y * step, step, step);
            ctx.restore();
        }
    }
}
