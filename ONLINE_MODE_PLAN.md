# Plano: Modo Online (multiplayer em tempo real)

**Status:** Fases 0–9 implementadas. Fase 10 (deploy + testes manuais) pendente.
**Última atualização:** 2026-06-03

---

## Visão Geral

Adicionar suporte a partidas online com estado de mundo compartilhado.
O criador do jogo ativa a flag `online`, define a posição inicial de cada jogador
adicional, publica e compartilha o link. Quem abrir o link com `?modo-online=<guid>`
digita seu nome e entra na partida.

**Capacidade atual:** 2 jogadores
**Capacidade futura:** N jogadores (arquitetura preparada desde o início)

---

## Constraint: Tudo Free

| Serviço        | Plano free                                         | Por que escolhido                        |
|----------------|----------------------------------------------------|------------------------------------------|
| **PartyKit**   | Individual: até 10 projetos, storage limpo/24h     | Feito para multiplayer, Cloudflare-based |
| **Vercel**     | Hobby: deploys ilimitados (uso pessoal/não comercial) | Já em uso                             |

**PartyKit** é o backend de WebSocket. Roda na infraestrutura do Cloudflare Workers,
tem SDK pequeno (`partysocket`), o servidor da sala fecha sozinho quando vazia.
O plano Individual é gratuito e inclui até 10 projetos vivos; storage é limpo a cada 24h
(sem impacto aqui, pois o estado do jogo fica no Host, não no servidor PartyKit).

> Alternativas free descartadas:
> - Supabase Realtime: sem lógica server-side customizada (só pub/sub)
> - Ably/Pusher: free tier com limites baixos de conexões simultâneas
> - Railway/Render: precisa manter processo ativo (não fecha sozinho)

---

## Decisões de Design (respostas definitivas)

| Questão                        | Decisão                                                                                  |
|--------------------------------|------------------------------------------------------------------------------------------|
| Salas diferentes               | Cada jogador pode estar em salas diferentes                                              |
| Diálogos                       | Independentes por jogador — sem interferência. Variáveis alteradas são globais; itens recebidos são locais |
| Morte do jogador               | Respawn automático após 5s no spawn inicial; contagem regressiva                         |
| Número de jogadores            | Máx 2 hoje, arquitetura suporta N desde o início                                         |
| Segurança da sala              | GUID por sessão (novo a cada "Iniciar Servidor") é suficiente                            |
| Combate simultâneo no inimigo  | Ambos podem atacar; inimigo contra-ataca o jogador **mais próximo**                      |
| Itens coletados                | Exclusivo de quem pegou                                                                  |
| Host desconecta                | Guest assume o Host automaticamente (sem interrupção)                                    |
| Estado ao entrar               | Host envia snapshot completo do mundo para o Guest na entrada                            |
| Salas sem jogadores            | Inimigos ficam pausados; retomam quando alguém entra                                     |
| Sprite do P2                   | Mesmo sprite do P1 com tint de cor diferente (ex: azul) — sem config extra               |
| GUID da sala                   | Novo a cada clique em "Iniciar Servidor"; link anterior não funciona mais                |
| Definição do jogo no link      | GUID vai como query param, jogo vai no hash (como hoje): `?modo-online=<GUID>#<shareCode>` |
| Solo mode com online ativo     | Funciona normalmente abrindo sem `?modo-online=` na URL                                  |
| Lobby / espera                 | P1 espera no lobby com botão "Jogar sozinho" disponível imediatamente                    |
| Timeout do lobby               | Sem timeout automático — P1 decide quando desistir                                       |
| Reconexão rápida               | Cliente gera `sessionToken` (UUID) na primeira visita e salva em sessionStorage; servidor mapeia token → role com janela de graça de ~10s |
| Câmera ao morrer               | Segue automaticamente o jogador vivo mais próximo; sem troca manual                      |
| Sons remotos                   | Cada jogador ouve apenas os sons da sala em que está                                     |
| Variáveis via NPC              | Global — todas as 16 variáveis são sempre compartilhadas, independente da origem         |
| Fim de jogo                    | Termina para todos simultaneamente; todos veem a mesma tela de vitória                   |

---

## Arquitetura

### Modelo de Autoridade: Host Autoritativo

- O primeiro jogador a entrar é o **Host**
- O Host executa a simulação completa (inimigos, objetos, variáveis)
- O Host envia diffs de estado para o servidor a cada sync tick
- Demais jogadores (**Guests**) enviam apenas input e recebem diffs
- Há uma única fonte da verdade: evita conflito de estado

### Backend (PartyKit)

Cada partida é uma **Party** isolada identificada pelo GUID.
O servidor faz relay de mensagens e mantém lista de jogadores.
Quando o último jogador desconecta, a Party encerra automaticamente.

```
Jogador 1 (Host) ──────► PartyKit Server ◄────── Jogador 2 (Guest)
    │                          │                        │
    │ envia: world-state-diff  │ relay para todos       │ envia: player-input
    │ envia: player-position   │                        │ recebe: world-state-diff
    │ recebe: player-input     │                        │ recebe: player-positions
```

### Separação de Código

Todo código online fica em `src/online/` e `partykit/`. A engine existente precisa de
alterações pontuais (GameEngine, CombatManager, RendererEntityRenderer), feitas via
adaptadores e interfaces bem definidas para manter o acoplamento mínimo e reversível.

```
src/online/
├── client/
│   ├── OnlineManager.ts          # Orquestrador principal, ponto de entrada
│   ├── OnlineClient.ts           # Conexão WebSocket + protocolo de mensagens
│   ├── OnlineStateSync.ts        # Aplica diffs recebidos no GameState (Guest)
│   ├── OnlineStateBroadcaster.ts # Serializa e envia diffs (Host)
│   ├── OnlineInputRelay.ts       # Envia input do Guest para o servidor
│   └── OnlineRoomTracker.ts      # Rastreia salas ocupadas, controla quais simular (Host)
├── ui/
│   ├── PlayerNameModal.ts        # Modal de entrada de nome
│   ├── LobbyScreen.ts            # Tela de lobby aguardando jogadores
│   ├── PlayerList.ts             # Lista de jogadores abaixo do canvas
│   └── WaitingScreen.ts          # Tela de espera para jogador morto (contagem regressiva)
├── shared/
│   └── protocol.ts               # Tipos de mensagens (Client ↔ Server)
└── index.ts                      # Re-exports públicos

partykit/
└── src/
    └── party.ts                  # Servidor da sala (roda na Cloudflare)
```

---

## Protocolo de Mensagens

```typescript
// src/online/shared/protocol.ts

type MessageType =
  // Ciclo de vida
  | 'player-join'          // Client → Server: { name, sessionToken } — sessionToken gerado uma vez e salvo em sessionStorage
  | 'player-leave'         // Server → Clients: { playerId }
  | 'player-list'          // Server → Client: { players: PlayerInfo[] }
  | 'server-closed'        // Server → Clients: sala encerrada
  | 'role-changed'         // Server → Client: { newRole: 'host'|'guest'|'spectator' }
  | 'host-left'            // Server → Clients: host saiu, novo host sendo promovido
  | 'game-start'           // Server → Clients: todos conectaram, jogo pode iniciar
  | 'game-over'            // Host → Server → Clients: condição de vitória atingida
  | 'lobby-cancelled'     // Host → Server: P1 escolheu jogar sozinho — Party deve recusar novas conexões

  // Sincronização inicial (Host → novo jogador ao entrar)
  | 'full-state-snapshot'  // estado completo: inimigos, objetos, variáveis, posições

  // Estado do mundo (Host → Server → Guests)
  | 'world-state-diff'     // diff de inimigos, objetos, variáveis

  // Posições dos jogadores (todos → Server → todos)
  | 'player-position'      // { playerId, room, x, y, facing, animFrame, hp, maxHp }

  // Input (Guests → Server → Host)
  | 'player-input'         // { playerId, keys: string[], action? }

  // Eventos discretos (Host → Server → Guests)
  | 'enemy-died'           // { enemyId, roomId }
  | 'item-picked'          // { itemId, roomId, byPlayerId }
  | 'object-triggered'     // { objectId, roomId, newState }
  | 'variable-changed'     // { variableIndex, newValue } — qualquer origem, sempre global
  | 'player-died'          // { playerId } — entra em contagem regressiva
  | 'player-respawned'     // { playerId, room, x, y }

type WorldStateDiff = {
  tick: number
  enemies?: Record<string, EnemyNetState>   // apenas os que mudaram
  variables?: Record<number, number>        // apenas as que mudaram
}

type PlayerInfo = {
  id: string
  name: string
  sessionToken: string          // UUID gerado no cliente, salvo em sessionStorage — usado para reconexão
  role: 'host' | 'guest' | 'spectator'
  room: string
  x: number
  y: number
  hp: number
  maxHp: number
  alive: boolean
}
```

---

## Sincronização de Estado

### O que é compartilhado entre todos

| Elemento              | Compartilhado | Regra                                                   |
|-----------------------|:-------------:|---------------------------------------------------------|
| Posição dos inimigos  | ✅            | Host é autoritativo                                     |
| HP dos inimigos       | ✅            | Ambos atacam, dano é acumulado no Host                  |
| Morte de inimigo      | ✅            | Evento discreto `enemy-died` enviado pelo Host          |
| Alavancas / objetos   | ✅            | Host é autoridade: valida "primeiro a chegar", aplica efeito, emite `object-triggered`; Guests aplicam apenas o efeito visual/estado (`object.collected = true`), nunca o efeito de gameplay |
| Variáveis do jogo     | ✅            | Todas as 16 sempre compartilhadas — qualquer origem (NPC, objeto, combate) |
| Posição dos jogadores | ✅            | Cada jogador envia a própria posição, todos recebem     |
| Transições de sala    | ❌            | Independente — cada jogador está onde quiser            |
| Diálogos / NPCs       | ❌ / ✅       | Independente — mas variáveis alteradas via NPC são globais; itens via NPC são locais |
| HP do jogador         | ❌ (local) / ✅ (status) | HP é calculado localmente; `hp` e `maxHp` são publicados no `player-position` apenas para exibição na PlayerList — não são autoritativos |
| Itens coletados       | ❌ / ✅       | Efeitos (HP, XP, chave) são locais para quem pegou; `item-picked` faz Guests marcarem `item.collected=true` (some do mapa) sem aplicar efeitos |
| Inimigos em salas vazias | ❌ (pausado) | Simulação pausada; retoma quando um jogador entra na sala             |

### Controle de salas ativas (Host)

O Host precisa saber quais salas contêm jogadores para decidir o que simular.

```
Sempre que um jogador envia `player-position` com um roomId diferente do anterior:
  → Host atualiza o set de "salas ocupadas"
  → Se nova sala não estava no set: retoma simulação de inimigos daquela sala
  → Se sala antiga ficou vazia (nenhum jogador): pausa simulação daquela sala

Set de salas ocupadas = union das salas de todos os jogadores ativos
Host só roda EnemyManager.tick() para inimigos em salas do set
```

Isso garante que o Host simula exatamente as salas necessárias — nem mais, nem menos.

### Combate simultâneo no mesmo inimigo

```
P1 ataca inimigo X → Host processa localmente (CombatManager existente)
P2 ataca inimigo X → Host recebe player-input 'attack' com { enemyId }
                   → Host executa lógica de combate com P2 como "jogador virtual"
                   → aplica dano, envia diff de HP via world-state-diff
Inimigo X decide contra-atacar → Host compara distância de todos os jogadores ativos na sala
                                → ataca o mais próximo (P1 ou P2)
                                → se alvo for P2: Host envia 'player-took-damage' { playerId, damage }
                                → Guest recebe o evento e aplica dano localmente
Inimigo X só pode estar em combate com um jogador por vez (combat state machine existente)
```

> **Mudança real no EnemyManager:** hoje `EnemyManager.tick()` chama `this.gameState.getPlayer()`
> (hardcoded para o jogador local). No modo online, o Host precisa iterar sobre todos os jogadores
> ativos na sala — P1 local + P2 virtual mantido pelo `OnlineManager`. Isso requer que
> `EnemyManager` aceite uma lista de players, não apenas um. É uma mudança estrutural, não trivial.

### Morte do jogador

```
Jogador morre → evento `player-died` enviado para todos
Jogador morto → WaitingScreen sobrepõe canvas com contagem regressiva de 5s
Câmera → passa automaticamente para o jogador vivo mais próximo
Outros jogadores → continuam normalmente, veem "nome [morto]" na lista
Jogador morto → não pode mover, interagir, ou atacar durante os 5s
Após 5s → HP restaurado, teleporta para spawn point, envia `player-respawned`
```

---

## Fluxo Completo

### 1. Criação do Jogo (Editor)

```
Painel de configurações → ativa flag "online"
  ↓
Editor exibe objeto especial: "Spawn P2" (e "Spawn P3", "Spawn P4" no futuro)
  ↓
Criador arrasta Spawn P2 para a posição desejada no mapa
  ↓
GameDefinition salva:
  online: { enabled: true, spawnPoints: [{ role: 'p2', room, x, y }] }
```

### 2. Iniciar Servidor (Editor)

```
Botão "Iniciar Servidor" (visível só quando online: true)
  ↓
Frontend gera GUID localmente (crypto.randomUUID())
  ↓
Monta URL combinando GUID como query param + game data no hash via helper dedicado:
  const shareUrl = new URL(ShareUrlHelper.buildShareUrl(gameData))
  shareUrl.searchParams.set('modo-online', guid)
  // hash já está preservado pelo buildShareUrl; searchParams não o toca
  ↓
Criador copia e compartilha o link (sem chamada de API necessária)
  ↓
O Party no PartyKit só é criado quando o primeiro jogador conecta via WebSocket
```

> Sem endpoint de criação. O GUID fica em `location.search` (`URLSearchParams`),
> o game data fica em `location.hash` — exatamente como o compartilhamento atual lê.
> Os dois mecanismos coexistem sem conflito.

### 3. Entrar no Jogo

```
Abre URL com ?modo-online=<GUID>
  ↓
Detectado no GameEngine ao inicializar: inicia OnlineManager
  ↓
Cliente gera sessionToken (crypto.randomUUID()) se não existir em sessionStorage
  ↓
Modal: "Digite seu nome" (2–16 chars, salvo em sessionStorage)
  ↓
OnlineClient conecta via WebSocket ao Party <GUID> no PartyKit
  Envia player-join: { name, sessionToken }
  ↓
Servidor registra jogador, atribui role:
  - 1º a conectar → Host → LOBBY (aguardando P2)
  - 2º a conectar → Guest → LOBBY → ambos recebem sinal de início
  - 3º+ a conectar → Spectator (sem spawn, entra direto no jogo)
  ↓
Enquanto no lobby: P1 vê "Aguardando jogadores..." + botão "Jogar sozinho"
  ↓
Quando P2 conecta: servidor emite 'game-start' para todos → jogo inicia
  ↓
Se P1 clicar em "Jogar sozinho":
  Envia 'lobby-cancelled' para o servidor → servidor marca Party como cancelada
  P1 desconecta do Party → jogo inicia em modo solo (sem OnlineManager)
  Qualquer conexão futura ao mesmo GUID recebe 'server-closed' imediatamente
  ↓
Se Guest ou Spectator entrar em partida já em andamento:
  Host envia full-state-snapshot imediatamente
  Guest aplica snapshot e entra no mapa no spawn point correto
```

### 4. Loop do Jogo

```
Host (a cada 50ms / 20x por segundo):
  - Executa GameEngine completo (inimigos, lógica, variáveis)
  - Computa WorldStateDiff (só o que mudou desde último tick)
  - Envia diff para PartyKit → PartyKit faz broadcast para Guests

Host (ao receber evento de input do Guest via WebSocket):
  - Processa o comando discreto recebido (mover N/S/L/O, interagir, atacar)
  - Não há polling — eventos chegam conforme o Guest pressiona teclas/toca a tela

Guest (ao detectar evento de input — keydown, touchstart, botão mobile):
  - Envia player-input discreto para PartyKit (não envia a cada frame)
  - Aplica WorldStateDiff recebido no GameState local
  - Renderiza todos os jogadores nas posições recebidas

Todos os jogadores (a cada frame — via requestAnimationFrame):
  - Enviam própria posição para PartyKit → broadcast para os outros
  - Nota: posição a 60fps é aceitável em largura de banda (~100 bytes × 60 = 6KB/s por jogador)
```

> **Modelo de input correto:** `InputManager` é event-driven (`keydown`, `touchstart`, swipe).
> O Guest não mantém estado contínuo de teclas — ele relaya eventos discretos conforme ocorrem.
> "player-input a cada frame" é um erro do rascunho inicial; o correto é on-event.

### 5. Host Failover

```
Host fecha aba → WebSocket fecha
  ↓
PartyKit detecta disconnect → emite 'host-left' para os outros
  ↓
Servidor promove o Guest mais antigo para Host:
  - Atualiza role no estado interno
  - Envia 'role-changed' { newRole: 'host' } para o novo Host
  - Envia player-list atualizado para todos
  ↓
Novo Host ativa GameEngine completo (simulação de inimigos e objetos)
  ↓
Novo Host envia full-state-snapshot baseado no SEU estado local atual
  ↓
⚠️ Limitação aceita: o servidor não armazena world state.
   O novo Host envia o estado que tem, que pode ser ligeiramente mais antigo
   que o estado do Host que caiu (especialmente se estavam em salas diferentes).
   Pequeno rollback é possível — aceito como trade-off do modelo sem servidor autoritativo.
```

### 6. Encerramento

```
Jogador fecha aba → WebSocket fecha
  ↓
PartyKit detecta disconnect → emite player-leave para os outros
  ↓
Quando último jogador desconecta → Party fecha (lifecycle automático)
  ↓
Nova tentativa de conectar ao mesmo GUID → sala nova (estado zerado)
```

---

## Mudanças no Código Existente

### `src/config/GameConfig.ts`
```typescript
online: {
  syncIntervalMs: 50,          // frequência de broadcast do Host (20x/s)
  maxActivePlayers: 2,         // jogadores com sprite e input (aumentar no futuro)
  // maxConnections não existe — espectadores conectam sem limite ativo
}
```

### `src/types/gameState.ts` — `GameDefinition`
```typescript
online?: {
  enabled: boolean;
  spawnPoints?: Array<{
    role: string;            // 'p2', 'p3', etc.
    room: string;
    x: number;
    y: number;
  }>;
};
```

### `src/main.ts` (detecção antecipada)
- Verificar `URLSearchParams` para `modo-online` **antes** de criar o `GameEngine`
- Se presente: criar `OnlineManager`, aguardar conexão/role, depois instanciar `GameEngine`
- Isso é necessário porque `GameEngine` chama `startEnemyLoop()` no construtor — não é possível pausá-lo "de fora" depois

### `src/runtime/services/GameEngine.ts`
- Recebe `OnlineManager` opcional via construtor ou setter pré-inicialização
- Injetar `OnlineManager` nos managers que precisam (CombatManager, EnemyManager)

### `src/runtime/services/engine/CombatManager.ts`
- `applyDamageToEnemy()`: se online + Guest, não aplica dano localmente — envia evento para Host
- `handleEnemyCollision()`: inimigo só pode contra-atacar um jogador por vez — verificar `onlineCombatTarget`

### `src/runtime/adapters/renderer/RendererEntityRenderer.ts`
- `drawPlayers()`: novo método — renderiza todos os jogadores remotos
- Nome do jogador renderizado acima do sprite (fonte pequena, cor por role: branco=P1, azul=P2)

### Editor — objeto "Spawn P2"
- Categoria especial: "Online" no painel de objetos
- Aparece **somente** quando `online.enabled = true`
- Ícone visual distinto (ex: sprite de jogador com borda azul)
- Não executa lógica em runtime — é apenas referência de posição inicial

---

## UI

### Modal de Nome
```
┌──────────────────────────────┐
│  Digite seu nome             │
│  ┌────────────────────────┐  │
│  │ André                  │  │
│  └────────────────────────┘  │
│           [ Entrar ]         │
└──────────────────────────────┘
```
- Aparece ao detectar `?modo-online=` na URL
- Validação: 2–16 caracteres, alfanumérico + espaços
- Salvo em `sessionStorage` (não persiste entre sessões)

### Lista de Jogadores (abaixo do canvas)
```
┌───────────────────────────────────────────────┐
│  🟢 André (Você)    ❤️❤️❤️    Sala: Floresta  │
│  🟢 Fulano          ❤️❤️      Sala: Vila       │
│  🔴 Beltrano        💀 morto                   │
└───────────────────────────────────────────────┘
```
- Indicadores: 🟢 online, 🟡 conectando, 🔴 morto / desconectado
- Sala atual de cada jogador (nome da sala, não ID)
- Atualiza em tempo real via player-position + player-died

### Tela de Espera (jogador morto)
```
┌──────────────────────────────┐
│                              │
│     Você foi derrotado...    │
│                              │
│     Voltando em  3           │
│                              │
└──────────────────────────────┘
```
- Sobrepõe o canvas com overlay escuro semitransparente
- Câmera passa automaticamente para o jogador vivo mais próximo do ponto de morte
- O jogador morto assiste sem controle; câmera não pode ser trocada manualmente

### Lobby (aguardando jogadores)
```
┌──────────────────────────────┐
│  Aguardando jogadores...     │
│                              │
│  🟢 André (Você)             │
│  ⏳ Aguardando P2...         │
│                              │
│     [Jogar sozinho]          │
└──────────────────────────────┘
```
- Aparece para o Host enquanto o segundo jogador não chegou
- Botão "Jogar sozinho" disponível imediatamente — desconecta do Party e inicia solo
- Quando P2 conecta: servidor emite `game-start`, jogo inicia para ambos

### Tela de Vitória (online)
```
┌──────────────────────────────┐
│         VITÓRIA!             │
│                              │
│   André completou o jogo!    │
│                              │
│   [  Voltar ao início  ]     │
└──────────────────────────────┘
```
- Quando qualquer jogador atinge a condição de vitória, Host envia `game-over`
- Todos recebem a mesma tela simultaneamente, com o nome de quem venceu

### Botão "Iniciar Servidor" (Editor)
- Aparece no painel de configurações quando `online: true`
- Ao clicar: gera GUID + monta URL + copia para clipboard
- Exibe URL copiada com botão de copiar novamente

---

## Estrutura do Servidor PartyKit

```typescript
// partykit/src/party.ts
import type * as Party from 'partykit/server';

type PlayerState = {
  id: string;
  name: string;
  sessionToken: string;
  role: 'host' | 'guest' | 'spectator';   // spectator: 3º+ jogador
  room: string;
  x: number;
  y: number;
  alive: boolean;
};

export default class GameParty implements Party.Server {
  players = new Map<string, PlayerState>();
  cancelled = false;   // true quando Host clicou "Jogar sozinho"

  onConnect(conn: Party.Connection) {
    if (this.cancelled) {
      conn.send(JSON.stringify({ type: 'server-closed' }));
      conn.close();
      return;
    }
    // Aguarda player-join com { name, sessionToken } antes de atribuir role
  }

  onMessage(message: string, sender: Party.Connection) {
    const msg = JSON.parse(message);
    switch (msg.type) {
      case 'player-join': {
        // Verifica se é reconexão pelo sessionToken (janela de ~10s)
        // Atribui: 1º = host, 2º = guest, 3º+ = spectator
        // broadcast player-list para todos
        break;
      }
      case 'player-position': {
        // Atualiza estado local, broadcast para os outros
        break;
      }
      case 'world-state-diff': {
        // Valida que sender é o Host, broadcast para Guests/Spectators
        break;
      }
      case 'player-input': {
        // Valida que sender NÃO é spectator, relay para o Host
        break;
      }
      case 'lobby-cancelled': {
        // Apenas Host pode enviar; marca Party como cancelada
        this.cancelled = true;
        break;
      }
      default: {
        // Demais tipos: broadcast direto
        this.party.broadcast(message, [sender.id]);
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    this.players.delete(conn.id);
    if (player?.role === 'host') {
      // Promove o Guest mais antigo para Host
      // Emite host-left, depois role-changed para o novo Host
    }
    this.party.broadcast(JSON.stringify({ type: 'player-leave', playerId: conn.id }));
    // Quando vazia, Party fecha automaticamente
  }
}
```

---

## Fases de Implementação

### Fase 0 — Persistência (pré-requisito: sem isso nada funciona de ponta a ponta)

O campo `online` e os `spawnPoints` precisam sobreviver ao ciclo share → link → load.
Hoje `StateDataManager.exportGameData()` e `importGameData()` não conhecem `online`.
`ShareEncoder` tem lista explícita de campos — campos desconhecidos são silenciosamente descartados.

- [x] Adicionar `online?: { enabled: boolean; spawnPoints?: SpawnPoint[] }` em `src/types/gameState.ts` (`GameDefinition`)
- [x] Adicionar `online?` ao tipo `ImportData` em `StateDataManager`
- [x] Exportar campo `online` em `StateDataManager.exportGameData()` (condicional, como `skillCustomizations`)
- [x] Importar campo `online` em `StateDataManager.importGameData()`
- [x] Adicionar `online?: unknown` à lista de campos conhecidos em `ShareEncoder`
- [x] Garantir que `ShareEncoder.buildShareCode()` inclui e `ShareDecoder` restaura o campo
- [x] Adicionar Spawn P2 como tipo de objeto nas categorias do editor (`src/editor/`) — salvo em `game.online.spawnPoints`, **não** como `ObjectEntry` comum
- [ ] Testes: exportar jogo com `online.enabled=true` e spawn point → link → importar → campos presentes

### Fase 0b — Modelo de Runtime Online (definir antes de implementar)

Antes de tocar nos managers, definir formalmente como o modo online se sobrepõe ao modo solo.
Sem esse contrato, as exceções vão se espalhar pelo código ad-hoc.

**Regras de autoridade:**

| Ação                         | Quem executa      | Quem recebe resultado         |
|------------------------------|-------------------|-------------------------------|
| Mover inimigo                | Host              | Guest via `world-state-diff`  |
| Aplicar dano de P1 em inimigo| Host (local)      | Guest via `world-state-diff`  |
| Aplicar dano de P2 em inimigo| Host (via input)  | Guest via `world-state-diff`  |
| Inimigo dana P1              | Host              | (P1 é local do Host)          |
| Inimigo dana P2              | Host → envia `player-took-damage` | Guest aplica dano local |
| Coletar item (P1)            | Host              | Guest marca `collected=true` sem efeito |
| Coletar item (P2)            | Host valida, Guest aplica efeito | Outros: `item-picked` → `collected=true` |
| Ativar alavanca              | Host (qualquer jogador pode iniciar) | Todos via `object-triggered` |
| Mudar variável               | Quem executa → Host valida → todos via `variable-changed` | |
| Condição de vitória          | Host detecta → `game-over` | Todos |

**Mudanças estruturais nos managers (Host mode):**
- `EnemyManager`: aceitar `players: PlayerState[]` em vez de `getPlayer()` singleton
- `InteractionManager`: verificar se collector é P1 local ou P2 remoto antes de aplicar efeitos
- `CombatManager`: receber e processar `player-input` de P2 como se fosse um jogador virtual

**Modos de operação do GameEngine:**
- `solo`: comportamento atual, sem mudanças
- `online-host`: engine completo + broadcast de diffs + recebe inputs remotos
- `online-guest`: engine sem simulação de inimigos/objetos/vitória + aplica diffs recebidos

Esses três modos devem ser implementados como uma enum/flag injetada no GameEngine,
não como ifs espalhados. Todo manager que precisar se comportar diferente verifica esse flag.

### Fase 1 — Infraestrutura de Rede (sem gameplay)
- [x] `npm install partykit partysocket`
- [x] Criar `partykit/src/party.ts` — relay básico + gerenciamento de roles + sessionToken para reconexão + flag `cancelled` para lobby cancelado
- [x] Criar `src/online/shared/protocol.ts` — todos os tipos de mensagem
- [x] Criar `OnlineClient.ts` — conexão WebSocket, envio/recebimento tipado; gera e persiste `sessionToken` em sessionStorage
- [x] Criar `OnlineManager.ts` — orquestrador, expõe API para GameEngine

### Fase 2 — Integração com Editor
- [x] Adicionar flag `online` no painel de configurações do editor
- [x] Criar objeto "Spawn P2" — só visível quando `online: true`
- [x] Salvar `spawnPoints` na `GameDefinition`
- [x] Botão "Iniciar Servidor" — gera GUID, monta URL, copia clipboard
- [x] Persistir flag e spawn points no save/export do jogo

### Fase 3 — Entrada no Jogo e Lobby
- [x] Detectar `?modo-online=` via `URLSearchParams` em `main.ts`, **antes** de criar `GameEngine`
- [x] Game data lido de `location.hash` pelo mecanismo existente (`ShareUrlHelper.extractGameDataFromLocation`)
- [x] Implementar `PlayerNameModal`
- [x] Conectar ao Party, receber role (host/guest/spectator)
- [x] Host: exibir tela de lobby com "Aguardando jogadores..." + botão "Jogar sozinho"
- [x] Servidor emite `game-start` quando P2 conecta → ambos iniciam simultaneamente
- [x] Host: spawn no P1 spawn; Guest: spawn no P2 spawn point
- [x] Host envia `full-state-snapshot` quando Guest/Spectator conecta em partida já iniciada
- [x] Guest aplica snapshot antes de iniciar o loop
- [x] Reconexão: servidor guarda role por `sessionToken` com janela de graça de ~10s

### Fase 4 — Sincronização de Posições
- [x] Cada jogador envia `player-position` a cada frame (via `OnlinePositionSender`)
- [x] Mapa de posições remotas mantido em `main.ts`
- [x] `RendererEntityRenderer.drawPlayers()` renderiza todos os jogadores com tint por índice
- [x] Nome do jogador acima do sprite

### Fase 5 — Sincronização de Mundo
- [x] `OnlineStateBroadcaster`: Host serializa `WorldStateDiff` a cada 50ms
- [x] `OnlineStateSync`: Guest aplica diffs no `GameState`
- [x] Sincronizar: HP e posição de inimigos (apenas salas com jogadores), estado de objetos, variáveis
- [x] `OnlineRoomTracker`: Host monitora salas ativas; pausa/retoma simulação por sala
- [x] Eventos discretos: `enemy-died`, `item-picked`, `object-triggered`, `variable-changed`
- [x] HP do jogador incluído no `player-position` → PlayerList exibe corações corretos
- [x] Renderizar P2 com tint azul (cor distinta por player index)

### Fase 6 — Combate Multiplayer
- [x] Guest: input de ataque → envia para Host via `player-input` (`OnlineInputRelay.sendAttack`)
- [x] Host: processa dano do Guest no inimigo via `GameEngine.processGuestAttack()`
- [x] Inimigo: persegue e ataca o jogador mais próximo na sala (local ou remoto)
- [x] Inimigo ataca Guest → Host envia `player-took-damage` via `onEnemyAttackedRemotePlayer`
- [x] Items: evento `item-picked` remove do mapa para todos
- [x] Inimigos em salas sem jogadores: pausar tick via `OnlineRoomTracker` + `setActiveRooms`

### Fase 6b — Host Failover
- [x] Servidor detecta disconnect do Host → emite `host-left`
- [x] Servidor promove Guest mais antigo para Host → emite `role-changed`
- [x] Novo Host ativa simulação completa (GameEngine full mode)
- [x] Novo Host envia `full-state-snapshot` para os demais

### Fase 7 — Morte, Respawn e Fim de Jogo
- [x] Evento `player-died` enviado quando HP chega a zero
- [x] `WaitingScreen` sobrepõe canvas com contagem regressiva de 5s
- [x] Após 5s: HP restaurado, teleporta para spawn point, envia `player-respawned`
- [x] `PlayerList` exibe status morto + corações para todos
- [x] Quando condição de vitória atingida: Host envia `game-over` com `{ winnerId, winnerName }`
- [x] Todos recebem `game-over` → exibem banner com nome do vencedor

### Fase 8 — Espectadores
- [x] Role `spectator` no protocolo e no servidor
- [x] Servidor: bloqueia `player-input` de espectadores
- [x] `PlayerList` exibe seção "Espectadores" separada dos jogadores ativos
- [x] Espectadores não têm sprite renderizado no mapa

### Fase 9 — UI e Polish
- [x] `PlayerList` completo abaixo do canvas (sala, corações, status morto/vivo)
- [x] `ConnectionIndicator` — estado de conexão (conectando/online/desconectado) no canto inferior direito
- [x] `OnlineToast` — mensagens de "jogador entrou/saiu/voltou" como notificações temporárias
- [x] Graceful disconnect — toast exibido ao reconectar e quando outro jogador sai

### Fase 10 — Deploy e Testes
- [ ] `npx partykit deploy` — deploy do servidor (requer `npx partykit login` primeiro)
- [ ] Configurar `VITE_PARTYKIT_HOST` no Vercel environment (`tiny-rpg-online.<usuario>.partykit.dev`)
- [ ] Testes manuais: sync de inimigos, objetos, variáveis
- [ ] Testes de edge case: desconexão, host cai, sala cheia
- [ ] Testes de carga básicos no free tier

---

## Decisões Finais

**A. Respawn do jogador morto:**
Respawn automático após 5 segundos no spawn point inicial do jogador.
- `WaitingScreen` exibe contagem regressiva: "Voltando em 5... 4... 3..."
- Após respawn: HP restaurado, reaparece no spawn point, envia `player-respawned`
- Todos os outros jogadores veem o jogador reaparecer normalmente

**B. Sala lotada (mais de 2 jogadores no futuro):**
Entra como espectador — vê o jogo em tempo real mas não pode interagir.
- Espectadores recebem `world-state-diff` e `player-position` normalmente
- Espectadores não enviam `player-input`
- `PlayerList` os exibe em seção separada: "Espectadores"
- Não têm sprite no mapa (invisíveis para os jogadores ativos)
