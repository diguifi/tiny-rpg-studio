import type { OnlineClient } from './OnlineClient';
import type { WorldStateDiff, EnemyNetState, FullStateSnapshot } from '../shared/protocol';
import type { EnemyDefinition, VariableDefinition } from '../../types/gameState';

type ObjectNetState = { collected: boolean; on: boolean; opened?: boolean; x?: number; y?: number };

type GameStateRef = {
    getEnemies(): EnemyDefinition[];
    getVariables?(): unknown;
    getObjects?(): unknown;
    getGame?(): { items?: Array<{ roomIndex: number; x: number; y: number; collected?: boolean }> };
};

export class OnlineStateBroadcaster {
    private tick = 0;
    private lastEnemySnapshot: Partial<Record<string, EnemyNetState>> = {};
    private lastVariables: Partial<Record<number, number>> = {};
    private lastObjects: Partial<Record<string, ObjectNetState>> = {};
    private lastItems: Partial<Record<string, boolean>> = {};
    private intervalId: ReturnType<typeof setInterval> | null = null;

    private client: OnlineClient;
    private gameState: GameStateRef;
    private intervalMs: number;

    constructor(client: OnlineClient, gameState: GameStateRef, intervalMs: number = 50) {
        this.client = client;
        this.gameState = gameState;
        this.intervalMs = intervalMs;
    }

    start(): void {
        if (this.intervalId !== null) return;
        this.intervalId = setInterval(() => this.broadcastDiff(), this.intervalMs);
    }

    /** Send a diff right now, without waiting for the next 50ms tick. */
    triggerNow(): void {
        this.broadcastDiff();
    }

    stop(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    buildSnapshot(): FullStateSnapshot {
        const enemies: Record<string, EnemyNetState> = {};
        for (const e of this.gameState.getEnemies()) {
            if (e.deathStartTime == null) {
                enemies[e.id] = { x: e.x, y: e.y, hp: e.lives ?? 1, roomIndex: e.roomIndex, alive: true, playerInVision: e.playerInVision };
            }
        }
        const variables = this.extractVariables();
        const objects = this.extractObjects();
        const items = this.extractItems();
        return { enemies, variables, objects, items, players: [] };
    }

    private broadcastDiff(): void {
        const enemies = this.gameState.getEnemies();
        const changedEnemies: Record<string, EnemyNetState> = {};
        let hasEnemyChanges = false;
        const aliveEnemyIds = new Set<string>();

        for (const e of enemies) {
            const key = e.id;
            if (e.deathStartTime != null) {
                if (this.lastEnemySnapshot[key]) {
                    changedEnemies[key] = {
                        ...this.lastEnemySnapshot[key],
                        x: e.x,
                        y: e.y,
                        hp: e.lives ?? 0,
                        roomIndex: e.roomIndex,
                        alive: false,
                    };
                    delete this.lastEnemySnapshot[key];
                    hasEnemyChanges = true;
                }
                continue;
            }
            aliveEnemyIds.add(key);
            const prev = this.lastEnemySnapshot[key];
            const curr: EnemyNetState = { x: e.x, y: e.y, hp: e.lives ?? 1, roomIndex: e.roomIndex, alive: true, playerInVision: e.playerInVision };
            if (!prev || prev.x !== curr.x || prev.y !== curr.y || prev.hp !== curr.hp || prev.roomIndex !== curr.roomIndex || prev.alive !== curr.alive || prev.playerInVision !== curr.playerInVision) {
                changedEnemies[key] = curr;
                this.lastEnemySnapshot[key] = curr;
                hasEnemyChanges = true;
            }
        }
        for (const [id, prev] of Object.entries(this.lastEnemySnapshot)) {
            if (aliveEnemyIds.has(id)) continue;
            changedEnemies[id] = { ...prev, alive: false };
            delete this.lastEnemySnapshot[id];
            hasEnemyChanges = true;
        }

        const currentVars = this.extractVariables();
        const changedVars: Record<number, number> = {};
        let hasVarChanges = false;
        for (const [idx, val] of Object.entries(currentVars)) {
            const i = Number(idx);
            if (this.lastVariables[i] !== val) {
                changedVars[i] = val;
                this.lastVariables[i] = val;
                hasVarChanges = true;
            }
        }

        const currentObjs = this.extractObjects();
        const changedObjs: Record<string, ObjectNetState> = {};
        let hasObjChanges = false;
        for (const [id, state] of Object.entries(currentObjs)) {
            const prev = this.lastObjects[id];
            if (
                !prev ||
                prev.collected !== state.collected ||
                prev.on !== state.on ||
                prev.opened !== state.opened ||
                prev.x !== state.x ||
                prev.y !== state.y
            ) {
                changedObjs[id] = state;
                this.lastObjects[id] = { ...state };
                hasObjChanges = true;
            }
        }

        const currentItems = this.extractItems();
        const changedItems: Record<string, boolean> = {};
        let hasItemChanges = false;
        for (const [id, collected] of Object.entries(currentItems)) {
            if (this.lastItems[id] !== collected) {
                changedItems[id] = collected;
                this.lastItems[id] = collected;
                hasItemChanges = true;
            }
        }

        if (!hasEnemyChanges && !hasVarChanges && !hasObjChanges && !hasItemChanges) return;

        const diff: WorldStateDiff = { tick: ++this.tick };
        if (hasEnemyChanges) diff.enemies = changedEnemies;
        if (hasVarChanges) diff.variables = changedVars;
        if (hasObjChanges) diff.objects = changedObjs;
        if (hasItemChanges) diff.items = changedItems;

        this.client.send({ type: 'world-state-diff', diff });
    }

    private extractVariables(): Record<number, number> {
        const result: Record<number, number> = {};
        if (typeof this.gameState.getVariables !== 'function') return result;
        const vars = this.gameState.getVariables() as VariableDefinition[] | null;
        if (!Array.isArray(vars)) return result;
        vars.forEach((v, i) => {
            // Variables are stored as booleans at runtime; encode as 0/1 for the wire format
            if (typeof v.value === 'boolean') result[i] = v.value ? 1 : 0;
            else if (typeof v.value === 'number') result[i] = v.value;
        });
        return result;
    }

    private extractObjects(): Record<string, ObjectNetState> {
        const result: Record<string, ObjectNetState> = {};
        if (typeof this.gameState.getObjects !== 'function') return result;
        const raw = this.gameState.getObjects();
        const objs = Array.isArray(raw)
            ? (raw as Array<{ id: string; type?: string; collected?: boolean; on?: boolean; opened?: boolean; x?: number; y?: number }>)
            : [];
        for (const obj of objs) {
            if (!obj.id) continue;
            const state: ObjectNetState = { collected: Boolean(obj.collected), on: Boolean(obj.on) };
            if (obj.opened !== undefined) state.opened = Boolean(obj.opened);
            // Push boxes track position — include x/y so movement syncs
            if (obj.type === 'push-box') {
                state.x = obj.x;
                state.y = obj.y;
            }
            result[obj.id] = state;
        }
        return result;
    }

    private extractItems(): Record<string, boolean> {
        const result: Record<string, boolean> = {};
        const game = this.gameState.getGame?.();
        if (!game || !Array.isArray(game.items)) return result;
        for (const item of game.items) {
            const id = `item-${item.roomIndex}-${item.x}-${item.y}`;
            result[id] = Boolean(item.collected);
        }
        return result;
    }
}
