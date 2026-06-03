type LobbyScreenOptions = {
    playerName: string;
    onPlaySolo: () => void;
};

export class LobbyScreen {
    private overlay: HTMLElement;
    private options: LobbyScreenOptions;

    constructor(options: LobbyScreenOptions) {
        this.options = options;
        this.overlay = document.createElement('div');
        this.build();
    }

    private build(): void {
        Object.assign(this.overlay.style, {
            position: 'fixed',
            inset: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(14,15,19,0.94)',
            zIndex: '9998',
            padding: '16px',
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            background: 'var(--panel, #151821)',
            border: '4px solid var(--border, #232734)',
            padding: 'clamp(16px, 4vw, 24px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: 'min(300px, calc(100vw - 32px))',
            fontFamily: 'var(--ui-font-family, monospace)',
        });

        const title = document.createElement('div');
        title.textContent = 'Aguardando jogadores';
        Object.assign(title.style, {
            color: 'var(--accent, #5bfa8e)',
            fontWeight: 'bold',
            borderBottom: '1px solid var(--border, #232734)',
            paddingBottom: '8px',
        });

        const playerRow = document.createElement('div');
        Object.assign(playerRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text, #fff)',
        });
        const dot = document.createElement('span');
        dot.textContent = '●';
        dot.style.color = 'var(--accent, #5bfa8e)';
        const nameEl = document.createElement('span');
        nameEl.textContent = `${this.options.playerName} (Você)`;
        playerRow.append(dot, nameEl);

        const waitRow = document.createElement('div');
        Object.assign(waitRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'rgba(255,255,255,0.45)',
        });
        const waitDot = document.createElement('span');
        waitDot.textContent = '○';
        const waitText = document.createElement('span');
        waitText.textContent = 'Aguardando P2...';
        waitRow.append(waitDot, waitText);

        const sep = document.createElement('div');
        sep.style.borderTop = '1px solid var(--border, #232734)';
        sep.style.margin = '2px 0';

        const soloBtn = document.createElement('button');
        soloBtn.textContent = 'Jogar sozinho';
        Object.assign(soloBtn.style, {
            background: 'transparent',
            border: '2px solid var(--border, #232734)',
            color: 'rgba(255,255,255,0.45)',
            padding: '7px',
            width: '100%',
            fontFamily: 'var(--ui-font-family, monospace)',
            cursor: 'pointer',
        });
        soloBtn.addEventListener('mouseover', () => {
            soloBtn.style.borderColor = 'var(--accent, #5bfa8e)';
            soloBtn.style.color = 'var(--text, #fff)';
        });
        soloBtn.addEventListener('mouseout', () => {
            soloBtn.style.borderColor = 'var(--border, #232734)';
            soloBtn.style.color = 'rgba(255,255,255,0.45)';
        });
        soloBtn.addEventListener('click', () => {
            this.remove();
            this.options.onPlaySolo();
        });

        box.append(title, playerRow, waitRow, sep, soloBtn);
        this.overlay.appendChild(box);
    }

    show(): void {
        document.body.appendChild(this.overlay);
    }

    dismiss(): void {
        this.remove();
    }

    private remove(): void {
        this.overlay.remove();
    }
}
