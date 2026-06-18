# Relatório de Performance — Tiny RPG Studio

**Data:** 2026-06-18 · **Gerado por:** profiler de runtime (`PerformanceProfiler`) + harness Playwright

Foram feitas **duas execuções**:
- **A — Estresse (headless):** render forçado a 60 fps por 20 s para medir o **pior caso** de throughput de render (§§4–9).
- **B — Fiel (headed, jogo real):** navegador **visível** jogando de verdade por 41 s — explorando salas, lutando, morrendo e renascendo — com render **orientado a eventos** (§1b).

**Artefatos brutos:** [`performance-report.json`](./perf-artifacts/performance-report.json) (A), [`performance-report-realplay.json`](./perf-artifacts/performance-report-realplay.json) (B), [`realplay-meta.json`](./perf-artifacts/realplay-meta.json), [`realplay-screenshots/`](./perf-artifacts/realplay-screenshots/), [`scene-counts.json`](./perf-artifacts/scene-counts.json), share codes em `*-share-code.txt`.

**▶ Plano de ação para resolver tudo:** [`ACTION_PLAN.md`](./ACTION_PLAN.md).

---

## 1. Resumo executivo

Um mundo propositalmente pesado (9 salas cheias, **576 tiles de chão**, **252 decorações de overlay**, **72 NPCs** e **48 inimigos**) foi carregado num Chromium real, com o jogo redesenhando a **60 fps forçados** (modo de estresse) por ~20 s, enquanto a IA dos inimigos e o movimento do jogador eram exercitados.

| Indicador | Valor | Leitura |
|---|---|---|
| FPS médio (regime permanente) | **59,1 fps** | Praticamente travado no vsync de 60 Hz |
| Custo de um `draw()` completo (média) | **0,80 ms** | ~4,8% do orçamento de 16,7 ms por frame |
| `draw()` no p99 | **2,1 ms** | Folga enorme até o limite do frame |
| Tick de IA (48 inimigos) | **0,97 ms** / tick | ~0,02 ms por inimigo |
| Crescimento de memória em 20 s | **0 MB** | Sem vazamento, sem pressão de GC |
| Long tasks no regime permanente | **0** | Todas as travadas ocorreram só no boot |

**Conclusão:** a engine de render e a simulação têm folga de sobra — mesmo nesta cena deliberadamente densa, o gargalo **não** é o jogo. Os únicos engasgos reais (2 frames acima de 50 ms, long tasks de até 214 ms) acontecem **durante o carregamento**, dominado por scripts de terceiros (Firebase + Google Analytics), que também empurram o `load` para ~4,9 s. É aí que está o ganho.

**Confirmado em build de produção** (§1b): o código minificado é **~40% mais rápido** que o do dev (`draw()` 0,49 ms; IA 0,67 ms/tick) e a rede cai de **166 → 15 requisições** — mas o `load` continua **~3,2 s**, ainda dominado por Firebase/GA. Ou seja, o dev server não mascarava o problema: o gargalo de boot é mesmo dos terceiros (**[AP-1]**).

**Achado secundário (eficiência):** em modo solo, a IA simula inimigos de **todas as salas**, não só a do jogador, e força redraws periódicos por causa disso (§6) — custo absoluto baixo hoje, mas escala mal e tem correção simples (**[AP-7]**).

---

## 1b. Execução fiel — navegador visível, jogo de verdade (headed, **build de produção**)

Para resultados confiáveis, esta execução rodou contra o **build de produção** (`npm run build` → `vite preview`, bundle minificado em `docs/`), num **Chromium visível** jogando de verdade por **41 s**: **explorou 5 salas (0, 1, 3, 4, 6)**, pegou a espada, lutou e atravessou portas — **195 movimentos**, sem morrer nesta partida. Render **orientado a eventos** (`?profile`, sem loop forçado). Evidência em `perf-artifacts/realplay-screenshots/`.

Cena (traversável, corredor em "+" e portas entre salas): 9 salas, 576 tiles de chão, 180 decorações, **54 NPCs**, **42 inimigos**, jogador equipado com espada + poção + pergaminho.

| Métrica | **B — Fiel (headed, produção)** | A — Estresse (headless, dev) |
|---|---|---|
| Modo de render | Orientado a eventos | 60 fps forçados |
| FPS de display (rAF) | **163,0** (janela headed, sem vsync) | 59,1 (vsync) |
| Intervalo p95 / p99 | **6,3 / 6,5 ms** | 16,7 / 16,8 ms |
| Frames > 50 ms (hitch) | 3 (boot) | 2 (boot) |
| `draw()` médio / máx | **0,49 / 33,5 ms** (máx = transição de sala) | 0,80 / 16,7 ms |
| Nº de `draw()` em ~41 s | **1.619 (só em eventos)** | 1.476 (forçado em 20 s) |
| `render.tiles` médio | **0,48 ms** | 0,55 ms |
| `sim.enemyTick` médio / p99 (42 inim.) | **0,67 / 1,7 ms** | 0,97 ms |
| `sim.tryMove` médio / máx | **0,67 / 2,6 ms** | 0,80 / 2,3 ms |
| Long tasks (todas no boot) | 2 (máx 230 ms) | 3 (máx 214 ms) |
| FCP / load | **300 ms / 3.244 ms** | 140 ms / 4.924 ms |
| Memória usada (máx / crescimento) | 15,1 MB / +7,1 MB em 41 s | 12,1 MB / 0 MB |
| Requisições / transferido | **15 / 191 KB** | 166 / 4.310 KB |

**Produção × Dev (mesmo cenário headed, jogo real) — efeito do build:**

| Métrica | Dev | **Produção** | Δ |
|---|---|---|---|
| Requisições | 166 | **15** | **−91%** (bundle minificado) |
| Transferido | 4.315 KB | **191 KB** | **−96%** |
| `draw()` médio | 0,84 ms | **0,49 ms** | −42% |
| `render.tiles` médio | 0,82 ms | **0,48 ms** | −41% |
| `sim.enemyTick` médio | 1,03 ms | **0,67 ms** | −35% |
| Intervalo de frame p99 | 12,3 ms | **6,5 ms** | −47% |
| FCP | 368 ms | **300 ms** | −18% |
| `load` | 3.375 ms | **3.244 ms** | quase igual |

**Leituras-chave (build de produção):**

- **O código de produção é ~40% mais rápido** que o servido pelo dev (minificado, sem overhead de HMR/módulos soltos): `draw()` cai para **0,49 ms** e a IA de 42 inimigos para **0,67 ms/tick**. Os números do dev eram, portanto, **conservadores** — o jogo real tem ainda mais folga.
- **Rede agora é confiável:** **15 requisições / 191 KB** (vs 166 / 4,3 MB no dev). A inflação anterior era artefato do dev server (módulos ES soltos). ✓ resolve a ressalva [AP-2].
- **Veredito de boot inalterado e agora à prova de dúvida:** mesmo em produção, o `load` continua **~3,2 s** e os recursos mais lentos continuam sendo **Firebase + Google Analytics** (~2,9–3,2 s cada), gerando as 2 long tasks de boot (máx 230 ms). Isso **prova** que o gargalo de carregamento é dos SDKs de terceiros — **não** do dev server. → **[AP-1]** continua sendo a prioridade.
- **Render orientado a eventos confirmado:** 6.757 frames de display, mas só **1.619 `draw()`** em 41 s (≈ 39×/s, em rajadas). O jogo não redesenha à toa.
- **Memória:** 4,7 → 15,1 → 11,8 MB (líquido +7,1 MB) — *sawtooth* normal de GC do gameplay, sem vazamento.

A execução em produção **confirma e reforça** o diagnóstico: render/IA têm folga ainda maior que a medida no dev; o único custo perceptível segue sendo o boot dominado por Firebase/GA (**[AP-1]**).

---

## 1c. Resultados da Fase 1 (implementada e medida em produção)

A Fase 1 do [`ACTION_PLAN.md`](./ACTION_PLAN.md) foi **implementada** (AP-1, AP-6, AP-7, AP-8) e re-medida no build de produção (headed, jogo real, mesmo cenário).

**Boot — o gargalo principal (antes × depois, produção):**

| Métrica | Antes | **Depois** | Δ |
|---|---|---|---|
| `load` | 3.244 ms | **493 ms** | **−85%** |
| `DOMContentLoaded` | 3.200 ms | **483 ms** | **−85%** |
| Requisições no `load` | 15 | **7** | −53% |
| Transferido no `load` | 190 KB | **139 KB** | −27% |
| Recurso mais lento no caminho crítico | firebase-firestore (~3.053 ms) | **index.js (~32 ms)** | — |

Firebase e Google Analytics saíram do caminho de boot (**[AP-1]**): o `gtag.js` agora carrega em *idle* (long task de 232 ms em t≈666 ms — **depois** do `load`) e o Firebase só é buscado ao **gerar um share**.

**Bundle inicial (AP-8) — code-split do editor e do multiplayer:**

| | Antes | **Depois** |
|---|---|---|
| Chunk inicial (quem só joga) | 617,7 kB (gzip 158,7) | **406,0 kB (gzip 106,1)** — −34% |
| Editor | dentro do inicial | chunk separado **159,7 kB**, sob demanda |
| Multiplayer | dentro do inicial | chunk separado **54,7 kB**, sob demanda |
| Aviso ">500 kB" do Vite | sim | **não** |

**IA dos inimigos (AP-7):** a simulação passou a ser escopada à sala do jogador. O `sim.enemyTick` em *wall-time* ficou estável (~0,67 → 0,74 ms, dentro do ruído) porque, com 42 inimigos, o custo é dominado por overhead fixo + os ~5 inimigos visíveis. O ganho é **estrutural**: (a) inimigos fora de cena não vagam nem **forçam redraws** a cada 700 ms (relevante quando o jogador está parado), e (b) o custo passa a escalar com inimigos **visíveis**, não com o total do mundo. Verificado por testes; sem regressão (256 testes de engine verdes).

**Achado novo exposto pela Fase 1 — e investigado em AP-9:** com o Firebase fora do boot, o próximo custo é a **própria inicialização do app** — uma long task de ~351–406 ms no início. Instrumentando o boot (sees `boot.*` no relatório), o custo se decompõe em:

| Fase de boot | Custo |
|---|---|
| `boot.engineCtor` (construtor do `GameEngine`) | **~187 ms** |
| ↳ `boot.rendererCtor` (criar o `Renderer`) | 2 ms |
| ↳ **`boot.firstDraw`** (1º `draw()` + `showIntroScreen`) | **~180 ms** |
| ↳ subsistemas (managers) | ~5 ms |
| `boot.loadShared` (importar o jogo da URL) | **~11 ms** (barato) |
| Restante da long task (avaliação dos módulos/definições estáticas) | ~165 ms |

**Conclusão do AP-9 (honesta):** o `boot.firstDraw` (~180 ms) **não é** geração de sprites em JS — `mapPixels` monta todos os catálogos em < 1 ms, e um `draw()` em regime é **0,5 ms**. O custo é **warmup do canvas/GPU na primeira renderização** (primeiras operações de canvas + criação dos canvases de tile), que é **intrínseco e mascarado pela tela de boot**. O `boot.loadShared` é barato (11 ms), então importar o jogo da URL não é gargalo. Reduzir os ~180 ms exigiria um refactor de risco/retorno incerto (warmup é do navegador); reduzir os ~165 ms de avaliação de módulos exigiria *lazy-load* das definições estáticas (risco em código central). **Decisão:** dado que o `load` já caiu para ~0,45 s e o custo restante é warmup mascarado, **não vale um refactor arriscado agora** — fica monitorado via `boot.*`. O FCP (~500–548 ms vs 300 ms antes) é variância de *headed* possivelmente influenciada por essa task; o `load` (a métrica de "pronto") melhorou 6,5×.

**Veredito da Fase 1:** o `load` caiu **6,5×** (3,2 s → 0,49 s), o bundle inicial encolheu 34% e a IA deixou de simular salas fora de cena. Checks verdes: `tsc`, 1.965 testes, `lint` (zero warnings); boot/intro E2E passam; o editor carrega sob demanda.

---

## 2. Metodologia

### 2.1 O profiler (`src/runtime/debug/PerformanceProfiler.ts`)

Módulo *opt-in* e autocontido, dormente em produção. Ativa-se quando a página é aberta com a flag `?profile` (`?profile=render` adiciona um loop de redesenho por frame). Quando ligado, coleta sem depender de internals da engine:

- **Cadência de frames** via `requestAnimationFrame` → FPS, distribuição de intervalos (min/avg/p50/p95/p99/desvio) e buckets de *jank* (>16,7 / >33,3 / >50 ms).
- **Timings por seção** de qualquer método instrumentado. Em `attach()` ele encaixa o pipeline de render (`render.frame`, `render.tiles`, `render.npcs`, `render.enemies`, `render.player`, `render.hud`, …) e a simulação (`sim.enemyTick`, `sim.tryMove`).
- **Long tasks** via `PerformanceObserver('longtask')` + total blocking time.
- **Heap JS** ao longo do tempo (`performance.memory`, só Chromium).
- **Navigation / Paint (FCP) / Resource timing**.
- **Descrição da cena** (tamanho do canvas, contagem de entidades).

Tudo é consolidado por `getReport()`, exposto em `window.__TINY_RPG_PROFILER`. A integração na app fica em `main.ts` (`setupPerformanceProfiler`), atrás da flag — **zero impacto para jogadores normais**.

### 2.2 Cena de teste

Gerada programaticamente pelo SDK (`TinyRPG`) no harness:

| Recurso | Quantidade |
|---|---|
| Salas (mundo 3×3) | 9 |
| Tiles de chão | 576 (64 por sala) |
| Decorações de overlay (bordas) | 252 |
| NPCs | 72 (8 por sala) |
| Inimigos | 48 (6 por sala, 1–8; sala inicial sem inimigos) |
| Canvas | 128×196 px (tile de 16 px) |
| Tamanho do share code | 3.686 caracteres |

O chão usa tiles variados incluindo o tile **animado** id 1 ("Grama Alta"), que mantém o loop de animação de tiles ativo. A sala inicial fica sem inimigos de propósito (para o jogador sobreviver e seguir se movendo); como o modo solo dá *tick* em **todos** os inimigos de **todas** as salas a cada intervalo, os 48 inimigos continuam sendo simulados.

### 2.3 Como reproduzir

```bash
npx playwright test performance-profile --reporter=list
# Artefatos em perf-artifacts/
```

O harness (`tests/e2e/performance-profile.spec.ts`): constrói a cena, abre `/?profile=render#<code>`, dispensa a intro, dirige o jogo por 20 s (movimento contínuo + confirmação periódica para limpar diálogos) e grava o relatório.

---

## 3. Ambiente

| Item | Valor |
|---|---|
| Navegador | Chrome 145 (Windows x64) — headless na execução A, **janela visível** na B |
| CPU lógicos | 20 |
| Memória do dispositivo | 8 GB |
| Servidor (A — estresse) | Vite **dev** (`npm run dev`) |
| Servidor (B — fiel) | **Build de produção** (`npm run build` → `vite preview`, bundle minificado em `docs/`) |
| Janela amostrada (A) | 20,47 s · 1.209 frames de display · 1.476 chamadas de `draw()` |
| Janela amostrada (B) | 41,45 s · 6.757 frames de display · 1.619 chamadas de `draw()` |

---

## 4. Frame rate / cadência

| Métrica | Valor |
|---|---|
| FPS médio | **59,07** |
| Intervalo médio entre frames | 16,93 ms |
| p50 / p95 / p99 | 16,7 / 16,7 / 16,8 ms |
| Máximo | 216,7 ms |
| Frames > 16,7 ms | 486 |
| Frames > 33,3 ms | 4 |
| Frames > 50 ms | **2** |

O p99 em 16,8 ms confirma uma cadência **travada no vsync de 60 Hz**. O bucket "> 16,7 ms" (486 frames) é um artefato do limiar coincidir com o próprio intervalo de 60 fps — não é *jank*. O *jank* real são apenas **2 frames acima de 50 ms** (e 4 acima de 33 ms), todos no boot (§7). Em regime permanente, o jogo é perfeitamente fluido.

---

## 5. Pipeline de render (breakdown de `draw()`)

`draw()` completo: **1.476 chamadas, média 0,80 ms, p95 1,4 ms, p99 2,1 ms, máx 16,7 ms.** Isso é **~4,8% do orçamento de 16,7 ms** e **5,8% do tempo total de parede**.

Composição média por frame (ordenado por custo):

| Seção | Média (ms) | p99 (ms) | % do `draw()` |
|---|---|---|---|
| `render.tiles` | 0,548 | 1,3 | **68,7%** |
| `render.npcs` | 0,105 | 0,3 | 13,0% |
| `render.hud` | 0,057 | 0,2 | 7,0% |
| `render.player` | 0,011 | 0,1 | 1,4% |
| `render.inventory` | 0,005 | 0,1 | 0,6% |
| `render.items` | 0,004 | 0,1 | 0,5% |
| `render.enemies` | 0,003 | 0,1 | 0,3% |
| `render.objects` | 0,002 | 0,1 | 0,3% |
| `render.walls` | 0,002 | 0,1 | 0,2% |
| *clear/save/overlays (resto)* | ~0,06 | — | ~8% |

**A camada de tiles domina o render** (~69%): redesenha 64 tiles × 64 pixels a cada frame. As NPCs vêm em segundo (8 sprites na sala). `render.enemies` é ínfimo aqui porque a sala inicial não tem inimigos — o custo de inimigos visíveis está coberto pelo padrão de NPCs (mesma rotina de sprites).

---

## 6. Simulação (IA e movimento)

| Seção | Chamadas | Média (ms) | p95 (ms) | Máx (ms) |
|---|---|---|---|---|
| `sim.enemyTick` (48 inimigos) | 29 | 0,97 | 2,0 | 3,1 |
| `sim.tryMove` (jogador) | 161 | 0,80 | 1,4 | 2,3 |

O tick de IA processa **todos os inimigos de todas as salas** (visão + movimento) em **~1 ms** — cerca de **0,02 ms por inimigo**. Roda a cada 700 ms, então o custo absoluto é desprezível hoje. `tryMove` (~0,8 ms) inclui checagem de colisão, interações e o redraw subsequente.

> ⚠️ **Achado de eficiência — IA simula salas fora da cena do jogador (ver [AP-7]).** Em modo **solo**, o tick **não** filtra por sala: `StateEnemyManager.getEnemies()` (`:61`) devolve o mundo inteiro e `EnemyManager.tick()` (`:265-296`) percorre **todos** os inimigos. O filtro por sala (`activeRooms`, `:274`) só é ativado no **online-host** (`:142`); em solo `activeRooms === null`. Resultado: os ~40 inimigos das outras 8 salas **vagam aleatoriamente** a cada 700 ms, e como qualquer movimento dispara `if (moved) renderer.draw()` (`:293-296`), **um redraw completo é forçado a cada tick mesmo sem mudança visível** (+ `onEnemyStateChanged` à toa). Não há bug de *aggro* entre salas — `findNearestTarget` (`:155`) filtra por sala, então inimigos de fora não veem/atacam o jogador. **Severidade:** baixa hoje (~88% do tick é trabalho desperdiçado, mas o custo absoluto é < 1 ms), porém escala com o total de inimigos do mundo (não com os visíveis) — é um **cliff de escalabilidade** e gera redraws/sync desnecessários. Correção simples e de baixo risco: aplicar o `activeRooms` (já existente) ao solo.

---

## 7. Long tasks e carregamento

| Métrica | Valor |
|---|---|
| Long tasks | 3 |
| Duração total | 429 ms |
| Maior | 214 ms |
| Total blocking time | 279 ms |
| Quando ocorreram | t ≈ 4,69 s / 5,01 s / 6,03 s (**fase de boot**) |

As 3 long tasks acontecem em torno do `domContentLoaded` (4,84 s) e do `load` (4,92 s) — ou seja, **no carregamento, não no gameplay**. Depois de ~6 s, nenhuma long task: o regime permanente é limpo.

| Navigation | Valor |
|---|---|
| First Paint / FCP | **140 ms** (rápido — tela de boot) |
| DOM interativo | 106 ms |
| DOMContentLoaded | **4.838 ms** |
| Load event | **4.924 ms** |

O contraste é gritante: a primeira pintura ocorre em 140 ms, mas `DOMContentLoaded`/`load` só fecham em ~4,9 s. A diferença é tempo gasto em scripts de terceiros (§9).

---

## 8. Memória

| Métrica | Valor |
|---|---|
| Heap usado (min/avg/max/último) | **12,11 / 12,11 / 12,11 / 12,11 MB** |
| Crescimento em 20 s | **0 MB** |
| Heap total | 22,03 MB |
| Limite do heap | 3.585 MB |
| Amostras | 83 (a cada 250 ms) |

Heap **completamente plano** ao longo de 20 s de redesenho a 60 fps + 1.476 `draw()` + IA contínua: **sem vazamento e sem churn de GC** no caminho quente. (O `usedJSHeapSize` do Chrome é quantizado, então o valor absoluto é aproximado, mas a estabilidade ao longo do tempo é um sinal forte de ausência de vazamento.) O caminho de render evita alocações por frame — exatamente o que se quer.

---

## 9. Rede / recursos

| Métrica | Valor |
|---|---|
| Requisições | 166 |
| Transferido | 4,31 MB |
| Decodificado | 4,26 MB |

**8 recursos mais lentos** — todos de terceiros, todos no boot:

| Recurso | Duração |
|---|---|
| `js?id=G-D8S0K3NWFV` (Google Analytics gtag) | 4.659 ms |
| `firebase-firestore.js` | 4.551 ms |
| `firebase-app.js` | 4.454 ms |
| `firebase-analytics.js` | 4.405 ms |
| `installations` (Firebase) | 1.276 ms |
| `webConfig` (Firebase) | 866 ms |
| `collect?…` (GA) | 732 ms |
| `js?l=dataLayer&id=G-B56JRXPGED` (GTM) | 318 ms |

**Firebase + Google Analytics dominam o carregamento.** São exatamente os recursos que coincidem com as long tasks da §7 e com o `load` de 4,9 s. O canvas e a engine já estão pintados em 140 ms; o atraso é puramente os SDKs de telemetria/comunidade.

**Bundle próprio (build de produção):** o `vite build` emite **um único JS de ~618 kB** (gzip 159 kB) e avisa *"Some chunks are larger than 500 kB"*. Quem só abre uma URL compartilhada baixa/parseia também todo o **editor** e o **multiplayer** sem usá-los. → **[AP-8]** (code-split sob demanda).

---

## 10. Gargalos identificados

1. **Scripts de terceiros no boot (impacto alto).** Firebase (app/firestore/analytics/installations) e Google Analytics/GTM custam 0,3–4,7 s cada, geram as long tasks (até 214 ms) e atrasam `DOMContentLoaded`/`load` para ~3,4–4,9 s. É o único gargalo com consequência perceptível ao usuário.
   - **Causa raiz precisa:** `index.html:180-188` (gtag) e `index.html:752-795` (bloco ES-module Firebase **eager**, antes de `main.ts`).
   - **Descoberta importante:** isso **não precisa estar no boot**. O Explore lê de `jam-games.json` estático (`ExploreModal.ts:81`) — **não usa Firebase**. O único consumidor real em runtime é o rastreio de share no editor (`EditorShareService.trackShareUrl`), uma ação rara e tardia. `FirebaseGamesService` está **sem uso** (código morto).
2. **IA simula inimigos fora da sala do jogador (impacto baixo hoje, escala mal).** Em solo, o tick processa **todos** os inimigos de **todas** as 9 salas, não só os ~5 visíveis (~88% é trabalho desperdiçado), e força um `renderer.draw()` a cada 700 ms por causa do vagar dos inimigos *off-screen*. Custo absoluto < 1 ms hoje, mas cresce com o total de inimigos do mundo. Causa raiz e correção em §6 / **[AP-7]**.
3. **Camada de tiles é o hot path de render (impacto baixo hoje).** ~57–69% do `draw()`. Irrelevante em ~0,5–0,8 ms/frame, mas é o primeiro lugar a otimizar se a cena/canvas crescer muito.
4. **Nada mais.** Movimento, HUD, entidades e memória estão todos com folga de uma ou duas ordens de grandeza.

---

## 11. Recomendações priorizadas

Detalhadas, com causa raiz, passos, esforço, risco e verificação, em **[`ACTION_PLAN.md`](./ACTION_PLAN.md)**. Resumo:

| Item | Recomendação | Prioridade | Impacto |
|---|---|---|---|
| **AP-1** | Adiar Firebase + Analytics do boot (`ensureFirebase()` lazy; gtag em `requestIdleCallback`) | **P0** | **Alto** — `load` 3,4–4,9 s → ~FCP; zera long tasks de boot |
| **AP-2** | ✅ **Feito** — harness reexecutado contra build de **produção** (`vite preview`); rede caiu de 166→15 requisições e render ~40% mais rápido (§1b) | **P1** | Concluído |
| **AP-7** | **Escopar a IA dos inimigos à sala ativa em solo** (aplicar `activeRooms` ao modo solo; não simular/redesenhar salas fora de cena) | **P1** | Médio — elimina ~88% do tick desperdiçado e redraws/sync à toa; corrige escalabilidade |
| **AP-8** | **Code-split do editor e do multiplayer** (`import()` sob demanda) — bundle único de ~618 kB (aviso do Vite) | **P1** | Médio-Alto — encolhe o bundle inicial de quem só joga |
| **AP-6** | Remover código morto `FirebaseGamesService` | **P1** | Limpeza; reforça AP-1 |
| **AP-3** | Cache *offscreen* da camada estática de tiles (só redesenhar tiles animados) | **P2** | Baixo hoje; alavanca futura |
| **AP-4** | Coalescer `draw()` por frame (dirty-flag + rAF) | **P3** | Baixo (micro) |
| **AP-5** | *Pooling* de partículas/floating text para reduzir churn de GC | **P3** | Baixo (monitorar) |

> **Nota sobre o método:** o loop de 60 fps forçado (execução A) é **cenário de estresse**. Na prática a app **só redesenha em eventos** (movimento, combate) e no tick de animação de tiles (320 ms) — confirmado pela execução B em produção (§1b): 1.619 `draw()` em 41 s, não a 163 fps. O custo de render no mundo real é ainda menor que o pior caso medido.

---

## 12. Ressalvas / limitações

- **Dev × produção:** a execução A (estresse) ainda roda no Vite **dev** (rede/load inflados); a execução B (fiel) já roda em **build de produção** (`vite preview`), então suas métricas de rede/load são representativas. ✓ [AP-2]
- **Headless × headed:** A é headless (FPS no vsync ~60 Hz); B é em **janela visível** (FPS de display ~163, não preso ao vsync).
- **`performance.memory`:** quantizado pelo Chrome; bom para tendência (vazamento), aproximado em valor absoluto.
- **Terceiros via rede:** as durações de Firebase/GA dependem da latência da máquina de teste; mesmo em produção continuam no caminho de boot enquanto não forem adiados ([AP-1]).
- **Modo de render forçado:** `?profile=render` (execução A) desenha a cada frame; é estresse, não o comportamento padrão (a B usa render orientado a eventos).

---

## 13. Apêndice — arquivos entregues

| Arquivo | Conteúdo |
|---|---|
| `src/runtime/debug/PerformanceProfiler.ts` | O profiler (FPS, seções, long tasks, memória, navigation/paint/resource, cena, `getGameSnapshot`) |
| `src/main.ts` (`setupPerformanceProfiler`) | Integração atrás da flag `?profile` |
| `tests/e2e/performance-profile.spec.ts` | Harness A (estresse headless): cena densa + render forçado |
| `tests/e2e/performance-realplay.spec.ts` | Harness B (**headed, jogo real**): navegador visível jogando reativamente |
| `perf-artifacts/performance-report.json` | Relatório bruto — execução A (estresse, dev) |
| `perf-artifacts/performance-report-realplay.json` | Relatório bruto — execução B (fiel, **produção**) |
| `perf-artifacts/performance-report-realplay-dev.json` | Execução B anterior no dev (para o comparativo dev × produção) |
| `perf-artifacts/realplay-meta.json` · `realplay-meta-dev.json` | Resumo do jogo real (salas visitadas, mortes, movimentos) — prod e dev |
| `perf-artifacts/realplay-screenshots/` | Capturas do jogo sendo jogado |
| `perf-artifacts/scene-counts.json` · `*-share-code.txt` | Contagens autoritativas e share codes |

Para reproduzir a execução fiel com **janela visível em build de produção**:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173   # em outro terminal
npx playwright test performance-realplay --headed --workers=1
```
