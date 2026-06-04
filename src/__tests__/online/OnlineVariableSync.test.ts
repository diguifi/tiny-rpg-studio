import { describe, expect, it, vi } from 'vitest';
import { OnlineStateBroadcaster } from '../../online/client/OnlineStateBroadcaster';
import { OnlineStateSync } from '../../online/client/OnlineStateSync';
import type { OnlineMessage } from '../../online/shared/protocol';

type Var = { id: string; value: boolean };

// Minimal host/guest gameState doubles matching the shapes the broadcaster and
// sync actually use, to verify a variable change propagates across the wire.
function makeHost(vars: Var[]) {
    return {
        getEnemies: () => [],
        getVariables: () => vars,
        getObjects: () => [],
        getGame: () => ({ items: [] }),
    };
}

function makeGuest(vars: Var[]) {
    return {
        getEnemies: () => [],
        setVariableValue: (id: string | number, value: unknown) => {
            const v = vars.find((x) => x.id === String(id));
            if (v) v.value = Boolean(value);
            return true;
        },
        getObjects: () => [],
        getGame: () => ({ items: [] }),
    };
}

describe('online variable synchronization', () => {
    it('propagates a var-1 change from host to guest', () => {
        const hostVars: Var[] = [{ id: 'var-1', value: false }, { id: 'var-2', value: false }];
        const guestVars: Var[] = [{ id: 'var-1', value: false }, { id: 'var-2', value: false }];

        const sent: OnlineMessage[] = [];
        const client = { send: vi.fn((m: OnlineMessage) => sent.push(m)) };
        const broadcaster = new OnlineStateBroadcaster(client as never, makeHost(hostVars));
        const sync = new OnlineStateSync(makeGuest(guestVars) as never);
        // Guest must have a snapshot before diffs are applied.
        sync.applySnapshot({ enemies: {}, variables: {}, objects: {}, items: {}, players: [] });

        // Seed broadcaster baseline (first diff captures all-false state).
        broadcaster.triggerNow();
        sent.length = 0;

        // Host toggles var-1.
        hostVars[0].value = true;
        broadcaster.triggerNow();

        const diffMsg = sent.find((m) => m.type === 'world-state-diff');
        expect(diffMsg).toBeDefined();
        if (diffMsg?.type === 'world-state-diff') {
            sync.applyDiff(diffMsg.diff);
        }
        expect(guestVars[0].value).toBe(true);
    });

    it('propagates a var-10 change from host to guest (skill:bard offset)', () => {
        const ids = ['var-1', 'var-2', 'var-3', 'var-4', 'var-5', 'var-6', 'var-7', 'var-8', 'var-9', 'var-10'];
        const hostVars: Var[] = ids.map((id) => ({ id, value: false }));
        const guestVars: Var[] = ids.map((id) => ({ id, value: false }));

        const sent: OnlineMessage[] = [];
        const client = { send: vi.fn((m: OnlineMessage) => sent.push(m)) };
        const broadcaster = new OnlineStateBroadcaster(client as never, makeHost(hostVars));
        const sync = new OnlineStateSync(makeGuest(guestVars) as never);
        sync.applySnapshot({ enemies: {}, variables: {}, objects: {}, items: {}, players: [] });

        broadcaster.triggerNow();
        sent.length = 0;

        hostVars[9].value = true; // var-10
        broadcaster.triggerNow();

        const diffMsg = sent.find((m) => m.type === 'world-state-diff');
        if (diffMsg?.type === 'world-state-diff') {
            sync.applyDiff(diffMsg.diff);
        }
        expect(guestVars[9].value).toBe(true);
    });
});
