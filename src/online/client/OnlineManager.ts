import { OnlineClient } from './OnlineClient';
import type { OnlineRole, PlayerInfo, FullStateSnapshot, OnlineMessage } from '../shared/protocol';

export type OnlineManagerOptions = {
    partyHost: string;
    roomId: string;
    playerName: string;
};

export type RemotePlayer = {
    id: string;
    name: string;
    role: OnlineRole;
    roomIndex: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    alive: boolean;
};

export class OnlineManager {
    readonly client: OnlineClient;
    private _role: OnlineRole = 'guest';
    private _players: PlayerInfo[] = [];
    private _gameStarted = false;

    private _onGameStart: (() => void) | null = null;
    private _onGameOver: ((winnerId: string, winnerName: string) => void) | null = null;
    private _onPlayerListChanged: ((players: PlayerInfo[]) => void) | null = null;
    private _onSnapshot: ((snapshot: FullStateSnapshot) => void) | null = null;
    private _onMessage: ((msg: OnlineMessage) => void) | null = null;
    private _onHostPromoted: (() => void) | null = null;

    private options: OnlineManagerOptions;

    constructor(options: OnlineManagerOptions) {
        this.options = options;
        this.client = new OnlineClient();
        this.setupHandlers();
    }

    private setupHandlers(): void {
        this.client.on('role-changed', (msg) => {
            const wasGuest = this._role === 'guest';
            this._role = msg.newRole;
            if (wasGuest && msg.newRole === 'host') {
                this._onHostPromoted?.();
            }
        });

        this.client.on('player-list', (msg) => {
            this._players = msg.players;
            this._onPlayerListChanged?.(msg.players);
        });

        this.client.on('game-start', () => {
            this._gameStarted = true;
            this._onGameStart?.();
        });

        this.client.on('game-over', (msg) => {
            this._onGameOver?.(msg.winnerId, msg.winnerName);
        });

        this.client.on('full-state-snapshot', (msg) => {
            this._onSnapshot?.(msg.snapshot);
        });

        this.client.onAny((msg) => {
            this._onMessage?.(msg);
        });
    }

    connect(): void {
        this.client.connect(this.options.partyHost, this.options.roomId);
        // PartySocket is a WebSocket — listen for 'open' exactly once on the socket itself.
        this.client.onSocketOpen(() => {
            this.client.send({
                type: 'player-join',
                name: this.options.playerName,
                sessionToken: this.client.sessionToken,
            });
        });
    }

    disconnect(): void {
        this.client.disconnect();
    }

    cancelLobby(): void {
        this.client.send({ type: 'lobby-cancelled' });
        this.disconnect();
    }

    get role(): OnlineRole { return this._role; }
    get isHost(): boolean { return this._role === 'host'; }
    get isGuest(): boolean { return this._role === 'guest'; }
    get players(): PlayerInfo[] { return this._players; }
    get gameStarted(): boolean { return this._gameStarted; }

    getRemotePlayers(): RemotePlayer[] {
        return this._players
            .filter((p) => p.id !== this.client.sessionToken)
            .map((p) => ({
                id: p.id,
                name: p.name,
                role: p.role,
                roomIndex: parseInt(p.room, 10),
                x: p.x,
                y: p.y,
                hp: p.hp,
                maxHp: p.maxHp,
                alive: p.alive,
            }));
    }

    onGameStart(cb: () => void): void { this._onGameStart = cb; }
    onGameOver(cb: (winnerId: string, winnerName: string) => void): void { this._onGameOver = cb; }
    onPlayerListChanged(cb: (players: PlayerInfo[]) => void): void { this._onPlayerListChanged = cb; }
    onSnapshot(cb: (snapshot: FullStateSnapshot) => void): void { this._onSnapshot = cb; }
    onMessage(cb: (msg: OnlineMessage) => void): void { this._onMessage = cb; }
    onHostPromoted(cb: () => void): void { this._onHostPromoted = cb; }
}
