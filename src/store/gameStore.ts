// THE GAME STORE — what the screen shows: the engine's game state, the word list, and the turn being
// planned (move, cast, what's held) before Cast makes it real. Taps call these actions; the actions only
// ever change the game by sending an engine action through the rules' one door (rules.ts: check, then apply). Golden rule.
// It also knows who sits in each seat (seats.ts), when the device is being passed on (handoff),
// the end table's numbers (stats.ts) and how far the end-of-game Magic reveal has got.
// ONLINE (onlinePlay.ts): this device plans its own seat exactly the same way, but the action goes to the
// server instead of the engine, and the server's view of the game comes back and replaces `game`.
// WHAT HAPPENED (F31): every change keeps the rules' events beside the game it made (`happened`, happened.ts) —
// the screen reads "what just happened" (the throw's landing, the words to score, the new seeds) from them.
import { create } from 'zustand'
import text from '../../content/text/en.json'
import animFile from '../../content/tuning/anim.json'
import { liveTuning } from '../devkit/tuning/liveTuning'
import { reduceMotion } from '../ui/kit/blocks/motion'
import { checkAction } from '../engine/engine'
import { flowOf, glyphtenderRules, setupGame, type GameEvent, type GlyphtenderLevel } from '../engine/rules'
import { hexKey, sameHex, type Hex } from '../engine/hex'
import { migrateGame } from '../engine/migrate'
import { parseWordList } from '../engine/words'
import type { Action, GameState, WordList } from '../engine/types'
import type { Applied } from '../table/core'
import { drawnIds, eventOf, setAsideIds, startedTurn, turnOf, type Happened } from './happened'
import {
  isCurrents, mayMoveOnly, TRAY_GAP, turnAction, undoNow, type PlannedCast, type PlannedMove, type Selection,
} from './turnPlan'
import { NEW_GLYPHLING, onHex, playReferee, type Piece } from './referee'
import { defaultAi, isLocalBot, localSeats, needsHandoff, type AiPick, type Seat } from './seats'
import { glideSeconds } from '../game/glide'
import { firstViewer, viewerOf } from './viewer'
import { canPlayNow, isBusy } from './myTurn'
import { addTurn, emptyStats, type PlayerStats } from './stats'
import { revealSteps } from './revealPlan'
import { nopeFor, type NopeTarget, type Tap } from './nope'
import { refreshTimes, type RefreshFx } from './refreshFx'
import { moveInRack, placesOf, rackOf, refillRack, shuffleRack } from '../table/rack'
import { landingSeconds } from './wordMarks'
import type { Trail } from './trail'

/** Short messages for taps that can't do anything (their words live in content/text/en.json → game.notes). */
export type Note = 'moveFirst' | 'notYours' | 'tangled' | 'wordsLoading' | 'wordsFailed' | 'problem'

/** The table options a game starts with (the new-game screen; online, the host's lobby options). */
export interface GameOptions {
  players: number
  boardName: string
  /** 2 = two-letter words count; 3 = the "2-letter words off" table option. */
  minWordLength: number
  /** Pass-and-play: hide the tray between turns until the next player taps "Show my seeds". */
  hideSeeds: boolean
  /** Made words get a white border, Cast shows "+N" and the Magic pops. Off = players spot words themselves. */
  wordIndicators: boolean
}

/** Waiting for the device to be passed to `seat` (their seeds stay hidden until they tap). */
export interface Handoff {
  seat: number
  /** True when a seed was just thrown: the screen lets it grow before asking for the device to be passed. */
  afterGrow: boolean
}

/** An online game: which seat is this device's, the server's view version, and the way to the server (onlinePlay.ts). */
export interface OnlineLink {
  mySeat: number
  gameId: number
  version: number
  /** Send this seat's action to the server (it answers with a new view). */
  post: (action: Action) => void
  /** A thrown seed landed (this device's own, or another player's being replayed). */
  landed: () => void
  /** My refresh's seeds have shrunk away: show the views that waited for them. */
  resume: () => void
}

export interface GameStore {
  game: GameState | null
  words: WordList | null
  wordsStatus: 'idle' | 'loading' | 'ready' | 'failed'
  move: PlannedMove | null
  cast: PlannedCast | null
  selected: Selection
  /** True while a thrown seed is in the air — nothing can be touched. */
  flying: boolean
  /** Refresh mode: the ids of the seeds set aside. */
  setAside: string[]
  /** Each seat's tray order (seed ids, left to right; TRAY_GAP = an empty place). Only the screen cares; the rules don't. */
  trayOrder: string[][]
  /** The seed that just landed (hexKey) and a counter that changes every landing, for the grow + glow. */
  landed: { key: string; count: number } | null
  note: Note | null
  /** Who sits in each seat: a person or a bot, on this device or online (seats.ts). */
  seats: Seat[]
  /** The last person on this device who looked at the game — the viewer seat stays with them while the device is
   *  being passed on or a bot plays (viewer.ts; kept up to date at the bottom of this file). */
  lastViewer: number
  options: GameOptions | null
  /** Set while the device is being passed on — the tray is hidden and nothing can be touched. */
  handoff: Handoff | null
  /** Each player's best turn, longest word and words made, for the end table. */
  stats: PlayerStats[]
  /** How far the end-of-game Magic reveal has got (a step number in revealPlan.ts); null = not started. */
  revealAt: number | null
  /** Online only (null in pass-and-play). */
  online: OnlineLink | null
  /** Online: this device's action went to the server; nothing can be touched until its view comes back. */
  waiting: boolean
  /** A refresh playing out on the tray (refreshFx.ts) — nothing can be touched, and play passes on after it. */
  refreshFx: RefreshFx | null
  /** Online: another player's turn being replayed — its trail draws on in their colour before the glide (trail.ts). */
  trail: Trail | null
  /** A cast's score playing out on the board (the landing's count; wordMarks.scoreSequence) — nothing can be touched and
   *  the next turn (online: the next view) waits until it has faded away. null = nothing scoring. */
  scoring: number | null
  /** The change on screen: its number and the rules' events — what just happened (happened.ts). Pass-and-play counts
   *  its own changes; online it's the server's change number (the view's version). null = nothing yet (a new game, a jump). */
  happened: Happened | null
  /** The last piece that said "no" to a tap (it shakes); the count changes every time, so the same piece can shake again. */
  nope: (NopeTarget & { count: number }) | null
  /** An AI's draft on its way (botPlays with show, F50): its glyphling travels out of the tray to this hex like a person's
   *  drag (useBotDraft) — nothing can be touched — then landBotDraft places it. null = none travelling. */
  botDraft: Hex | null

  /** `bots`: seats the AI plays on this device (store/localBot.ts — New Game's AI seats, tests, the Dev Kit).
   *  `ai`: who each of those AIs is (personality + skill ids, content/ai/); a bot seat left out plays the Survivor at First Class (seats.ts defaultAi). */
  startGame: (options: Partial<GameOptions> & { players: number; seed: number; bots?: number[]; ai?: Record<number, AiPick> }) => void
  leaveGame: () => void
  /** The next player has the device: show their seeds. */
  showSeeds: () => void
  setRevealAt: (step: number | null) => void
  /** Skip: jump to the end of the reveal (everything shown). */
  skipReveal: () => void
  loadWords: (url: string) => Promise<void>
  setWords: (words: WordList) => void
  tapGlyphling: (id: number) => void
  grabGlyphling: (id: number) => void
  tapSeed: (id: string) => void
  grabSeed: (id: string) => void
  tapHex: (hex: Hex) => void
  undo: () => void
  startCast: () => void
  finishCast: () => void
  toggleSetAside: (id: string) => void
  refresh: (keepAll?: boolean) => void
  /** Online: my refresh's view has come — the new seeds grow into these tray positions. */
  refreshArrived: (newSlots: number[]) => void
  /** A seed just landed (store.landed): if its turn grew words (and word indicators are on), its score plays out now. */
  startScoring: () => void
  /** The score sequence has faded away: play may go on (online: the views that waited are shown). */
  endScoring: () => void
  moveTraySeed: (from: number, to: number) => void
  shuffleTray: () => void
  /** Before a tap or drag does its thing: if the piece can't be touched it shakes "no" (nope.ts). True = refused. */
  refuseTap: (tap: Tap) => boolean
  /** A bot on this device plays its seat's whole action (localBot.ts) — through the same rules door and the same
   *  follow-ups (tray, handoff, score, refresh) as a person's taps, without the taps.
   *  `show` (the AI in a real game): a turn plays out like a person's — the glyphling glides, its seed is aimed (held
   *  `aimMs`, like a person looking at their aim before Cast: the planned seed + word light show), then the seed flies,
   *  and its landing (Board → finishCast) makes it real; a draft travels out of the tray first (botDraft). Without it
   *  (tests) the action is made real at once. */
  botPlays: (action: Action, show?: boolean, aimMs?: number) => void
  /** An AI's travelling draft glyphling has reached its hex (useBotDraft): place it. */
  landBotDraft: () => void
  /** Dev and e2e only: jump straight to a game state (with the end table's numbers so far, if known). */
  loadState: (game: GameState, stats?: PlayerStats[]) => void
}

// Everything about the turn being planned, cleared (a fresh object each time, so nothing is shared)
const noPlan = (): Pick<GameStore, 'move' | 'cast' | 'selected' | 'setAside' | 'note' | 'botDraft'> =>
  ({ move: null, cast: null, selected: null, setAside: [], note: null, botDraft: null })
const NO_WORDS: WordList = new Map() // the draft and refresh never read words
const anim = liveTuning('anim', animFile) // the refresh's timings (read when a refresh starts)
const SCORE_BEAT_MS = 120 // the score sequence's timer waits this much past the fade (see startScoring)

export const useGameStore = create<GameStore>()((set, get) => {
  // Sends an engine action; says "problem" instead of crashing if it was somehow illegal.
  // Gives back the new game and its events (null = refused).
  const send = (action: Action): Applied<GameState, GameEvent> | null => {
    const { game, words } = get()
    if (!game) return null
    if (action.type === 'turn' && action.seed !== null && !words) { // only a cast grows words; a move-only turn never reads them
      set({ note: wordsNote() })
      return null
    }
    const rules = glyphtenderRules(words ?? NO_WORDS)
    const problem = rules.check(game, game.current, action) // pass-and-play: the device plays for whoever's turn it is
    if (problem) {
      console.warn('Illegal action from the screen:', problem)
      set({ ...noPlan(), note: 'problem' })
      return null
    }
    return rules.apply(game, game.current, action)
  }
  // The next change number on this device, with its events (shown together with the game it made)
  const changeOf = (events: GameEvent[]): Happened => ({ change: (get().happened?.change ?? 0) + 1, events })

  // Why a cast can't go yet: the words are still coming, or they couldn't be loaded (the screen offers Retry)
  const wordsNote = (): Note => (get().wordsStatus === 'failed' ? 'wordsFailed' : 'wordsLoading')

  // Online: check it here too (so a mistake shows at once), then the server plays it and sends the new view.
  const sendOnline = (action: Action): boolean => {
    const { game, online } = get()
    if (!game || !online) return false
    const problem = checkAction(game, action)
    if (problem) {
      console.warn('Illegal action from the screen:', problem)
      set({ ...noPlan(), note: 'problem' })
      return false
    }
    set({ waiting: true, selected: null, note: null }) // before posting: the answer may come back at once
    online.post(action)
    return true
  }

  // May the screen touch the game right now? Only on a turn this device plays (the rules' turn flow + who's here),
  // and not in a quiet moment (a seed flying, the device being passed on, waiting for the server, a refresh or a
  // score playing out) — myTurn.ts, the one answer the whole screen asks.
  const canPlay = () => canPlayNow(get())
  // …and is the turn at this step (the flow's level: the draft, the move + cast, or the refresh after it)?
  const canPlayAt = (level: GlyphtenderLevel) => {
    const game = get().game
    return game !== null && canPlay() && flowOf(game).level === level
  }

  // The score sequence's own timer: one at a time; leaving or jumping the game stops it
  let scoreTimer: ReturnType<typeof setTimeout> | null = null
  const stopScoring = () => {
    if (scoreTimer) clearTimeout(scoreTimer)
    scoreTimer = null
  }

  // The refresh playing out (refreshFx.ts): one timer at a time; leaving or jumping the game stops it
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const after = (ms: number, then: () => void) => {
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      then()
    }, ms)
  }
  const stopRefreshFx = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
    stopBotTurn() // (every place that stops the refresh — a new game, leaving, a jump — stops a bot's glide too)
  }

  // A bot's turn playing out (botPlays with show): the wait between its glide and its throw
  let botTimer: ReturnType<typeof setTimeout> | null = null
  const stopBotTurn = () => {
    if (botTimer) clearTimeout(botTimer)
    botTimer = null
  }
  // Stage "in": the new seeds grow into their slots, then `done` (pass-and-play: play passes on)
  const growIn = (fx: RefreshFx, done: () => void) => {
    set({ refreshFx: { ...fx, stage: 'in' } })
    after(refreshTimes(fx.newSlots?.length ?? 0, anim.current, false).growMs, done)
  }

  // A draft placement on this device (a person's tap, or a bot here)
  const draftAt = (hex: Hex) => {
    const applied = send({ type: 'draft', hex })
    if (!applied) return
    const next = applied.state
    const dealt = next.phase === 'play' // the draft is over and seeds are dealt: pass the device before turn 1
    set({
      ...noPlan(), game: next, happened: changeOf(applied.events), trayOrder: dealt ? next.hands.map(rackOf) : get().trayOrder,
      handoff: dealt ? handoffTo(null, applied.events, false) : null,
    })
  }

  // A refresh on this device (a person's Refresh button, or a bot here): `chosen` = the ids set aside, in hand order.
  // It plays out on the tray first (B011, refreshFx.ts): the set-aside seeds shrink away, the new ones grow into their
  // slots, THEN play passes on.
  const refreshNow = (chosen: string[]) => {
    const { game, trayOrder, online } = get()
    if (!game) return
    const seat = game.current
    const slots = placesOf(trayOrder[seat] ?? [], chosen)
    const { shrinkMs } = refreshTimes(slots.length, anim.current, reduceMotion())
    if (online) {
      // The action leaves at once (the trip to the server hides inside the shrink); its view waits for the shrink
      if (!sendOnline({ type: 'refresh', setAside: chosen }) || shrinkMs === 0) return
      set({ refreshFx: { seat, slots, stage: 'out' } })
      return after(shrinkMs, () => {
        if (get().refreshFx?.stage !== 'out') return // the server refused it, or the connection dropped (onlinePlay.ts)
        set({ refreshFx: { seat, slots, stage: 'gone' } })
        get().online?.resume()
      })
    }
    const applied = send({ type: 'refresh', setAside: chosen })
    if (!applied) return
    const next = applied.state
    const happened = changeOf(applied.events)
    // What happened (the rules' events): which seeds went back, and which came — they grow into the emptied places
    const order = [...trayOrder]
    order[seat] = refillRack(order[seat] ?? [], setAsideIds(applied.events, seat), next.hands[seat])
    const passOn = () => set({ ...noPlan(), game: next, happened, trayOrder: order, handoff: handoffTo(seat, applied.events, false), refreshFx: null })
    if (shrinkMs === 0) return passOn()
    set({ refreshFx: { seat, slots, stage: 'out' }, selected: null })
    const newSlots = placesOf(order[seat], drawnIds(applied.events, seat))
    after(shrinkMs, () => growIn({ seat, slots, newSlots, stage: 'in', hand: next.hands[seat], order: order[seat] }, passOn))
  }

  // Once play has passed on (the change's turnStarted event: who plays next): must the device be handed over first?
  // (from = null: always — after the draft)
  const handoffTo = (from: number | null, events: GameEvent[], afterGrow: boolean): Handoff | null => {
    const { seats, options } = get()
    const next = startedTurn(events)
    if (next?.phase !== 'play') return null
    return needsHandoff(seats, from, next.seat, options?.hideSeeds ?? false) ? { seat: next.seat, afterGrow } : null
  }

  return {
    game: null,
    words: null,
    wordsStatus: 'idle',
    ...noPlan(),
    flying: false,
    trayOrder: [],
    landed: null,
    seats: [],
    lastViewer: 0,
    options: null,
    handoff: null,
    stats: [],
    revealAt: null,
    online: null,
    waiting: false,
    refreshFx: null,
    trail: null,
    nope: null,
    scoring: null,
    happened: null,

    startGame: ({ players, seed, boardName, minWordLength, hideSeeds, wordIndicators, bots = [], ai = {} }) => {
      const game = setupGame({ players, seed, boardName, rules: minWordLength ? { minWordLength } : undefined })
      const options: GameOptions = {
        players, boardName: game.config.boardName, minWordLength: game.config.rules.minWordLength, hideSeeds: hideSeeds ?? true,
        wordIndicators: wordIndicators ?? true,
      }
      stopRefreshFx()
      stopScoring()
      const seats = localSeats(players, text.game.players).map((seat, i): Seat => (bots.includes(i) ? { ...seat, kind: 'bot', ai: ai[i] ?? defaultAi() } : seat))
      set({
        ...noPlan(), game, options, flying: false, landed: null, handoff: null, revealAt: null, refreshFx: null, trail: null, scoring: null,
        happened: null, seats, lastViewer: firstViewer(seats, game), stats: emptyStats(players),
        trayOrder: game.hands.map(rackOf),
      })
    },
    leaveGame: () => {
      stopRefreshFx()
      stopScoring()
      set({ ...noPlan(), game: null, flying: false, landed: null, handoff: null, revealAt: null, online: null, waiting: false, refreshFx: null, trail: null, scoring: null, happened: null })
    },
    showSeeds: () => set({ handoff: null }),
    setRevealAt: (step) => set({ revealAt: step }),
    skipReveal: () => {
      const { game } = get()
      if (game?.phase === 'over') set({ revealAt: revealSteps(game).length })
    },

    // The official word list, fetched once (about 250 KB gzipped). After a failed load, calling it again is Retry.
    loadWords: async (url) => {
      if (get().wordsStatus === 'loading' || get().wordsStatus === 'ready') return
      set({ wordsStatus: 'loading' })
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Word list: HTTP ${response.status}`)
        set({ words: parseWordList(await response.text()), wordsStatus: 'ready' })
      } catch (error) {
        console.warn('Could not load the word list', error)
        set({ wordsStatus: 'failed' })
      }
    },
    setWords: (words) => set({ words, wordsStatus: 'ready' }),

    // Tap a glyphling: hold it (tap again to let go). Tapping the moved one lets you pick a new spot.
    tapGlyphling: (id) => {
      const { selected } = get()
      if (!canPlayAt('play')) return
      if (selected?.kind === 'glyphling' && selected.id === id) return set({ selected: null })
      get().grabGlyphling(id)
    },
    grabGlyphling: (id) => {
      const { game, move } = get()
      if (!game || !canPlayAt('play')) return
      if (!isCurrents(game, id)) return set({ note: 'notYours' })
      if (game.tangled.includes(id)) return set({ selected: null, note: 'tangled' })
      if (move?.glyphling === id) return set({ selected: { kind: 'glyphling', id }, note: null })
      set({ ...noPlan(), selected: { kind: 'glyphling', id } }) // a different glyphling: the old plan goes
    },

    // Tap a tray seed: in refresh mode it's set aside; otherwise hold it to cast (after a move).
    tapSeed: (id) => {
      const { game, selected, cast, move } = get()
      if (!game || !canPlay()) return
      if (game.phase === 'refresh') return get().toggleSetAside(id)
      if (game.phase !== 'play') return
      if (!move) return set({ note: 'moveFirst' })
      if (cast?.seed !== id && selected?.kind === 'seed' && selected.id === id) return set({ selected: null })
      get().grabSeed(id)
    },
    grabSeed: (id) => {
      const { game, cast, move } = get()
      if (!game || !canPlayAt('play') || !move) return
      // Picking up the targeted seed takes it back off the board
      set({ selected: { kind: 'seed', id }, cast: cast?.seed === id ? null : cast, note: null })
    },

    // Tap a hex: place (draft), move there, cast there, or take back what's planned there.
    tapHex: (hex) => {
      const { game, move, cast, selected } = get()
      if (!game || !canPlay()) return
      // May this piece go on this hex? The drag referee's answer (the same one the glow and the shake ask)
      const allowed = (piece: Piece) => playReferee(get()).judge(game.current, piece, onHex(hex)).ok
      if (game.phase === 'draft') {
        if (!allowed(NEW_GLYPHLING)) return // not a glowing hex: nothing happens
        if (get().online) return void sendOnline({ type: 'draft', hex })
        return draftAt(hex)
      }
      if (game.phase !== 'play') return
      if (selected?.kind === 'glyphling' && allowed(selected)) {
        return set({ move: { glyphling: selected.id, to: hex }, cast: null, selected: null, note: null })
      }
      if (selected?.kind === 'seed' && allowed(selected)) {
        return set({ cast: { seed: selected.id, target: hex }, selected: null, note: null })
      }
      if (cast && sameHex(cast.target, hex)) return set({ cast: null, note: null }) // the seed goes back to the tray
      const origin = move && game.glyphlings.find((g) => g.id === move.glyphling)?.hex
      if (origin && sameHex(origin, hex)) return set({ ...noPlan() }) // tapped the ghost: the glyphling goes back
      if (cast && !selected && allowed({ kind: 'seed', id: cast.seed })) return set({ cast: { ...cast, target: hex }, note: null }) // aim it elsewhere
      set({ selected: null })
    },

    // Undo takes back the last step: the cast, then the move — never past the turn's start (turnPlan.undoNow).
    undo: () => {
      const { cast, move } = get()
      if (!canPlay()) return
      const step = undoNow(move, cast)
      if (step === 'cast') return set({ cast: null, selected: null, note: null })
      if (step === 'move') set({ ...noPlan() })
    },

    // Cast: the seed flies (the board animates it) and finishCast runs when it lands.
    // A move-only turn (no seeds, or nowhere to cast) has nothing to throw, so it commits at once.
    startCast: () => {
      const { game, move, cast, words } = get()
      if (!game || !move || !canPlay()) return
      if (cast && !words) return set({ note: wordsNote() }) // End turn (move only) doesn't need the words
      // Online: the action leaves the moment Cast is pressed, so the trip to the server hides inside the throw
      if (get().online && (cast || mayMoveOnly(game, move))) {
        if (cast) set({ flying: true }) // the throw starts now; the server's view waits for it to land
        if (!sendOnline(turnAction(move, cast))) set({ flying: false })
        return
      }
      if (cast) return set({ flying: true, selected: null })
      if (mayMoveOnly(game, move)) get().finishCast()
    },
    finishCast: () => {
      const online = get().online
      if (online) return online.landed() // the server's view is applied there, not the engine's
      const { game, move, cast, trayOrder, stats } = get()
      if (!game || !move) return set({ flying: false })
      const applied = send(turnAction(move, cast))
      if (!applied) return set({ flying: false })
      const next = applied.state
      const seat = game.current
      // What happened (the rules' events): the seed that was cast and where it landed
      const thrown = eventOf(applied.events, 'cast')
      const order = [...trayOrder]
      order[seat] = refillRack(order[seat] ?? [], thrown ? [thrown.seed.id] : [], next.hands[seat]) // the drawn seed takes the cast one's place
      const landed = thrown ? { key: hexKey(thrown.target), count: (get().landed?.count ?? 0) + 1 } : get().landed
      const played = next.lastTurn ? addTurn(stats, next.lastTurn) : stats // (the end table's numbers need the Magic: lastTurn)
      set({
        ...noPlan(), game: next, happened: changeOf(applied.events), flying: false, trayOrder: order, landed, stats: played,
        handoff: handoffTo(seat, applied.events, !!thrown),
      })
      if (thrown) get().startScoring()
    },
    // The words a landing grew score one at a time (ScorePops / useScoreSequence draw it); until it has faded away
    // nothing can be touched, and online the next view waits (Muzzy: nothing from a turn survives into the next).
    // The turn is the one on screen (happened: the rules' events) — and it must be the seed that just landed.
    startScoring: () => {
      const { game, landed, options, happened } = get()
      stopScoring()
      const turn = turnOf(happened?.events)
      const scores = (options?.wordIndicators ?? true) && !!landed && !!turn?.target && hexKey(turn.target) === landed.key && turn.words.length > 0
      if (!game || !scores) return set({ scoring: null })
      set({ scoring: landed!.count })
      // (+ a beat: the board's animations start a frame or two after this, and the fade's last frame must be painted
      // before anything of the next turn shows)
      scoreTimer = setTimeout(() => get().endScoring(), landingSeconds(game, turn, true, anim.current) * 1000 + SCORE_BEAT_MS)
    },
    endScoring: () => {
      stopScoring()
      if (get().scoring === null) return
      set({ scoring: null })
      get().online?.resume()
    },

    toggleSetAside: (id) => {
      const { setAside } = get()
      if (!canPlayAt('refresh')) return
      set({ setAside: setAside.includes(id) ? setAside.filter((x) => x !== id) : [...setAside, id] })
    },
    // Refresh N (or Keep all = set nothing aside): refill to a full hand; set-aside seeds go back in the bag.
    // The player who just played does this BEFORE the device is passed on. It plays out on the tray first
    // (B011, refreshFx.ts): the set-aside seeds shrink away, the new ones grow into their slots, THEN play passes on.
    refresh: (keepAll = false) => {
      const { game, setAside } = get()
      if (!game || !canPlayAt('refresh')) return
      // (in hand order, whatever order they were tapped in — the order they go back into the bag in)
      refreshNow(keepAll ? [] : game.hands[game.current].filter((seed) => setAside.includes(seed.id)).map((seed) => seed.id))
    },
    refreshArrived: (newSlots) => {
      const fx = get().refreshFx
      // once grown, the views that waited are shown (a rival's turn never starts while my new seeds grow — B020)
      if (fx) growIn({ seat: fx.seat, slots: fx.slots, newSlots, stage: 'in' }, () => { set({ refreshFx: null }); get().online?.resume() })
    },

    moveTraySeed: (from, to) => {
      const { game, trayOrder } = get()
      if (!game || !canPlay() || from === to) return
      // The drag referee: a seed may be reordered only after the move (B008), or while choosing what to refresh
      const seed: Piece = { kind: 'seed', id: trayOrder[game.current]?.[from] ?? TRAY_GAP }
      if (!playReferee(get()).judge(game.current, seed, { kind: 'tray', pos: to }).ok) return
      const order = [...trayOrder]
      order[game.current] = moveInRack(order[game.current], from, to)
      set({ trayOrder: order })
    },
    shuffleTray: () => {
      const { game, trayOrder } = get()
      if (!game || !canPlay()) return
      const order = [...trayOrder]
      order[game.current] = shuffleRack(order[game.current])
      set({ trayOrder: order })
    },

    botPlays: (action, show = false, aimMs = 0) => {
      const { game, seats, online } = get()
      if (!game || online || !isLocalBot(seats[game.current]) || isBusy(get())) return
      // A draft shown like a person's drag: the glyphling travels out of the tray first (useBotDraft → landBotDraft)
      if (action.type === 'draft') return show && !reduceMotion() ? set({ botDraft: action.hex }) : draftAt(action.hex)
      if (action.type === 'refresh') return refreshNow(action.setAside)
      // A turn: its plan, then the landing — as if the bot had planned it on the board and its seed had flown
      const move = { glyphling: action.glyphling, to: action.to }
      const cast = action.seed !== null && action.target ? { seed: action.seed, target: action.target } : null
      if (!show) {
        set({ ...noPlan(), move, cast })
        return get().finishCast()
      }
      // Shown like a person's turn: the plan's move first (the glyphling glides there, useGlide), then the aim (the
      // planned seed on its hex, F50), then the throw (flying: the Board flies the seed and calls finishCast when it
      // lands). A move-only turn ends after the glide.
      const from = game.glyphlings.find((g) => g.id === action.glyphling)?.hex ?? action.to
      set({ ...noPlan(), move })
      stopBotTurn()
      const throwNow = () => {
        botTimer = null
        if (get().game === game) set({ cast, flying: true }) // (unless the game moved on or was left meanwhile)
      }
      botTimer = setTimeout(() => {
        botTimer = null
        if (get().game !== game) return // (the game moved on or was left meanwhile)
        if (!cast) return get().finishCast()
        if (aimMs <= 0) return throwNow()
        set({ cast })
        botTimer = setTimeout(throwNow, aimMs)
      }, reduceMotion() ? 0 : glideSeconds(from, action.to, anim.current) * 1000)
    },

    landBotDraft: () => {
      const { botDraft, game, seats } = get()
      if (!botDraft) return
      if (game && isLocalBot(seats[game.current])) draftAt(botDraft) // (it clears botDraft with the rest of the plan)
      if (get().botDraft) set({ botDraft: null }) // (refused, or the game moved on meanwhile)
    },

    refuseTap: (tap) => {
      const target = nopeFor(get(), tap)
      if (target) set({ nope: { ...target, count: (get().nope?.count ?? 0) + 1 } })
      return target !== null
    },

    loadState: (saved, stats) => {
      const game = migrateGame(saved) // an older save brought up to date (the old "Qu" seed → "Q")
      stopRefreshFx()
      stopScoring()
      const seats = get().seats.length === game.config.players ? get().seats : localSeats(game.config.players, text.game.players)
      set({
        ...noPlan(), game, flying: false, handoff: null, revealAt: null, refreshFx: null, trail: null, scoring: null,
        happened: null, // a jump, not a change: nothing "just happened"
        seats, lastViewer: firstViewer(seats, game),
        stats: stats ?? (get().stats.length === game.config.players ? get().stats : emptyStats(game.config.players)),
        trayOrder: game.hands.map(rackOf),
      })
    },
  }
})

// The viewer seat remembers the last person who looked (viewer.ts): whenever the screen's viewer changes — a new
// player's turn, the handoff passed — it becomes the new "last viewer". (While the device is being passed on or a bot
// plays, the viewer IS the last viewer, so nothing changes.)
useGameStore.subscribe((s) => {
  const viewer = viewerOf(s)
  if (viewer !== s.lastViewer) useGameStore.setState({ lastViewer: viewer })
})
