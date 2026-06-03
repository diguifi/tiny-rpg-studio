import type { OnlineClient } from './OnlineClient';

export class OnlineInputRelay {
    private client: OnlineClient;
    private playerId: string;

    constructor(client: OnlineClient) {
        this.client = client;
        this.playerId = client.sessionToken;
    }

    sendMove(dx: number, dy: number): void {
        this.client.send({
            type: 'player-input',
            playerId: this.playerId,
            action: 'move',
            dx,
            dy,
        });
    }

    sendAttack(enemyId: string, damage = 1): void {
        this.client.send({
            type: 'player-input',
            playerId: this.playerId,
            action: 'attack',
            enemyId,
            damage,
        });
    }

    sendInteract(): void {
        this.client.send({
            type: 'player-input',
            playerId: this.playerId,
            action: 'interact',
        });
    }
}
