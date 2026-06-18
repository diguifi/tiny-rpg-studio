# Plano de Ação — Performance Tiny RPG Studio

Baseado em [`PERFORMANCE_REPORT.md`](./PERFORMANCE_REPORT.md) (execução A — estresse headless/dev; execução B — jogo real headed em **build de produção**). O profiler mostrou que **render, IA e memória têm folga de 1–2 ordens de grandeza**; o custo perceptível ao usuário está no **boot, dominado por scripts de terceiros** e pelo **bundle único**. Este plano cobre **todos** os pontos levantados, do maior impacto ao polimento.

## 1. Mapa: problema relatado → ação → status

| Problema no relatório | Ação | Prioridade | Status |
|---|---|---|---|
| Boot dominado por Firebase + Google Analytics (`load` ~3,2–4,9 s, long tasks até 230 ms) — §7, §10.1 | **AP-1** | **P0** | ✅ **Feito** — `load` 3.244 → **493 ms** (§1c) |
| IA simula inimigos de **todas** as salas em solo (desperdício + redraws/sync à toa) — §6, §10.2 | **AP-7** | **P1** | ✅ **Feito** — escopado à sala do jogador (§1c) |
| Bundle JS único de ~618 kB (aviso do Vite, >500 kB) — §9 | **AP-8** | **P1** | ✅ **Feito** — inicial 618 → **406 kB**; editor/online em chunks (§1c) |
| Código morto `FirebaseGamesService` (reforça o boot Firebase) — §10.1 | **AP-6** | **P1** | ✅ **Feito** — removido |
| Métricas de rede/load medidas no Vite **dev** — §12 | **AP-2** | P1 | ✅ Feito |
| Camada de tiles domina o `draw()` (57–69%) — §5, §10.3 | **AP-3** | **P2** | ⬜ Futuro/condicional |
| `draw()` redundante no mesmo frame — §1b | **AP-4** | **P3** | ⬜ Opcional |
| Churn de GC / sawtooth +7 MB no gameplay — §8, §1b | **AP-5** | **P3** | ⬜ Monitorar |
| **(novo)** Init do app ~351 ms no boot (1º render/warmup de canvas + module-eval), exposto após AP-1 — §1c | **AP-9** | **P2** | ✅ Investigado — warmup mascarado pela tela de boot; sem refactor agora |

## 2. Roadmap em fases

**Fase 1 — ✅ CONCLUÍDA (implementada e medida, §1c).** `AP-1` + `AP-6` (tiraram Firebase/GA do boot) → `AP-8` (code-split do editor/online) → `AP-7` (escopar IA à sala). Resultado: **`load` 3,2 s → 0,49 s (−85%)**, bundle inicial −34%, IA não simula mais salas fora de cena. Checks verdes; delta anexado ao relatório.

**Fase 2 — Polimento condicional (sob demanda).** `AP-9` foi **investigado**: o custo de boot restante é warmup de canvas mascarado pela tela de boot — sem refactor agora (reabrir só se virar reclamação). Condicionalmente: `AP-3` (cache de tiles) se o canvas/densidade crescer; `AP-4` (coalescer `draw()`); `AP-5` (pooling de partículas) se o GC causar hitches.

**Dependências/ordem:** `AP-6` antes/junto de `AP-1` (remover o serviço morto evita reintroduzir Firebase no boot). `AP-2` já feito — **reusar** para medir o antes/depois de cada item. Cada item segue o *Definition of Done* (§final).

| # | Ação | Prioridade | Esforço | Impacto esperado |
|---|---|---|---|---|
| **AP-1** | Adiar Firebase + Google Analytics do boot | **P0** | Médio | **Alto** — `load` ~3,2–4,9 s → ~FCP; zera long tasks de boot |
| **AP-7** | Escopar a IA dos inimigos à sala ativa (solo) | **P1** | Pequeno | Médio — elimina ~88% do tick + redraws/sync à toa |
| **AP-8** | Code-split do editor e do multiplayer (carregar sob demanda) | **P1** | Médio | Médio-Alto — encolhe o bundle inicial do jogador (~618 kB) |
| **AP-6** | Remover código morto `FirebaseGamesService` | **P1** | Pequeno | Limpeza — reforça AP-1 |
| **AP-2** | Medir em build de produção — ✅ **feito** | P1 | Pequeno | Concluído |
| **AP-3** | Cache *offscreen* da camada de tiles | **P2** | Médio | Baixo hoje; alavanca futura |
| **AP-4** | Coalescer `draw()` por frame (dirty-flag + rAF) | **P3** | Pequeno | Baixo (micro) |
| **AP-5** | *Pooling* de partículas/floating text (GC) | **P3** | Pequeno | Baixo (monitorar) |

---

## AP-1 — Adiar Firebase e Analytics (maior ganho) · P0 · ✅ CONCLUÍDO (`load` 3.244 → 493 ms)

**Problema.** As 3 long tasks de boot (até 214 ms) e o `load` de 3,4–4,9 s vêm de Firebase + Google Analytics, carregados no caminho de boot.

**Causa raiz (precisa).**
- `index.html:180-188` — `gtag.js` (`<script async>`) + config GA inline.
- `index.html:752-795` — bloco `<script type="module">` que importa **eager** `firebase-app`, `firebase-analytics` e `firebase-firestore` da CDN gstatic, inicializa app/firestore/analytics e popula `window.TinyRPGFirebase*` **antes** de `main.ts`.
- **Quem realmente usa isso em runtime:** apenas `EditorShareService.trackShareUrl` (`src/editor/modules/EditorShareService.ts:63,70-82`) — rastreio de URL ao **gerar um share no editor** (ação rara e tardia) — e o analytics. O **Explore não usa Firebase**: lê de `jam-games.json` estático (`src/editor/modules/ExploreModal.ts:81`). Ou seja, **nada disso precisa estar no boot.**
- Os consumidores já são resilientes a Firebase ausente: `FirebaseShareTracker` re-`init()` sob demanda em `trackShareUrl` (`...FirebaseShareTracker.ts:125-130`) e degrada para no-op; `createShareTracker` retorna `null` se não houver config.

**Solução (passo a passo).**
1. **Criar `src/runtime/infra/share/FirebaseLoader.ts`** exportando `ensureFirebase(): Promise<boolean>`, **idempotente** (cacheia a promise): se `window.TinyRPGFirebaseDb` já existe, retorna `true`; senão faz `import()` dinâmico dos 3 módulos gstatic, `initializeApp` + `getFirestore`, e popula **os mesmos globais** (`TinyRPGFirebaseConfig`, `TinyRPGFirebaseDb`, `TinyRPGFirebaseFirestore`, `TinyRPGFirebaseCollection`, `TinyRPGFirebaseGamesCollection`). `getAnalytics` opcional, dentro de try/catch.
2. **Remover o bloco `<script type="module">` de Firebase** de `index.html:752-795`. O `firebaseConfig` passa a viver dentro do `FirebaseLoader.ts`.
3. **Disparar `ensureFirebase()` só na ação de share:** em `EditorShareService.generateShareableUrl` (`:63`), trocar `void this.trackShareUrl(url)` por `void ensureFirebase().then(() => this.trackShareUrl(url))` (e fazer `createShareTracker` ler a config já populada). Como é um clique do usuário, o `import()` dinâmico é invisível e sai do caminho de boot.
4. **Adiar o Google Analytics:** manter o stub síncrono `window.dataLayer`/`gtag()` em `index.html` (para enfileirar eventos), mas injetar o `<script src=googletagmanager.com/gtag/js>` via `requestIdleCallback` (fallback `setTimeout`) após o `load` — num pequeno `src/analytics/loadAnalytics.ts` chamado no fim do boot (`main.ts`), ou após o primeiro gesto.

**Esforço:** Médio (~½ dia). **Risco:** Baixo — consumidores degradam graciosamente; o Explore nem usa Firebase.

**Impacto esperado:** remove as 2–3 long tasks de boot; `load` cai de 3,4–4,9 s para perto do FCP (~0,15–0,37 s). Firebase/GA somem do top de `resources.slowest` no caminho crítico.

**Como verificar:**
- Re-rodar `npx playwright test performance-realplay --headed --workers=1` e comparar no novo `performance-report-realplay.json`: `longTasks.count` ≈ 0, `navigation.loadEventMs` baixo, `resources.slowest` sem Firebase/GA antes do FCP.
- Manual: gerar um share URL no editor → confirmar gravação no Firestore (console "Share URL tracked."); confirmar `page_view` no GA após idle.

---

## AP-2 — Medir contra build de produção · P1 · ✅ **CONCLUÍDO**

**Problema.** As métricas de **rede/carregamento** foram coletadas no Vite **dev** (módulos ES desempacotados → **166 requisições**; timing de load inflado). Render/IA/memória já eram representativos; rede/load **não**.

**O que foi feito.** `npm run build` → `npm run preview` (porta 4173) e o harness headed reexecutado contra o bundle de produção (Playwright reusa o servidor existente). Resultados em `perf-artifacts/performance-report-realplay.json` (prod) com o anterior preservado em `…-realplay-dev.json`.

**Resultado (dev → produção, ver §1b do relatório):**
- Requisições **166 → 15** (−91%); transferido **4.315 → 191 KB** (−96%).
- `draw()` **0,84 → 0,49 ms** (−42%); `render.tiles` −41%; `sim.enemyTick` −35%; frame p99 **12,3 → 6,5 ms**.
- **`load` permaneceu ~3,2 s**, ainda dominado por Firebase/GA → **confirma que o gargalo de boot é dos terceiros, não do dev server** (reforça AP-1).

**Próximo passo (opcional):** reexecutar este mesmo profiling de produção **depois** de AP-1 para quantificar o ganho de boot.

**Como reproduzir.** (Opcional, para automação) tornar o `webServer` do `playwright.config.ts` condicional a `PERF_TARGET=prod` (`npm run build && npm run preview -- --port 4173`).

---

## AP-6 — Remover código morto `FirebaseGamesService` · P1 · ✅ CONCLUÍDO

**Problema.** `src/runtime/infra/share/FirebaseGamesService.ts` não é importado por nenhum código de runtime (só por testes). O Explore usa `jam-games.json`. O serviço sugere falsamente que o Explore depende de Firestore e incentiva manter Firebase no boot.

**Solução.** Decidir entre: **(a)** remover o serviço + seus testes (recomendado — reduz superfície e reforça AP-1); ou **(b)** se houver intenção de voltar a um Explore via Firestore, documentar a decisão e mantê-lo atrás de `ensureFirebase()` (AP-1).

**Esforço:** Pequeno. **Risco:** Baixo. **Verificar:** `tsc`/`lint`/`test:run` verdes após a remoção.

---

## AP-7 — Escopar a IA dos inimigos à sala ativa (modo solo) · P1 · ✅ CONCLUÍDO

**Problema.** Em **solo**, a IA dos inimigos é simulada para **todas as 9 salas** a cada tick (700 ms), não só a sala onde o jogador está. Os ~40 inimigos das outras salas **vagam aleatoriamente** fora de cena, e cada movimento **força um `renderer.draw()`** da sala atual (que não mudou) + um `onEnemyStateChanged()`.

**Causa raiz (precisa).**
- `src/runtime/domain/state/StateEnemyManager.ts:61` — `getEnemies()` retorna `state.enemies` (o mundo inteiro, sem filtro de sala).
- `src/runtime/services/engine/EnemyManager.ts:265-296` — `tick()` percorre **todos** os inimigos. O único filtro por sala é `if (this.activeRooms !== null && !this.activeRooms.has(enemy.roomIndex)) continue;` (`:274`), mas `activeRooms` só é populado no **online-host** via `setActiveRooms` (`:142`). Em solo `activeRooms === null` → **nada é pulado**.
- `:293-296` — `if (moved) { this.renderer.draw(); this.onEnemyStateChanged?.(); }`: o vagar *off-screen* mantém `moved === true` quase sempre → redraw/sync a cada tick.
- **Não é bug de aggro:** `findNearestTarget` (`:155`) já filtra por `roomIndex`, então inimigos de outras salas não veem/perseguem/atacam o jogador — apenas desperdiçam CPU e disparam redraws.

**Evidência.** O profiler mediu `sim.enemyTick` processando os **42–48 inimigos do mundo** (~0,67–1,03 ms/tick), embora só ~5 estivessem na sala do jogador — ~88% do trabalho é *off-screen*. O custo cresce com o total de inimigos do mundo, não com os visíveis.

**Solução (passo a passo).**
1. **Definir as salas ativas também no solo.** No `EnemyManager.tick()`, antes do loop, computar a sala ativa a partir do jogador (e, no online, dos jogadores remotos) e usar o filtro já existente. Opção mínima: trocar a guarda da `:274` por `const activeRooms = this.activeRooms ?? new Set([player?.roomIndex])` e pular inimigos fora dela. Aplicar a mesma restrição em `evaluateVision` (`:594`, iterar só inimigos da sala ativa) para não avaliar visão fora de cena.
2. **Evitar redraw/sync por movimento off-screen.** Como o filtro já exclui inimigos fora da sala, `moved` passa a refletir só mudanças visíveis — o redraw em `:293-296` deixa de disparar à toa. (Garantir que `moved` só vire `true` para inimigos da sala ativa.)
3. **Decisão de design (mundo vivo?).** Se houver intenção de manter inimigos "vivos" fora de cena, **desacoplar** isso do redraw: simular sem chamar `renderer.draw()` para salas invisíveis. Recomendação: **não** simular fora de cena (consistente com o online-host, que já pula salas inativas).

**Esforço:** Pequeno (~1–2 h). **Risco:** Baixo — espelha o comportamento já validado do online-host; `findNearestTarget` já impede interação entre salas.

**Impacto esperado:** elimina ~88% do trabalho do tick na cena densa, remove os redraws/sync periódicos desnecessários e torna o custo da IA proporcional aos inimigos **visíveis**, não ao total do mundo (corrige o cliff de escalabilidade).

**Como verificar:**
- Re-rodar `performance-realplay --headed`: `sim.enemyTick` médio deve cair para refletir só os inimigos da sala atual; o nº de `draw()` por segundo em regime ocioso (parado numa sala) deve cair.
- Funcional: confirmar que, ao entrar numa sala, os inimigos reagem normalmente (visão/perseguição/combate) e que inimigos de outras salas não influenciam o jogador.
- `tsc`/`lint`/`test:run` verdes; rever testes de `EnemyManager` que dependam de movimento multi-sala (ajustar se assumirem simulação global).

---

## AP-8 — Code-split do editor e do multiplayer · P1 · ✅ CONCLUÍDO (inicial 618 → 406 kB)

**Problema.** O build de produção emite **um único bundle JS de ~618 kB** (gzip 159 kB) e o próprio Vite avisa: *"Some chunks are larger than 500 kB"* (§9 do relatório). Um jogador que abre apenas uma URL compartilhada precisa **baixar e parsear** todo o editor e todo o multiplayer sem nunca usá-los — peso no caminho de boot.

**Causa raiz (precisa).**
- `src/main.ts` importa **eager** `EditorManager` (`import { EditorManager } from './editor/EditorManager'`) e o instancia sempre que não é export mode (`editorManager = new EditorManager(gameEngine)`), mesmo para quem só vai jogar.
- `src/main.ts` importa **eager** `OnlineModeApplication`, usado só quando a URL tem `?online-mode=<guid>`.
- O `EditorManager` arrasta toda a árvore `editor/**` (muitos `Editor*Service`, modais e renderers); o online arrasta `partysocket`/`src/online/**`.

**Solução (passo a passo).**
1. **Editor sob demanda:** trocar o import estático por `import()` dinâmico, carregando `EditorManager` apenas quando a aba **Editor** é ativada pela primeira vez (no handler de `editor-tab-activated`/clique da aba). Manter a aba Game 100% funcional sem o chunk do editor.
2. **Online sob demanda:** em `initializeApplication`, quando `detectOnlineMode()` retorna um guid, fazer `import()` dinâmico de `OnlineModeApplication` (e o `src/online/**` vai junto no chunk). Caminho solo nunca baixa o multiplayer.
3. **(Opcional) `manualChunks`** em `vite.config.ts` para isolar dependências grandes (ex.: Firebase, se ainda não tratado por AP-1) e silenciar o aviso de chunk com intenção, não com `chunkSizeWarningLimit`.

**Esforço:** Médio (~½ dia, atenção à ordem de boot e ao `setTinyRpgApi`/`renderAll`). **Risco:** Médio — mexe no wiring de boot; cobrir com o E2E existente (`export.spec`, `dpad-mobile`) + o harness de profiling.

**Impacto esperado:** o bundle inicial do **jogador** encolhe (editor + online viram chunks separados, carregados só quando necessários), reduzindo download/parse no boot. Complementa AP-1 (menos JS de terceiros + menos JS próprio no caminho crítico).

**Como verificar:** `npm run build` — conferir múltiplos chunks e o chunk inicial menor; re-rodar `performance-realplay` em produção e comparar `resources` (transferido/parse) e `navigation`. Validar funcionalmente: abrir a aba Editor (carrega o chunk e funciona), entrar em `?online-mode=` (carrega o chunk online).

---

## AP-9 — Init do app no boot · P2 · ✅ INVESTIGADO (medido; não acionável com baixo risco agora)

**Problema.** Após a Fase 1, com o Firebase fora do boot, o maior custo passou a ser a **própria inicialização do app**: uma long task de ~351–406 ms no início (§1c).

**Medição (instrumentação `boot.*` adicionada — `src/main.ts` + `GameEngine`).**
- `boot.engineCtor` ≈ **187 ms**, dos quais **`boot.firstDraw` ≈ 180 ms** (1º `draw()` + intro); `boot.rendererCtor` 2 ms; subsistemas ~5 ms.
- `boot.loadShared` ≈ **11 ms** (importar o jogo da URL é barato).
- Restante da long task ≈ **165 ms** = avaliação dos módulos/definições estáticas no import.

**Causa raiz (precisa).** O `boot.firstDraw` **não** é JS de geração de sprites: `RendererSpriteFactory.mapPixels` monta os catálogos em < 1 ms e um `draw()` em regime é **0,5 ms**. Os ~180 ms são **warmup do canvas/GPU na primeira renderização** (primeiras operações de canvas + criação dos canvases de tile) — intrínseco do navegador e **mascarado pela tela de boot**.

**Decisão.** **Não implementar** um refactor agora: (a) o `load` já caiu para ~0,45 s (Fase 1); (b) os ~180 ms são warmup mascarado pela tela de boot (não percebido como "lento"); (c) reduzir os ~165 ms de module-eval exigiria *lazy-load* das definições estáticas (`TileDefinitions`/`EnemyDefinitions`/`NPCDefinitions`/`SpriteMatrixRegistry`) — risco em código central, retorno incerto. Fica **monitorado** via `boot.*` no profiler.

**Reabrir se:** o boot virar reclamação de usuários, ou o canvas/cena crescer a ponto do warmup pesar mais. Aí: avaliar (1) *lazy-load* das definições por grupo e (2) pré-aquecer o canvas com um draw mínimo enquanto a tela de boot está visível.

---

## AP-3 — Cache offscreen da camada de tiles · P2 (futuro/condicional)

**Problema.** `render.tiles` é 57–69% do `draw()` (`src/runtime/adapters/renderer/RendererTileRenderer.ts`), redesenhando 64 tiles × 64 px por frame. **Hoje é irrelevante** (0,55–0,82 ms), mas é o hot path se o canvas/densidade crescerem.

**Solução.** Renderizar o chão+overlay **estáticos** da sala atual uma vez para um `OffscreenCanvas`/buffer; por frame, fazer **blit** do buffer e redesenhar **apenas tiles animados** (ids 1/5/6). Invalidar o buffer em: troca de sala, edição de tile, troca de paleta. O avanço de frame de animação redesenha só os tiles animados sobre o blit.

**Esforço:** Médio. **Risco:** Médio (correção de invalidação de cache). **Quando:** só se `render.tiles` virar gargalo (canvas maior, mais salas visíveis).

**Como verificar:** harness — `render.tiles` médio cai; checar visualmente água/lava/grama animando.

---

## AP-4 — Coalescer `draw()` por frame (dirty-flag + rAF) · P3 (opcional)

**Problema.** Vários `draw()` podem ocorrer no mesmo frame (ex.: enemy tick + movimento do jogador). Barato hoje, mas redundante.

**Solução.** Introduzir `renderer.requestDraw()` que marca *dirty* e agenda **um único** `draw()` no próximo `requestAnimationFrame`; trocar chamadas diretas de `renderer.draw()` nos caminhos de alta frequência. Manter `draw()` síncrono onde há dependência imediata (ex.: `captureGameplayFrame`).

**Esforço:** Pequeno–Médio. **Risco:** Médio (ordem/sincronismo). **Verificar:** `render.frame.count` cai sem regressão visual.

---

## AP-5 — Reduzir churn de GC (sawtooth) · P3 (monitorar)

**Problema.** Memória sobe e volta (11,7 → 22,0 → 18,65 MB; +6,9 MB líquido em 41 s) — *sawtooth* normal de GC sob gameplay real, **não vazamento**.

**Solução.** *Pooling* de partículas e floating text (`RendererParticleSystem`, `RendererFloatingText`): reusar objetos em vez de alocar por evento, reduzindo a frequência de coleta.

**Esforço:** Pequeno–Médio. **Risco:** Baixo. **Quando:** se o GC vier a causar hitches perceptíveis. **Verificar:** harness — `memory.growthMB` e a amplitude do sawtooth menores.

---

## Definition of Done (para cada item)

1. `npx tsc --noEmit`, `npm run test:run` e `npm run lint` (zero warnings) **verdes** — conforme `CLAUDE.md`.
2. Re-rodar os dois harnesses (`performance-profile` e `performance-realplay --headed`) e **anexar o delta das métricas** ao `PERFORMANCE_REPORT.md` (antes/depois).
3. Validação funcional manual quando aplicável (share-tracking, Explore, animação de tiles).
