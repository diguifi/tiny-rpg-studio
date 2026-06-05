import type { GameEngine } from './GameEngine';
import { ITEM_TYPES } from '../domain/constants/itemTypes';
import { GameConfig } from '../../config/GameConfig';
import type { OnlineMode } from '../../types/onlineMode';

type RemoteAiPlayer = { id: string; x: number; y: number; roomIndex: number; alive?: boolean };

/**
 * Owns everything related to online/multiplayer mode. The GameEngine itself does
 * not handle any online concern — it only holds an instance of this coordinator
 * and notifies it about local game events (`notify*`). The online client layer
 * (OnlineModeApplication) wires its outbound hooks here and drives the host's
 * authoritative handling of guest actions through the `processGuest*` / `apply*`
 * methods.
 *
 * Keeping this out of GameEngine means the engine stays a single-player core,
 * and all the host/guest asymmetry lives in one place.
 */
export class OnlineCoordinator {
  private readonly engine: GameEngine;

  /** 'solo' | 'online-host' | 'online-guest'. */
  mode: OnlineMode = 'solo';

  // Outbound hooks — set by the online client layer (OnlineModeApplication).
  onPlayerDefeated: (() => void) | null = null;
  onGameCompletion: (() => void) | null = null;
  onMove: ((dx: number, dy: number) => void) | null = null;
  onInteract: ((x: number, y: number, roomIndex: number) => void) | null = null;
  onEnemyDied: ((enemyId: string, roomIndex: number) => void) | null = null;
  onItemPicked: ((itemId: string, roomIndex: number) => void) | null = null;
  onObjectTriggered: ((objectId: string, roomIndex: number, newState: boolean) => void) | null = null;
  onStateChanged: (() => void) | null = null;
  onRespawned: (() => void) | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  // --- Mode ---------------------------------------------------------------

  setMode(mode: OnlineMode): void {
    this.mode = mode;
    // Guest mode blocks local switch mutation; the host applies it authoritatively.
    this.engine.interactionManager.guestMode = mode === 'online-guest';
    // Guest mode also makes push-boxes host-authoritative (no local move/reset).
    this.engine.movementManager.guestMode = mode === 'online-guest';
  }

  isGuestMode(): boolean {
    return this.mode === 'online-guest';
  }

  isHostMode(): boolean {
    return this.mode === 'online-host';
  }

  isOnline(): boolean {
    return this.mode !== 'solo';
  }

  // --- Inbound notifications fired by the engine core ---------------------

  notifyMove(dx: number, dy: number): void {
    this.onMove?.(dx, dy);
  }

  notifyInteract(x: number, y: number, roomIndex: number): void {
    this.onInteract?.(x, y, roomIndex);
  }

  notifyStateChanged(): void {
    this.onStateChanged?.();
  }

  notifyItemCollected(itemId: string, roomIndex: number): void {
    this.onItemPicked?.(itemId, roomIndex);
  }

  notifyObjectTriggered(objectId: string, roomIndex: number, newState: boolean): void {
    this.onObjectTriggered?.(objectId, roomIndex, newState);
  }

  notifyEnemyDied(enemyId: string, roomIndex: number): void {
    this.onEnemyDied?.(enemyId, roomIndex);
  }

  notifyPlayerDefeated(): void {
    this.onPlayerDefeated?.();
  }

  // Fired when the local player comes back to life after a game-over restart/revive.
  // The online layer uses it to tell the other client (player-respawned) so the
  // restarted player is no longer rendered as a dead/invisible ghost.
  notifyRespawned(): void {
    this.onRespawned?.();
  }

  notifyGameCompletion(): void {
    this.onGameCompletion?.();
  }

  // --- Host-side handling of remote players -------------------------------

  setActiveRooms(rooms: ReadonlySet<number> | null): void {
    this.engine.enemyManager.setActiveRooms(rooms);
  }

  setRemotePlayersForEnemyAI(players: RemoteAiPlayer[]): void {
    this.engine.enemyManager.setRemotePlayers(players);
  }

  // --- Host-side handling of guest actions --------------------------------

  checkPressurePlatesForGuest(guestX: number, guestY: number, guestRoomIndex: number): void {
    this.engine.interactionManager.checkPressurePlatesAt({ x: guestX, y: guestY, roomIndex: guestRoomIndex });
    this.notifyStateChanged();
  }

  // Host-authoritative push-box reset. Called when a room is vacated (a guest left
  // it or disconnected); the host restores the boxes to their origin and the change
  // propagates to the guest through the normal world-state broadcast.
  resetPushBoxesForRoom(roomIndex: number): void {
    this.engine.gameState.resetPushBoxesForRoom?.(roomIndex);
    this.notifyStateChanged();
  }

  processGuestMove(guestX: number, guestY: number, guestRoomIndex: number, dx: number, dy: number): void {
    this.engine.movementManager.tryPushBoxForGuest(guestX, guestY, guestRoomIndex, dx, dy);
    this.notifyStateChanged();
  }

  processGuestInteract(guestX: number, guestY: number, guestRoomIndex: number): void {
    // Only process switch toggles on behalf of the Guest.
    // Items, NPCs, traps, chests and exits must NOT run here.
    const triggered = this.engine.interactionManager.handleSwitchInteractAt(guestX, guestY, guestRoomIndex);
    if (triggered) {
      this.engine.renderer.draw();
      this.notifyStateChanged();
    }
  }

  processGuestAttack(enemyId: string): void {
    this.processGuestAttackDamage(enemyId, 1);
  }

  processGuestAttackDamage(enemyId: string, damage = 1): void {
    const enemies = this.engine.gameState.getEnemies();
    const enemy = enemies.find((e) => e.id === enemyId);
    if (!enemy || typeof (enemy as { deathStartTime?: number | null }).deathStartTime === 'number') return;
    const lives = typeof enemy.lives === 'number' ? enemy.lives : 1;
    const normalizedDamage = Number.isFinite(damage) ? Math.max(1, Math.floor(damage)) : 1;
    enemy.lives = Math.max(0, lives - normalizedDamage);
    if (enemy.lives <= 0) {
      (enemy as { deathStartTime?: number | null }).deathStartTime = performance.now();
      // Cancel any pending windup timers targeting this enemy to prevent ghost damage
      this.engine.enemyManager.cancelWindupTimersForEnemy(enemyId);
      // Clear the attack telegraph so the indicator doesn't persist
      this.engine.renderer.attackTelegraph.deactivateTelegraph(enemyId);
      this.onEnemyDied?.(enemyId, enemy.roomIndex);
      setTimeout(() => {
        const idx = this.engine.gameState.getEnemies().findIndex((e) => e.id === enemyId);
        if (idx >= 0) this.engine.gameState.getEnemies().splice(idx, 1);
      }, 1000);
    }
    this.notifyStateChanged();
    this.engine.renderer.draw();
  }

  prepareGuestAttack(enemyId: string): number | null {
    const player = this.engine.gameState.getPlayer();
    if (!player) return null;
    const now = performance.now();
    if (now - player.lastAttackTime < GameConfig.combat.attackCooldown) {
      return null;
    }
    const enemy = this.engine.gameState.getEnemies().find((entry) => entry.id === enemyId);
    if (!enemy || typeof enemy.deathStartTime === 'number') return null;

    player.lastAttackTime = now;
    const baseDamage = this.engine.gameState.getPlayerDamage();
    const backstabDamage = this.isBackstab(player, enemy) ? 1 : 0;
    this.engine.gameState.consumeSwordDurability();
    this.engine.renderer.draw();
    return baseDamage + backstabDamage;
  }

  private isBackstab(
    player: { x: number; y: number; roomIndex: number },
    enemy: { x: number; y: number; roomIndex: number; lastX?: number; lastY?: number },
  ): boolean {
    if (player.roomIndex !== enemy.roomIndex) return false;
    const dx = enemy.x - (enemy.lastX ?? enemy.x);
    const dy = enemy.y - (enemy.lastY ?? enemy.y);
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      return dx > 0 ? player.x < enemy.x : player.x > enemy.x;
    }
    if (dy !== 0) {
      return dy > 0 ? player.y < enemy.y : player.y > enemy.y;
    }
    return false;
  }

  /**
   * Applies a remote `object-triggered` message on the guest. Besides flipping
   * the object's own `on`/`opened` flags, a switch (lever) OWNS a variable — so
   * we propagate it via setVariableValue. That makes everything derived from the
   * variable (pressure plates, variable-doors, LEDs, logic gates) reflect the new
   * state immediately, instead of relying solely on a separate world-state-diff
   * that may arrive late, be missed, or be overwritten by local evaluation.
   * Returns true if a matching object was found and updated.
   */
  applyRemoteObjectTriggered(objectId: string, roomIndex: number, newState: boolean): boolean {
    const objs = this.engine.gameState.getObjectsForRoom(roomIndex) as Array<{
      id?: string;
      type?: string;
      roomIndex: number;
      x: number;
      y: number;
      on?: boolean;
      opened?: boolean;
      isLockedDoor?: boolean;
      variableId?: string | null;
    }>;
    const obj = objs.find((o) => (o.id ?? `obj-${o.roomIndex}-${o.x}-${o.y}`) === objectId);
    if (!obj) return false;
    obj.on = newState;
    if ('opened' in obj || obj.isLockedDoor) {
      obj.opened = newState;
    }
    // A switch drives a variable; sync it so plates/doors/LEDs/gates update too.
    if (obj.type === ITEM_TYPES.SWITCH && obj.variableId) {
      this.engine.gameState.setVariableValue(obj.variableId, newState);
    }
    this.engine.renderer.draw();
    return true;
  }
}
