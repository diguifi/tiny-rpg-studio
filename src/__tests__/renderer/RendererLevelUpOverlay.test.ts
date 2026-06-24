import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RendererLevelUpOverlay } from '../../runtime/adapters/renderer/RendererLevelUpOverlay';

const makeCtx = () => {
    const parent = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    return { ctx: { canvas } as unknown as CanvasRenderingContext2D, canvas, parent };
};

const makeOverlay = (stateOverrides: Record<string, unknown> = {}) => {
    const state = {
        active: true,
        choices: [
            { id: 'a', resolvedName: 'Alpha', resolvedDescription: 'First skill' },
            { id: 'b', resolvedName: 'Beta', resolvedDescription: 'Second skill' },
        ],
        cursor: 0,
        ...stateOverrides,
    };
    const gameState = {
        isLevelUpOverlayActive: vi.fn(() => state.active),
        getLevelUpOverlay: vi.fn(() => state),
        getPendingLevelUpChoices: vi.fn(() => 0),
    };
    const paletteManager = { getColor: vi.fn((i: number) => `#color${i}`) };
    const overlay = new RendererLevelUpOverlay(gameState as never, paletteManager as never);
    return { overlay, gameState, state, paletteManager };
};

describe('RendererLevelUpOverlay', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the title and one card per choice when active', () => {
        const { ctx } = makeCtx();
        const { overlay } = makeOverlay();
        overlay.draw(ctx);

        expect(document.querySelectorAll('.game-levelup-card')).toHaveLength(2);
        expect(document.querySelector('.game-levelup-title')?.textContent).toBeTruthy();

        const names = Array.from(document.querySelectorAll('.game-levelup-card-name')).map((e) => e.textContent);
        expect(names).toEqual(['Alpha', 'Beta']);
        const descs = Array.from(document.querySelectorAll('.game-levelup-card-desc')).map((e) => e.textContent);
        expect(descs).toContain('First skill');
    });

    it('prefixes the name with the skill icon when present', () => {
        const { ctx } = makeCtx();
        const { overlay } = makeOverlay({
            choices: [{ id: 'a', resolvedName: 'Alpha', resolvedDescription: 'd', icon: '⚔' }],
        });
        overlay.draw(ctx);
        expect(document.querySelector('.game-levelup-card-name')?.textContent).toBe('⚔ Alpha');
    });

    it('marks the card at the cursor as selected', () => {
        const { ctx } = makeCtx();
        const { overlay } = makeOverlay({ cursor: 1 });
        overlay.draw(ctx);
        const cards = document.querySelectorAll('.game-levelup-card');
        expect(cards[0].classList.contains('game-levelup-card--selected')).toBe(false);
        expect(cards[1].classList.contains('game-levelup-card--selected')).toBe(true);
    });

    it('invokes the choice handler with the index when a card is clicked', () => {
        const { ctx } = makeCtx();
        const { overlay } = makeOverlay();
        const onChoose = vi.fn();
        overlay.setChoiceHandler(onChoose);
        overlay.draw(ctx);
        (document.querySelectorAll('.game-levelup-card')[1] as HTMLButtonElement).click();
        expect(onChoose).toHaveBeenCalledWith(1);
    });

    it('hides the overlay when the level-up state is no longer active', () => {
        const { ctx } = makeCtx();
        const { overlay, state } = makeOverlay();
        overlay.draw(ctx);
        const el = document.querySelector('.game-levelup-overlay') as HTMLElement;
        expect(el.style.display).toBe('block');

        state.active = false;
        overlay.draw(ctx);
        expect(el.style.display).toBe('none');
    });

    it('reuses card elements across draws (extra cards hidden, not duplicated)', () => {
        const { ctx } = makeCtx();
        const { overlay, state } = makeOverlay();
        overlay.draw(ctx);
        // Re-draw with a single choice: still 2 card elements, the extra one hidden.
        state.choices = [{ id: 'a', resolvedName: 'Alpha', resolvedDescription: 'only' }];
        overlay.draw(ctx);
        const cards = document.querySelectorAll('.game-levelup-card');
        expect(cards).toHaveLength(2);
        expect((cards[0] as HTMLElement).style.display).toBe('flex');
        expect((cards[1] as HTMLElement).style.display).toBe('none');
    });
});
