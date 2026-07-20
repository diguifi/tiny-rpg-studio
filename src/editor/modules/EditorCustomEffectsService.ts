import type { EditorManager } from '../EditorManager';
import type { GameDefinition } from '../../types/gameState';
import type { CustomTileEffectDefinition } from '../../runtime/domain/definitions/customTileEffects';
import { TextResources } from '../../runtime/adapters/TextResources';
import { CustomEffectsIO } from './CustomEffectsIO';

type GameWithEffects = Pick<GameDefinition, 'customTileEffects' | 'title'>;

export class EditorCustomEffectsService {
    private readonly manager: EditorManager;

    constructor(manager: EditorManager) {
        this.manager = manager;
    }

    initialize(): void {
        this.manager.dom.customEffectsImportButton?.addEventListener('click', () => this.importEffects());
        this.manager.dom.customEffectsExportButton?.addEventListener('click', () => this.exportEffects());
    }

    private t(key: string, fallback: string): string {
        return TextResources.get(key, fallback);
    }

    private getGame(): GameWithEffects {
        return this.manager.gameEngine.getGame() as GameWithEffects;
    }

    private mapError(code: string): string {
        switch (code) {
            case CustomEffectsIO.ERROR_FILE_TOO_LARGE:
                return this.t('customEffects.io.error.tooLarge', 'Effects pack file is too large (max 256 KB).');
            case CustomEffectsIO.ERROR_TOO_MANY_EFFECTS:
                return this.t('customEffects.io.error.tooMany', 'An effects pack can contain up to 16 effects.');
            case CustomEffectsIO.ERROR_NOTHING_TO_IMPORT:
                return this.t('customEffects.io.error.empty', 'The effects pack is empty.');
            case CustomEffectsIO.ERROR_DUPLICATE_NAME:
                return this.t('customEffects.io.error.duplicate', 'Effect names must be unique.');
            case CustomEffectsIO.ERROR_INVALID_RECIPE:
                return this.t('customEffects.io.error.recipe', 'The effects pack contains an invalid effect.');
            default:
                return this.t('customEffects.io.error.invalid', 'Invalid effects pack file.');
        }
    }

    private buildFilename(title: string | undefined): string {
        const safe = (typeof title === 'string' ? title : '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();
        return safe ? `${safe}-effects.json` : 'tiny-rpg-effects.json';
    }

    private downloadText(filename: string, content: string): void {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    exportEffects(): void {
        const game = this.getGame();
        if (!Array.isArray(game.customTileEffects) || game.customTileEffects.length === 0) {
            alert(this.t('customEffects.io.exportEmpty', 'Nothing to export: no custom effects.'));
            return;
        }
        const serialized = CustomEffectsIO.serialize(game.customTileEffects);
        if (!serialized.ok) {
            alert(this.mapError(serialized.error));
            return;
        }
        this.downloadText(this.buildFilename(game.title), serialized.text);
    }

    importEffects(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > CustomEffectsIO.MAX_FILE_BYTES) {
                alert(this.mapError(CustomEffectsIO.ERROR_FILE_TOO_LARGE));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => this.applyPackText(String(reader.result || ''));
            reader.onerror = () => alert(this.t('customEffects.io.error.read', 'Could not read the effects pack file.'));
            reader.readAsText(file);
        });
        input.click();
    }

    applyPackText(text: string): void {
        const parsed = CustomEffectsIO.parse(text);
        if (!parsed.ok) {
            alert(this.mapError(parsed.error));
            return;
        }
        const game = this.getGame();
        if (
            Array.isArray(game.customTileEffects) && game.customTileEffects.length > 0 &&
            !window.confirm(this.t(
                'customEffects.io.confirmReplace',
                'Replace all custom effects with the imported pack? Tile assignments using custom effects will be cleared.'
            ))
        ) return;

        const engine = this.manager.gameEngine as typeof this.manager.gameEngine & {
            replaceCustomTileEffects(definitions: readonly CustomTileEffectDefinition[]): void;
        };
        engine.replaceCustomTileEffects(parsed.effects);
        this.manager.renderAll();
        engine.draw();
        this.manager.updateJSON();
        this.manager.historyManager.pushCurrentState();
        alert(TextResources.format(
            'customEffects.io.importSuccess',
            { count: parsed.effects.length },
            `Imported ${parsed.effects.length} effect(s).`
        ));
    }
}

export default EditorCustomEffectsService;
