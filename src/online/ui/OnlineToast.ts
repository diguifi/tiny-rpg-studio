export class OnlineToast {
    private container: HTMLElement;

    constructor() {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'fixed',
            top: 'clamp(8px, 2vw, 12px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            zIndex: '10000',
            pointerEvents: 'none',
            width: 'min(280px, calc(100vw - 24px))',
            fontFamily: 'var(--ui-font-family, monospace)',
        });
        document.body.appendChild(this.container);
    }

    show(message: string, durationMs = 3000): void {
        const el = document.createElement('div');
        Object.assign(el.style, {
            background: 'var(--panel, #151821)',
            borderLeft: '3px solid var(--accent, #5bfa8e)',
            borderTop: '1px solid var(--border, #232734)',
            borderRight: '1px solid var(--border, #232734)',
            borderBottom: '1px solid var(--border, #232734)',
            color: 'var(--text, #fff)',
            padding: '6px 10px',
            opacity: '1',
            transition: 'opacity 0.35s ease',
        });
        el.textContent = message;
        this.container.appendChild(el);

        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 380);
        }, durationMs);
    }

    destroy(): void {
        this.container.remove();
    }
}
