export class OnlineRoomTracker {
    private occupiedRooms = new Set<number>();
    private playerRooms = new Map<string, number>();

    updatePlayer(playerId: string, roomIndex: number): boolean {
        const prev = this.playerRooms.get(playerId);
        if (prev === roomIndex) return false;
        this.playerRooms.set(playerId, roomIndex);
        this.recompute();
        return true;
    }

    removePlayer(playerId: string): void {
        this.playerRooms.delete(playerId);
        this.recompute();
    }

    isOccupied(roomIndex: number): boolean {
        return this.occupiedRooms.has(roomIndex);
    }

    getOccupiedRooms(): ReadonlySet<number> {
        return this.occupiedRooms;
    }

    private recompute(): void {
        this.occupiedRooms.clear();
        for (const room of this.playerRooms.values()) {
            this.occupiedRooms.add(room);
        }
    }
}
