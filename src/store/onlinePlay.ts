// ONLINE PLAY IN THE STORE (design/online.md §4). The server owns the real game; this device gets views of it.
// Each view carries the FEED (F31): the last few changes, numbered, with the events this seat may see. The screen
// remembers the last change it played (lastPlayed) and plays the newer ones IN ORDER, one at a time — so a view
// that arrives late or twice plays nothing again, and views that were skipped (several came at once, or a
// reconnect) still play every change they missed:
//   · MY seat plans and animates exactly like pass-and-play. Cast sends the action at once (gameStore.ts);
//     when the seed lands, my change is shown (if its view hasn't come yet we wait; every WAIT_FOR_VIEW_MS
//     without it, we ask the server to send it again). My change is never replayed — I've just seen it. (Which change
//     answers my action: the view's myLastAction — the change my own last action made, B021.)
//   · A turn the SERVER played for my seat (the turn clock ran out, or a bot took over while I was idle) is not my
//     answer: it plays out like anyone else's turn — trail, glide, throw (B020).
//   · OTHER seats' turns are played out from their events (moved, cast, scored) on the game as it was — their
//     trail draws on in their colour and holds (trail.ts; anim.json trailLead + trailHold), the glyphling glides
//     from → to, the throw starts after glideSeconds, lands — then the change is shown and the runeblossom
//     sprouts and scores; the trail is gone with the landing. Views that arrive meanwhile wait in the inbox.
//   · Another seat's DRAFT placement (a person's or an AI's — or one the server made for me) travels out of the tray
//     to its hex the way a person's drag does (F43: store.botDraft → game/useBotDraft.ts, the glide's timings — the
//     same as an AI's draft on this device, F50), then the change is shown.
//   · Anything else (refreshes) is simply shown.
//   · The LAST change of a view shows the view itself (the server's truth). A change before it (two came in one
//     view) is shown by putting its public facts on the game on screen (happened.ts showChange).
//   · MY refresh plays out on my own tray (B011, refreshFx.ts): the set-aside seeds shrink while the action
//     travels; its view waits for the shrink, then the new seeds (the drew event) grow in — and the next change waits
//     for the grow too (B020). Nobody else sees my seeds.
//   · A gap too old for the feed (back after a long time away): no animation — straight to the view.
//   · SOUND: a replayed change sounds like it would on the player's own screen, as it animates (the glide, throw and
//     score play their own sounds in src/game/); another seat's placement plays draft.place as it lands (here, in show).
//     A jump (startFrom / jumpTo) is silent: nothing "just happened" (happened = null → src/game/sound.ts catchingUp).
import animJson from '../../content/tuning/anim.json'
import { liveTuning } from '../devkit/tuning/liveTuning'
import type { GameView, OnlineAction } from '../../party/protocol'
import { hexKey, sameHex } from '../engine/hex'
import { flowOf } from '../engine/rules'
import { mayAct } from '../table/flow'
import { newChanges } from '../table/events'
import type { Action, GameState } from '../engine/types'
import { playSound } from '../audio'
import { glideSeconds } from '../game/glide'
import { reduceMotion } from '../ui/kit/blocks/motion'
import { useGameStore, type OnlineLink } from './gameStore'
import { onlineSeats } from './seats'
import { emptyStats } from './stats'
import { trailOf } from './trail'
import { placesOf, rackOf, refillRack } from '../table/rack'
import { actorOf, drawnIds, eventOf, showChange, turnOf, type Happened, type TurnPlay } from './happened'

/** How long to wait for my own action's view before asking again (design §6 timers table; counted from Cast). */
export const WAIT_FOR_VIEW_MS = 3000

const anim = liveTuning('anim', animJson) // the replay's timings (read when a replay starts, so the Dev Kit's changes count)

const store = () => useGameStore.getState()
const set = (part: Partial<ReturnType<typeof store>>) => useGameStore.setState(part)

// The inbox: views waiting their turn to be shown. Plain module state — only one online game at a time.
let inbox: GameView[] = []
/** A view whose changes are being played one at a time (the ones not played yet). */
let playing: { view: GameView; changes: Happened[] } | null = null
/** Another player's turn being played out on the game on screen (its trail, glide and throw). */
let replaying: { view: GameView; change: Happened; last: boolean } | null = null
/** The newest change number shown on screen (a change = one action; its number = the version it made). */
let lastPlayed = 0
/** The version my last action was planned on (sent with it). A view whose myLastAction is newer = it was applied. */
let sentOn = -1
let toServer: (message: OnlineAction) => boolean = () => false
let syncTimer: ReturnType<typeof setTimeout> | null = null
let replayTimer: ReturnType<typeof setTimeout> | null = null
/** Who's really at each seat, from the last room message (a person or a bot, connected or not), in game seat order. */
let roomSeats: readonly { kind: 'human' | 'bot'; connected: boolean }[] = []

/** Where this device's messages go (useRoom's send: false = not connected right now). Set by OnlineSession.tsx. */
export function connectOnline(post: (message: OnlineAction) => boolean) {
  toServer = post
}

/** A view from the server. A new game (or the first view after a reload) starts over from it. */
export function receiveView(view: GameView) {
  const { online, game } = store()
  if (!online || !game || view.gameId !== online.gameId) return startFrom(view)
  inbox.push(view)
  showNext()
}

/** A new room message (OnlineSession.tsx): the store's seats follow who's really at each seat — a person or a bot,
 *  connected or not. (The TurnBar badge and the seat toasts still read the room message itself, B015.) */
export function roomSeatsChanged(seats: readonly { kind: 'human' | 'bot'; connected: boolean }[]) {
  roomSeats = seats
  const { online, game } = store()
  if (online && game) set({ seats: onlineSeats(store().seats.map((s) => s.name), online.mySeat, roomSeats) })
}

/** The server refused my action (a stale version, or something illegal): drop the plan, ask for the true view. */
export function actionRefused() {
  if (!store().online) return
  // (a turn being played out — e.g. the one the server played for me instead — is left to finish: it ends on the truth)
  if (replaying) return void set({ waiting: false, refreshFx: null, note: 'problem' })
  set({ move: null, cast: null, selected: null, setAside: [], flying: false, waiting: false, refreshFx: null, note: 'problem' })
  toServer({ kind: 'sync' })
}

/** Leaving the online game: forget everything waiting. */
export function stopOnline() {
  inbox = []
  playing = null
  replaying = null
  lastPlayed = 0
  sentOn = -1
  clearTimers()
}

// ─── Showing views, change by change ────────────────────────────────

function startFrom(view: GameView) {
  stopOnline()
  lastPlayed = view.version // (what came before this view is already in it)
  const game = view.game
  const online: OnlineLink = { mySeat: view.mySeat, gameId: view.gameId, version: view.version, post, landed, resume: showNext }
  const seats = onlineSeats(view.names, view.mySeat, roomSeats)
  set({
    game, online, seats, waiting: false, flying: false, handoff: null, revealAt: null, landed: null, refreshFx: null, trail: null, scoring: null, happened: null,
    move: null, cast: null, selected: null, setAside: [], note: null, botDraft: null,
    options: {
      players: game.config.players, boardName: game.config.boardName, minWordLength: game.config.rules.minWordLength, hideSeeds: false,
      wordIndicators: view.options?.wordIndicators ?? true, // the host's choice, the same on every screen
    },
    stats: view.results?.stats ?? emptyStats(game.config.players),
    botTurns: view.results?.botTurns ?? [], // (F62: the Story chart's bot band; an older server sends none)
    trayOrder: game.hands.map(rackOf),
  })
}

/** Plays the changes not shown yet, in order, one at a time (a flying seed, a replay, a cast's score sequence or my
 *  refresh's shrink and grow hold the queue — the store calls resume → here when it's done). While my refresh waits
 *  for its new seeds (stage 'gone') the queue flows: that's when their view comes. */
function showNext() {
  for (;;) {
    const { flying, online, game, refreshFx, scoring } = store()
    const refreshing = refreshFx !== null && refreshFx.stage !== 'gone'
    if (flying || replaying || scoring !== null || refreshing || !online || !game) return
    if (!playing) {
      const view = inbox.shift()
      if (!view) return
      if (view.version <= online.version) {
        // The server answered a sync (or a rejoin) with the game as it was: it never got my action
        if (view.version === online.version && store().waiting && !myActionApplied(view)) actionLost()
        continue // old news
      }
      const { changes, missed } = newChanges(view.feed ?? [], lastPlayed)
      if (missed || changes.length === 0) { // too long away for the feed: no animation, straight to the view
        jumpTo(view)
        continue
      }
      playing = { view, changes: [...changes] }
    }
    const { view } = playing
    const change = playing.changes.shift()!
    const last = playing.changes.length === 0
    if (last) playing = null
    if (canReplay(game, change, view)) return startReplay(view, change, last)
    const placed = eventOf(change.events, 'placed')
    if (placed && !answersMe(view, change) && !reduceMotion() && canDraftReplay(game, placed)) return startDraftReplay(view, change, last, placed.hex)
    show(view, change, last)
  }
}

/** Did the server apply the action I sent? (It says which change my own last action made: newer than the version I
 *  sent it on = yes. A turn the server played for me doesn't count.) */
const myActionApplied = (view: GameView) => view.myLastAction > sentOn

/** Is this change the answer to an action I sent myself (not one the server played for my seat)? */
const answersMe = (view: GameView, change: Happened) => change.change === view.myLastAction

/** Is this change a turn we can play out on the game we're showing now — another player's, or one the server played
 *  for me (turn clock, bot)? My own answered turn is never replayed: I've just seen it. */
function canReplay(shown: GameState, change: Happened, view: GameView): boolean {
  const turn = turnOf(change.events)
  if (!turn || answersMe(view, change)) return false
  // Our game must be the moment just before it: their turn, the glyphling still on `from`, the target still empty
  const glyphling = shown.glyphlings.find((g) => g.id === turn.glyphlingId)
  const targetFree = !turn.target || !shown.seeds[hexKey(turn.target)]
  const flow = flowOf(shown) // (the rules' turn flow: is it that seat's move + cast?)
  return flow.level === 'play' && mayAct(flow, turn.seat) && !!glyphling && sameHex(glyphling.hex, turn.from) && targetFree
}

/**
 * Shows one change: the view itself if it's the view's last change, else the change's public facts on the game on
 * screen. My own tray keeps its order (the seeds that left — cast or set aside — make room for the drawn ones), and a
 * seed that just landed sprouts and scores.
 */
function show(view: GameView, change: Happened, last: boolean) {
  const { game: shown, online, trayOrder, landed } = store()
  if (!online || !shown) return
  const me = online.mySeat
  const { events } = change
  const mine = actorOf(events) === me && answersMe(view, change) // (the answer to my own action)
  const game = last ? view.game : showChange(shown, events, me, view.game.hands[me] ?? [])
  const thrown = eventOf(events, 'cast')
  const left = thrown?.seat === me ? [thrown.seed.id] : [] // (set-aside seeds are simply gone from the hand)
  const order = game.hands.map((hand, seat) => {
    if (seat !== me) return rackOf(hand) // (other players' seeds come as '?': no ids — nothing to follow)
    return refillRack(trayOrder[seat] ?? [], left, hand) // a drawn seed takes the place of one that left
  })
  const sprout = thrown ? { key: hexKey(thrown.target), count: (landed?.count ?? 0) + 1 } : landed
  if (mine) clearTimers()
  else if (eventOf(events, 'placed')) playSound('draft.place') // (another seat's glyphling arriving — mine sounded on my tap)
  lastPlayed = change.change
  set({
    game, online: last ? { ...online, version: view.version } : online, trayOrder: order, landed: sprout, happened: change,
    waiting: mine ? false : store().waiting, flying: false, trail: null,
    move: null, cast: null, selected: null, setAside: [], note: null,
    stats: (last ? view.results?.stats : null) ?? store().stats,
    botTurns: (last ? view.results?.botTurns : null) ?? store().botTurns,
  })
  // a seed that just landed scores now (its words one at a time); the next change waits for it to fade
  if (sprout !== landed) store().startScoring()
  // my refresh: the new seeds (the drew event) grow into the emptied places
  if (mine && eventOf(events, 'refreshed')) store().refreshArrived(placesOf(order[me], drawnIds(events, me)))
}

/** Straight to a view, nothing animated (the changes before it are gone from the feed). */
function jumpTo(view: GameView) {
  const { online, trayOrder } = store()
  if (!online) return
  // Was I waiting for my own action's answer? The view says whether the server applied it (B021) — even when the
  // newest change is someone else's. If it moved on WITHOUT it, my move can't arrive any more (it was planned on an
  // older version): give the plan back at once.
  const waiting = store().waiting
  const applied = waiting && myActionApplied(view)
  const lost = waiting && !applied && view.version > sentOn
  if (applied || lost) clearTimers()
  lastPlayed = view.version
  set({
    game: view.game, online: { ...online, version: view.version }, happened: null,
    trayOrder: view.game.hands.map((hand, seat) => (seat === online.mySeat ? refillRack(trayOrder[seat] ?? [], [], hand) : rackOf(hand))),
    waiting: applied || lost ? false : waiting, flying: false, trail: null, refreshFx: null, // (a refresh waiting for its seeds: they're simply there)
    move: null, cast: null, selected: null, setAside: [], note: lost ? 'problem' : null,
    stats: view.results?.stats ?? store().stats,
    botTurns: view.results?.botTurns ?? store().botTurns,
  })
}

/** The stand-in id of another player's seed while its throw is replayed (startReplay) — no real seed has this id. */
export const REPLAY_SEED = 'replay'

// ─── Another player's draft placement, played out ───────────────────

/** Is our game the moment just before this placement: the draft, that seat placing, the hex still empty? */
function canDraftReplay(shown: GameState, placed: { seat: number; hex: { q: number; r: number } }): boolean {
  const flow = flowOf(shown)
  return flow.level === 'draft' && mayAct(flow, placed.seat) && !shown.glyphlings.some((g) => sameHex(g.hex, placed.hex))
}

/** Their glyphling leaves the tray and travels to its hex (useBotDraft); its landing (store.landBotDraft → landed)
 *  shows the change. */
function startDraftReplay(view: GameView, change: Happened, last: boolean, hex: { q: number; r: number }) {
  replaying = { view, change, last }
  set({ botDraft: hex, move: null, cast: null, selected: null, note: null })
}

// ─── Another player's turn, played out ──────────────────────────────

function startReplay(view: GameView, change: Happened, last: boolean) {
  const turn: TurnPlay = turnOf(change.events)!
  const old = store().game!
  const current = { view, change, last }
  replaying = current
  // The seed they cast is public now (it's about to land), so the game holds it in their first slot for the throw.
  // Their hand is all '?' (no ids), so it goes in as a stand-in piece, REPLAY_SEED — never a real seed's id.
  // A turn the server played for ME (B020): the seed is already in my hand, so it's thrown by its own id.
  const mine = turn.seat === store().online!.mySeat
  const thrown = turn.letter && !mine ? { id: REPLAY_SEED, letter: turn.letter } : null
  const game = thrown ? { ...old, hands: old.hands.map((hand, seat) => (seat === turn.seat ? [thrown, ...hand.slice(1)] : hand)) } : old
  const seedId = mine ? eventOf(change.events, 'cast')?.seed.id : REPLAY_SEED
  // First their trail draws on and holds, so you see who's playing, where from and where to (reduce motion: it just shows)
  set({ game, trail: trailOf(turn), move: null, cast: null, selected: null, note: null })
  const timing = anim.current
  const trailMs = ((reduceMotion() ? 0 : timing.trailLead) + timing.trailHold) * 1000
  replayTimer = setTimeout(() => {
    replayTimer = null
    if (replaying !== current) return
    // Then the glide; the throw leaves from where the glyphling lands (F15)
    set({ move: { glyphling: turn.glyphlingId, to: turn.to } })
    const glideMs = reduceMotion() ? 0 : glideSeconds(turn.from, turn.to, timing) * 1000
    replayTimer = setTimeout(() => {
      replayTimer = null
      if (replaying !== current) return
      if (turn.letter && turn.target && seedId) set({ cast: { seed: seedId, target: turn.target }, flying: true })
      else landed() // a move-only turn is just the glide
    }, glideMs)
  }, trailMs)
}

// ─── The link the store calls ───────────────────────────────────────

function post(action: Action) {
  const online = store().online
  if (!online) return
  sentOn = online.version // (the server applies it only on this version: its view will say so — myLastAction)
  if (toServer({ kind: 'play', action, version: online.version })) waitForMyView()
  else actionLost() // not connected right now (the Reconnecting box is up)
}

/** My action never reached the server: give the plan back so the player can simply play it again. */
function actionLost() {
  clearTimers()
  set({ move: null, cast: null, selected: null, setAside: [], flying: false, waiting: false, refreshFx: null, note: 'problem' })
}

/** A seed landed (Board → finishCast → here): finish a replay, or show my own change once its view is here. */
function landed() {
  if (replaying) {
    const { view, change, last } = replaying
    replaying = null
    show(view, change, last)
  } else {
    set({ flying: false })
  }
  showNext()
}

// The server's answer to my action hasn't come: ask again every few seconds until it does
function waitForMyView() {
  if (syncTimer) return
  syncTimer = setTimeout(() => {
    syncTimer = null
    if (!store().waiting || !store().online) return
    console.warn('Online: no answer from the server yet — asking for the game again')
    toServer({ kind: 'sync' })
    waitForMyView()
  }, WAIT_FOR_VIEW_MS)
}

function clearTimers() {
  if (syncTimer) clearTimeout(syncTimer)
  if (replayTimer) clearTimeout(replayTimer)
  syncTimer = null
  replayTimer = null
}
