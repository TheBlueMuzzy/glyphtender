// ONLINE PLAY IN THE STORE (design/online.md §4). The server owns the real game; this device gets views of it.
// Each view carries the FEED (F31): the last few changes, numbered, with the events this seat may see. The screen
// remembers the last change it played (lastPlayed) and plays the newer ones IN ORDER, one at a time — so a view
// that arrives late or twice plays nothing again, and views that were skipped (several came at once, or a
// reconnect) still play every change they missed:
//   · MY seat plans and animates exactly like pass-and-play. Cast sends the action at once (gameStore.ts);
//     when the seed lands, my change is shown (if its view hasn't come yet we wait; every WAIT_FOR_VIEW_MS
//     without it, we ask the server to send it again). My change is never replayed — I've just seen it.
//   · OTHER seats' turns are played out from their events (moved, cast, scored) on the game as it was — their
//     trail draws on in their colour and holds (trail.ts; anim.json trailLead + trailHold), the glyphling glides
//     from → to, the throw starts after glideSeconds, lands — then the change is shown and the runeblossom
//     sprouts and scores; the trail is gone with the landing. Views that arrive meanwhile wait in the inbox.
//   · Anything else (draft placements, refreshes) is simply shown.
//   · The LAST change of a view shows the view itself (the server's truth). A change before it (two came in one
//     view) is shown by putting its public facts on the game on screen (happened.ts showChange).
//   · MY refresh plays out on my own tray (B011, refreshFx.ts): the set-aside seeds shrink while the action
//     travels; its view waits for the shrink, then the new seeds (the drew event) grow in. Nobody else sees my seeds.
//   · A gap too old for the feed (back after a long time away): no animation — straight to the view.
import animJson from '../../content/tuning/anim.json'
import { liveTuning } from '../devkit/tuning/liveTuning'
import type { GameView, OnlineAction } from '../../party/protocol'
import { hexKey, sameHex } from '../engine/hex'
import { flowOf } from '../engine/rules'
import { mayAct } from '../table/flow'
import { newChanges } from '../table/events'
import { SEAT_COLOURS, type Action, type GameState } from '../engine/types'
import { glideSeconds } from '../game/glide'
import { reduceMotion } from '../ui/kit/blocks/motion'
import { useGameStore, type OnlineLink } from './gameStore'
import type { Seat } from './seats'
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
let toServer: (message: OnlineAction) => boolean = () => false
let syncTimer: ReturnType<typeof setTimeout> | null = null
let replayTimer: ReturnType<typeof setTimeout> | null = null

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

/** The server refused my action (a stale version, or something illegal): drop the plan, ask for the true view. */
export function actionRefused() {
  if (!store().online) return
  set({ move: null, cast: null, selected: null, setAside: [], flying: false, waiting: false, refreshFx: null, note: 'problem' })
  toServer({ kind: 'sync' })
}

/** Leaving the online game: forget everything waiting. */
export function stopOnline() {
  inbox = []
  playing = null
  replaying = null
  lastPlayed = 0
  clearTimers()
}

// ─── Showing views, change by change ────────────────────────────────

function startFrom(view: GameView) {
  stopOnline()
  lastPlayed = view.version // (what came before this view is already in it)
  const game = view.game
  const online: OnlineLink = { mySeat: view.mySeat, gameId: view.gameId, version: view.version, post, landed, resume: showNext }
  const seats: Seat[] = view.names.map((name, seat) => ({ kind: seat === view.mySeat ? 'local' : 'online', name, colour: SEAT_COLOURS[seat] }))
  set({
    game, online, seats, waiting: false, flying: false, handoff: null, revealAt: null, landed: null, refreshFx: null, trail: null, scoring: null, happened: null,
    move: null, cast: null, selected: null, setAside: [], note: null,
    options: {
      players: game.config.players, boardName: game.config.boardName, minWordLength: game.config.rules.minWordLength, hideSeeds: false,
      wordIndicators: view.options?.wordIndicators ?? true, // the host's choice, the same on every screen
    },
    stats: view.results?.stats ?? emptyStats(game.config.players),
    trayOrder: game.hands.map(rackOf),
  })
}

/** Plays the changes not shown yet, in order, one at a time (a flying seed, a replay, a cast's score sequence or my
 *  refresh's shrink holds the queue — the store calls resume → here when the score has faded). */
function showNext() {
  for (;;) {
    const { flying, online, game, refreshFx, scoring } = store()
    if (flying || replaying || scoring !== null || refreshFx?.stage === 'out' || !online || !game) return
    if (!playing) {
      const view = inbox.shift()
      if (!view) return
      if (view.version <= online.version) {
        // The server answered a sync (or a rejoin) with the game as it was: it never got my action
        if (view.version === online.version && store().waiting) actionLost()
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
    if (canReplay(game, change, online.mySeat)) return startReplay(view, change, last)
    show(view, change, last)
  }
}

/** Is this change another player's turn that we can play out on the game we're showing now? */
function canReplay(shown: GameState, change: Happened, mySeat: number): boolean {
  const turn = turnOf(change.events)
  if (!turn || turn.seat === mySeat) return false
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
  const mine = actorOf(events) === me
  const game = last ? view.game : showChange(shown, events, me, view.game.hands[me] ?? [])
  const thrown = eventOf(events, 'cast')
  const left = thrown?.seat === me ? [thrown.seed.id] : [] // (set-aside seeds are simply gone from the hand)
  const order = game.hands.map((hand, seat) => {
    if (seat !== me) return rackOf(hand) // (other players' seeds come as '?': no ids — nothing to follow)
    return refillRack(trayOrder[seat] ?? [], left, hand) // a drawn seed takes the place of one that left
  })
  const sprout = thrown ? { key: hexKey(thrown.target), count: (landed?.count ?? 0) + 1 } : landed
  if (mine) clearTimers()
  lastPlayed = change.change
  set({
    game, online: last ? { ...online, version: view.version } : online, trayOrder: order, landed: sprout, happened: change,
    waiting: mine ? false : store().waiting, flying: false, trail: null,
    move: null, cast: null, selected: null, setAside: [], note: null,
    stats: (last ? view.results?.stats : null) ?? store().stats,
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
  const mine = view.by === online.mySeat // (the newest change was mine: the answer I was waiting for is here)
  if (mine) clearTimers()
  lastPlayed = view.version
  set({
    game: view.game, online: { ...online, version: view.version }, happened: null,
    trayOrder: view.game.hands.map((hand, seat) => (seat === online.mySeat ? refillRack(trayOrder[seat] ?? [], [], hand) : rackOf(hand))),
    waiting: mine ? false : store().waiting, flying: false, trail: null, refreshFx: null, // (a refresh waiting for its seeds: they're simply there)
    move: null, cast: null, selected: null, setAside: [], note: null,
    stats: view.results?.stats ?? store().stats,
  })
}

/** The stand-in id of another player's seed while its throw is replayed (startReplay) — no real seed has this id. */
export const REPLAY_SEED = 'replay'

// ─── Another player's turn, played out ──────────────────────────────

function startReplay(view: GameView, change: Happened, last: boolean) {
  const turn: TurnPlay = turnOf(change.events)!
  const old = store().game!
  const current = { view, change, last }
  replaying = current
  // The seed they cast is public now (it's about to land), so the game holds it in their first slot for the throw.
  // Their hand is all '?' (no ids), so it goes in as a stand-in piece, REPLAY_SEED — never a real seed's id.
  const thrown = turn.letter ? { id: REPLAY_SEED, letter: turn.letter } : null
  const game = thrown ? { ...old, hands: old.hands.map((hand, seat) => (seat === turn.seat ? [thrown, ...hand.slice(1)] : hand)) } : old
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
      if (turn.letter && turn.target) set({ cast: { seed: REPLAY_SEED, target: turn.target }, flying: true })
      else landed() // a move-only turn is just the glide
    }, glideMs)
  }, trailMs)
}

// ─── The link the store calls ───────────────────────────────────────

function post(action: Action) {
  const online = store().online
  if (!online) return
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
