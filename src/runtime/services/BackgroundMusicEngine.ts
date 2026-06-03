import {
    buildBackgroundMusicEmbedUrl,
    DEFAULT_BACKGROUND_MUSIC_VOLUME,
    normalizeBackgroundMusicVolume,
    normalizeBackgroundMusicVideoId,
} from '../infra/share/BackgroundMusicVideoId';

class BackgroundMusicEngine {
    private videoId: string | null = null;
    private iframe: HTMLIFrameElement | null = null;
    private volume = DEFAULT_BACKGROUND_MUSIC_VOLUME;

    setVideoId(videoId?: string | null): void {
        this.videoId = normalizeBackgroundMusicVideoId(videoId) ?? null;
        if (!this.videoId) {
            this.stop();
        } else if (this.iframe) {
            this.mountIframe();
        }
    }

    play(): void {
        if (!this.videoId || typeof document === 'undefined') {
            return;
        }

        this.mountIframe();
    }

    setVolume(volume: number): void {
        this.volume = normalizeBackgroundMusicVolume(volume, this.volume);
        this.postVolumeCommand();
    }

    getVolume(): number {
        return this.volume;
    }

    stop(): void {
        this.iframe?.remove();
        this.iframe = null;
    }

    syncFromGame(game: { backgroundMusicVideoId?: string; backgroundMusicVolume?: number }): void {
        this.volume = normalizeBackgroundMusicVolume(game.backgroundMusicVolume);
        this.setVideoId(game.backgroundMusicVideoId);
        this.postVolumeCommand();
    }

    destroy(): void {
        this.stop();
        this.videoId = null;
        this.volume = DEFAULT_BACKGROUND_MUSIC_VOLUME;
    }

    private mountIframe(): void {
        if (!this.videoId || typeof document === 'undefined') {
            return;
        }

        const src = buildBackgroundMusicEmbedUrl(this.videoId);
        if (!src) {
            this.stop();
            return;
        }

        if (!this.iframe) {
            this.iframe = document.createElement('iframe');
            this.iframe.width = '0';
            this.iframe.height = '0';
            this.iframe.setAttribute('aria-hidden', 'true');
            this.iframe.setAttribute('allow', 'autoplay; encrypted-media');
            this.iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            this.iframe.tabIndex = -1;
            this.iframe.addEventListener('load', () => this.postVolumeCommand());
            Object.assign(this.iframe.style, {
                position: 'fixed',
                width: '0',
                height: '0',
                border: '0',
                opacity: '0',
                pointerEvents: 'none',
            });
            document.body.appendChild(this.iframe);
        } else if (!this.iframe.isConnected) {
            document.body.appendChild(this.iframe);
        }

        if (this.iframe.src !== src) {
            this.iframe.src = src;
        }
        this.postVolumeCommand();
    }

    private postVolumeCommand(): void {
        const targetWindow = this.iframe?.contentWindow;
        if (!targetWindow) return;
        targetWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setVolume', args: [this.volume] }),
            'https://www.youtube.com'
        );
    }
}

export { BackgroundMusicEngine };
