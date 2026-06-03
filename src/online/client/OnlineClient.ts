import PartySocket from 'partysocket';
import type { OnlineMessage, OnlineMessageType } from '../shared/protocol';

type MessageHandler = (msg: OnlineMessage) => void;
type ConnectionStateHandler = (state: 'connecting' | 'connected' | 'disconnected') => void;

const SESSION_TOKEN_KEY = 'tiny-rpg-online-session-token';

function getOrCreateSessionToken(): string {
    const existing = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (existing) return existing;
    const token = crypto.randomUUID();
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    return token;
}

export class OnlineClient {
    private socket: PartySocket | null = null;
    private handlers = new Map<OnlineMessageType, Set<MessageHandler>>();
    private allHandlers = new Set<MessageHandler>();
    private connectionStateHandlers = new Set<ConnectionStateHandler>();
    readonly sessionToken: string;

    constructor() {
        this.sessionToken = getOrCreateSessionToken();
    }

    connect(partyHost: string, roomId: string): void {
        this.socket = new PartySocket({ host: partyHost, room: roomId });
        this.socket.addEventListener('message', (ev: MessageEvent) => {
            try {
                const msg = JSON.parse(ev.data as string) as OnlineMessage;
                this.dispatch(msg);
            } catch {
                // ignore malformed messages
            }
        });
        this.socket.addEventListener('open', () => {
            this.connectionStateHandlers.forEach((h) => h('connected'));
        });
        this.socket.addEventListener('close', () => {
            this.connectionStateHandlers.forEach((h) => h('disconnected'));
        });
    }

    onConnectionState(handler: ConnectionStateHandler): () => void {
        this.connectionStateHandlers.add(handler);
        return () => this.connectionStateHandlers.delete(handler);
    }

    onSocketOpen(handler: () => void): void {
        if (!this.socket) return;
        // Listen on every open event so player-join is re-sent after PartySocket reconnects
        this.socket.addEventListener('open', handler);
    }

    disconnect(): void {
        this.socket?.close();
        this.socket = null;
    }

    send(msg: OnlineMessage): void {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(msg));
        }
    }

    on<T extends OnlineMessageType>(
        type: T,
        handler: (msg: Extract<OnlineMessage, { type: T }>) => void
    ): () => void {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as MessageHandler);
        return () => set.delete(handler as MessageHandler);
    }

    onAny(handler: MessageHandler): () => void {
        this.allHandlers.add(handler);
        return () => this.allHandlers.delete(handler);
    }

    get isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    private dispatch(msg: OnlineMessage): void {
        this.handlers.get(msg.type)?.forEach((h) => h(msg));
        this.allHandlers.forEach((h) => h(msg));
    }
}
