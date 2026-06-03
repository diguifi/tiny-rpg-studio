const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const DEFAULT_BACKGROUND_MUSIC_VOLUME = 100;

function isYoutubeHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return normalized === 'youtu.be' ||
        normalized === 'youtube.com' ||
        normalized.endsWith('.youtube.com');
}

function sanitizeVideoId(value: string | null | undefined): string | undefined {
    const trimmed = (value || '').trim();
    return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

function normalizeBackgroundMusicVideoId(input: unknown): string | undefined {
    if (typeof input !== 'string') {
        return undefined;
    }

    const trimmed = input.trim();
    const direct = sanitizeVideoId(trimmed);
    if (direct) {
        return direct;
    }

    try {
        const url = new URL(trimmed);
        if (!isYoutubeHost(url.hostname)) {
            return undefined;
        }

        if (url.hostname.toLowerCase() === 'youtu.be') {
            return sanitizeVideoId(url.pathname.split('/').filter(Boolean)[0]);
        }

        const searchId = sanitizeVideoId(url.searchParams.get('v'));
        if (searchId) {
            return searchId;
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 2 && ['embed', 'shorts', 'live'].includes(pathParts[0] || '')) {
            return sanitizeVideoId(pathParts[1]);
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function buildBackgroundMusicUrl(videoId: string | null | undefined): string {
    const normalized = sanitizeVideoId(videoId);
    return normalized ? `https://www.youtube.com/watch?v=${normalized}` : '';
}

function buildBackgroundMusicEmbedUrl(videoId: string | null | undefined): string {
    const normalized = sanitizeVideoId(videoId);
    const origin = typeof globalThis.location.origin === 'string' && globalThis.location.origin
        ? `&origin=${encodeURIComponent(globalThis.location.origin)}`
        : '';
    return normalized
        ? `https://www.youtube.com/embed/${normalized}?autoplay=1&controls=0&loop=1&playlist=${normalized}&rel=0&enablejsapi=1${origin}`
        : '';
}

function normalizeBackgroundMusicVolume(input: unknown, fallback = DEFAULT_BACKGROUND_MUSIC_VOLUME): number {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
        return fallback;
    }

    const integer = Math.floor(input);
    return Math.max(0, Math.min(100, integer));
}

export {
    buildBackgroundMusicEmbedUrl,
    buildBackgroundMusicUrl,
    DEFAULT_BACKGROUND_MUSIC_VOLUME,
    normalizeBackgroundMusicVolume,
    normalizeBackgroundMusicVideoId,
};
