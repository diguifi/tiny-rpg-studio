export class ConnectionIndicator {
    private el: HTMLElement;

    constructor() {
        this.el = document.createElement('div');
        Object.assign(this.el.style, {
            position: 'fixed',
            bottom: 'clamp(8px, 2vw, 12px)',
            right: 'clamp(8px, 2vw, 12px)',
            fontFamily: 'var(--ui-font-family, monospace)',
            background: 'var(--panel, #151821)',
            border: '2px solid var(--border, #232734)',
            padding: '3px 7px',
            zIndex: '9990',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
        });
        this.setState('connecting');
        document.body.appendChild(this.el);
    }

    setState(state: 'connecting' | 'connected' | 'disconnected'): void {
        this.el.innerHTML = '';

        const dot = document.createElement('span');
        const label = document.createElement('span');

        if (state === 'connected') {
            dot.textContent = '●';
            dot.style.color = 'var(--accent, #5bfa8e)';
            label.textContent = 'Online';
            label.style.color = 'var(--text, #fff)';
            this.el.style.borderColor = 'var(--border, #232734)';
        } else if (state === 'disconnected') {
            dot.textContent = '●';
            dot.style.color = '#ff4040';
            label.textContent = 'Desconectado';
            label.style.color = 'rgba(255,64,64,0.8)';
            this.el.style.borderColor = 'rgba(255,64,64,0.4)';
        } else {
            dot.textContent = '○';
            dot.style.color = 'rgba(255,255,255,0.4)';
            label.textContent = 'Conectando...';
            label.style.color = 'rgba(255,255,255,0.4)';
            this.el.style.borderColor = 'var(--border, #232734)';
        }

        this.el.append(dot, label);
    }

    destroy(): void {
        this.el.remove();
    }
}
