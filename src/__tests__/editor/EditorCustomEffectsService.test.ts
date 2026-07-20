import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorCustomEffectsService } from '../../editor/modules/EditorCustomEffectsService';
import { CustomEffectsIO } from '../../editor/modules/CustomEffectsIO';
import type { CustomTileEffectDefinition } from '../../runtime/domain/definitions/customTileEffects';

type ServiceManager = ConstructorParameters<typeof EditorCustomEffectsService>[0];

function createManager(existing?: CustomTileEffectDefinition[]) {
    const game = {
        title: 'Á Moon Game!',
        customTileEffects: existing,
        tileset: { tiles: [{ id: 0, visualEffect: 'custom:0' }, { id: 1, visualEffect: 'water' }] },
    };
    const replaceCustomTileEffects = vi.fn((definitions: readonly CustomTileEffectDefinition[]) => {
        game.customTileEffects = definitions.map((definition) => ({
            ...definition,
            baseEffectIds: definition.baseEffectIds.slice(),
        }));
        for (const tile of game.tileset.tiles) {
            if (tile.visualEffect.startsWith('custom:')) tile.visualEffect = 'none';
        }
    });
    const manager = {
        gameEngine: {
            getGame: vi.fn(() => game),
            replaceCustomTileEffects,
            draw: vi.fn(),
        },
        historyManager: { pushCurrentState: vi.fn() },
        renderAll: vi.fn(),
        updateJSON: vi.fn(),
        dom: {
            customEffectsImportButton: document.createElement('button'),
            customEffectsExportButton: document.createElement('button'),
        },
    };
    return { manager, game, replaceCustomTileEffects };
}

function asManager(value: ReturnType<typeof createManager>['manager']): ServiceManager {
    return value as unknown as ServiceManager;
}

describe('EditorCustomEffectsService', () => {
    const effect: CustomTileEffectDefinition = {
        id: 'custom:a', name: 'Moonlit', baseEffectIds: ['glow'], color: '#88AAFF',
    };
    let alertMock: ReturnType<typeof vi.fn>;
    let confirmMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        document.body.innerHTML = '';
        alertMock = vi.fn();
        confirmMock = vi.fn(() => true);
        vi.stubGlobal('alert', alertMock);
        vi.stubGlobal('confirm', confirmMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('binds both buttons', () => {
        const { manager } = createManager([effect]);
        const service = new EditorCustomEffectsService(asManager(manager));
        const importSpy = vi.spyOn(service, 'importEffects').mockImplementation(() => undefined);
        const exportSpy = vi.spyOn(service, 'exportEffects').mockImplementation(() => undefined);
        service.initialize();
        manager.dom.customEffectsImportButton.click();
        manager.dom.customEffectsExportButton.click();
        expect(importSpy).toHaveBeenCalledOnce();
        expect(exportSpy).toHaveBeenCalledOnce();
    });

    it('refuses an empty export', () => {
        const { manager } = createManager();
        new EditorCustomEffectsService(asManager(manager)).exportEffects();
        expect(alertMock).toHaveBeenCalledOnce();
    });

    it('downloads one portable pack with a sanitized project filename', () => {
        const { manager } = createManager([effect]);
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:effects');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        new EditorCustomEffectsService(asManager(manager)).exportEffects();
        expect(createObjectURL).toHaveBeenCalledOnce();
        expect(click).toHaveBeenCalledOnce();
        const anchor = click.mock.instances[0] as HTMLAnchorElement | undefined;
        expect(anchor?.download).toBe('a-moon-game-effects.json');
    });

    it('leaves state and history untouched for invalid or cancelled imports', () => {
        const { manager, game, replaceCustomTileEffects } = createManager([effect]);
        const service = new EditorCustomEffectsService(asManager(manager));
        service.applyPackText('{bad');
        expect(replaceCustomTileEffects).not.toHaveBeenCalled();

        const pack = CustomEffectsIO.serialize([effect]);
        expect(pack.ok).toBe(true);
        if (!pack.ok) return;
        confirmMock.mockReturnValue(false);
        service.applyPackText(pack.text);
        expect(game.customTileEffects).toEqual([effect]);
        expect(replaceCustomTileEffects).not.toHaveBeenCalled();
        expect(manager.historyManager.pushCurrentState).not.toHaveBeenCalled();
    });

    it('replaces atomically, clears assignments, refreshes once, and uses fresh IDs', () => {
        const { manager, game, replaceCustomTileEffects } = createManager([effect]);
        const service = new EditorCustomEffectsService(asManager(manager));
        const text = JSON.stringify({
            format: CustomEffectsIO.FORMAT,
            version: 1,
            effects: [
                { name: 'Ripple', baseEffectIds: ['calm-wave'] },
                { name: 'Stars', baseEffectIds: ['sparkle'], color: '#abcdef' },
            ],
        });
        service.applyPackText(text);

        expect(confirmMock).toHaveBeenCalledOnce();
        expect(replaceCustomTileEffects).toHaveBeenCalledOnce();
        expect(game.customTileEffects?.map((definition) => definition.id)).toEqual(['custom:0', 'custom:1']);
        expect(game.tileset.tiles.map((tile) => tile.visualEffect)).toEqual(['none', 'water']);
        expect(manager.renderAll).toHaveBeenCalledOnce();
        expect(manager.gameEngine.draw).toHaveBeenCalledOnce();
        expect(manager.updateJSON).toHaveBeenCalledOnce();
        expect(manager.historyManager.pushCurrentState).toHaveBeenCalledOnce();
        expect(alertMock).toHaveBeenCalledOnce();
    });
});
