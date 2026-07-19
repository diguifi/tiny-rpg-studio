/** Small color helpers used by liquid / material tile effects. */

export type Rgb = { r: number; g: number; b: number };

export function parseColor(color: string): Rgb | null {
    const raw = color.trim();
    if (raw.startsWith('#')) {
        const hex = raw.slice(1);
        if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if ([r, g, b].some((n) => Number.isNaN(n))) return null;
            return { r, g, b };
        }
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if ([r, g, b].some((n) => Number.isNaN(n))) return null;
            return { r, g, b };
        }
    }
    const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgbMatch) {
        return {
            r: Math.max(0, Math.min(255, Number(rgbMatch[1]))),
            g: Math.max(0, Math.min(255, Number(rgbMatch[2]))),
            b: Math.max(0, Math.min(255, Number(rgbMatch[3]))),
        };
    }
    return null;
}

export function colorLuminance(color: string): number {
    const rgb = parseColor(color);
    if (!rgb) return 0.5;
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

export function clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

/** Multiply RGB by a light factor (1 = unchanged). */
export function modulateColor(color: string, light: number): string {
    const rgb = parseColor(color);
    if (!rgb) return color;
    const factor = Math.max(0.15, Math.min(2.2, light));
    const r = clampByte(rgb.r * factor);
    const g = clampByte(rgb.g * factor);
    const b = clampByte(rgb.b * factor);
    return `rgb(${r},${g},${b})`;
}

export function mixColors(a: string, b: string, t: number): string {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (!ca || !cb) return a;
    const k = Math.max(0, Math.min(1, t));
    return `rgb(${clampByte(ca.r + (cb.r - ca.r) * k)},${clampByte(ca.g + (cb.g - ca.g) * k)},${clampByte(ca.b + (cb.b - ca.b) * k)})`;
}

export function colorWithAlpha(color: string, alpha: number): string {
    const rgb = parseColor(color);
    if (!rgb) return color;
    const normalizedAlpha = Math.max(0, Math.min(1, alpha));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
}

/** Normalize labels the same way MovementManager does for water/lava categories. */
export function normalizeTileLabel(value = ''): string {
    return value
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
