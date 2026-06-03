Original prompt: Os inimigos não estão sincronizados e funcionando no modo online

Notes:
- Investigating online enemy synchronization between Host simulation and Guest state application.
- Fixed online enemy death/removal sync: Host now sends dead enemies in world-state diffs, Guest marks them dying and removes after the death animation.
- Host enemy movement now triggers the online state broadcaster immediately through GameEngine.onOnlineStateChanged.
- Added focused tests in src/__tests__/online/OnlineEnemySync.test.ts.
- Verification passed: online enemy sync tests, GameEngine/EnemyManager tests, TypeScript typecheck, and Playwright smoke screenshot against the local Vite app.
- Follow-up fix: moveChasingEnemies now also calls the online state-change callback, so enemy movement from both host tick and chase movement paths triggers immediate broadcast.
- Added EnemyManager tests to assert movement broadcasts are notified in both paths.
- Implemented only online state that affects another player: Guest attack sends real damage to Host, player-position carries basic runtime fields, PartyKit stores them in player-list, and locked doors opened by movement emit object sync.
- Verification passed for runtime messages, movement door sync, enemy sync, GameEngine/EnemyManager tests, TypeScript typecheck, and two-tab online smoke with player runtime fields.
- Refactored online bootstrap out of src/main.ts into src/online/OnlineModeApplication.ts. main.ts now only detects `modo-online` and delegates startup; online session wiring, server modal, player list, lobby, host/guest handlers, and online UI overlays live in the online module.
- Verification passed after refactor: `npx tsc --noEmit`, targeted ESLint for `src/online/OnlineModeApplication.ts`, focused Vitest run for main initialization plus online runtime/enemy sync tests, and Playwright screenshot smoke against the local Vite app.
- Added a dedicated Project > Online tab. Moved online enable/spawn/link controls out of Visuals and added a development warning alert. Verification passed with typecheck, focused editor tests, targeted ESLint, and Playwright screenshots with the Online tab disabled/enabled.
- Updated Online project behavior: enabling Online adds a virtual Player 2 start object to the object catalog while renaming the regular marker to Player 1 start; disabling Online returns the catalog to the normal single player-start marker. Removed the old "Set P2 spawn here" button, generated links now use `online-mode=...`, and online runtime removes the top Explore button. Verification passed with typecheck, targeted ESLint, focused editor/main tests, and Playwright smoke for catalog, P2 placement, URL, and Explore removal.
- Online object catalog now places Player 1 start and Player 2 start at the beginning of the `All/Todos` list. Player 2 start uses the `villager-woman` NPC sprite, and online player rendering uses that same sprite for player index 1. Verification passed with typecheck, targeted ESLint, focused editor/renderer tests, and Playwright screenshot smoke.
- Enabling Online now automatically creates the Player 2 spawn beside Player 1's start position and renders Player 2 on the map immediately. Verification passed with typecheck, targeted ESLint, focused editor tests, the develop-web-game Playwright smoke client, and a directed Playwright screenshot showing P1/P2 side by side with the P2 label at `sala 0 (2, 1)`.

TODO:
- Manual two-client online playtest is still useful to validate PartyKit behavior end to end with Host and Guest tabs.
