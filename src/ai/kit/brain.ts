// THE AI MODULE — THE BRAIN. Turns one seat's view into one move, like a person across the table would.
//
// Each decision, in order:
//   1. Feel   — the game's readings (0–10) push traits around: mood shifts (danger → more caution…).
//   2. Lean   — every trait gets this turn's value, picked inside its (shifted, skill-blurred) range.
//   3. Special— the game may decide by itself first (draft, refresh, "call it").
//   4. Want   — walk the goal priority list: a goal wins when a d100 roll comes in at or under its trait's value.
//               None wins → the first goal.
//   5. Look   — imagine the hidden things (skill.worlds times), take up to skill.candidates moves from the plug.
//   6. Score  — each move: the main goal (0–1 among these moves) + each other goal (0–1) × (its steady weight +
//               nudge × its trait ÷ 100), averaged over the imagined worlds. Steady goals = what every move also tries
//               for ("try to score, but also try to bully"). The main goal sets the character; the nudge lets it pick
//               the hunt that ALSO spells.
//   7. Choose — keep the moves within skill.spread of the best, at most skill.topN, pick one weighted by score.
//   8. Explain— a Decision with a plain-English note (Dev Kit, bug reports — never players).
// It only ever sees the view it's given. All its randomness comes from the rng it's given (same game → same moves).
import { freshLine, linesFor, maybeSay, momentsFor, momentsWithCause, quietMemory, settingsAtLevel, type BanterLines, type BanterMemory, type BanterSettings, type ChatterLevel, type MomentMap } from './banter'
import { BANTER_SAVE, type BanterSaveLike } from './save'
import { botWait, paceNow, type PaceClock } from './pace'
import { nextRandom, randomBetween, shuffle, weightedPick } from './random'
import type { Context, Decision, GamePlug, Mode, Personality, Range, Skill } from './types'

export interface Brain<View, Action> {
  decide(view: View, seat: number, rng: number): { action: Action; rng: number; decision: Decision<Action> }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round = (v: number) => Math.round(v * 100) / 100

/** Plain-English problems with a personality for this game ([] = fine). The editor and the brain both use it. */
export function personalityProblems<View, Action, World>(p: Personality, plug: GamePlug<View, Action, World>, modes: Mode[] = []): string[] {
  const problems: string[] = []
  for (const sw of p.switches ?? []) {
    if (!modes.some((m) => m.id === sw.to)) problems.push(`${p.id}: switches to mode "${sw.to}", which isn't one of the game's modes (${modes.map((m) => m.id).join(', ') || 'none'})`)
  }
  for (const m of modes) {
    for (const id of m.goals ?? []) if (!plug.goals.some((g) => g.id === id)) problems.push(`mode ${m.id}: goal "${id}" isn't one of this game's goals`)
    if (m.goals && m.goals.length === 0) problems.push(`mode ${m.id}: its goal list is empty (leave it out to keep the personality's)`)
    for (const [trait, r] of Object.entries(m.traits ?? {})) {
      if (!(r.min >= 0 && r.max <= 100 && r.min <= r.max)) problems.push(`mode ${m.id}: trait "${trait}" range ${r.min}–${r.max} must be inside 0–100, low to high`)
    }
  }
  const goalIds = plug.goals.map((g) => g.id)
  for (const id of p.goals) if (!goalIds.includes(id)) problems.push(`${p.id}: goal "${id}" isn't one of this game's goals (${goalIds.join(', ')})`)
  for (const g of plug.goals) {
    if (!p.goals.includes(g.id)) problems.push(`${p.id}: goal "${g.id}" is missing from its priority list`)
    if (!p.traits[g.trait]) problems.push(`${p.id}: no range for trait "${g.trait}" (goal ${g.id})`)
  }
  for (const [trait, r] of Object.entries(p.traits)) {
    if (!(r.min >= 0 && r.max <= 100 && r.min <= r.max)) problems.push(`${p.id}: trait "${trait}" range ${r.min}–${r.max} must be inside 0–100, low to high`)
  }
  if (!(p.nudge >= 0 && p.nudge <= 1)) problems.push(`${p.id}: nudge ${p.nudge} must be 0–1`)
  if (p.focus !== undefined && !(p.focus >= 0 && p.focus <= 1)) problems.push(`${p.id}: focus ${p.focus} must be 0–1`)
  for (const [goal, v] of Object.entries(p.sight ?? {})) {
    if (!goalIds.includes(goal)) problems.push(`${p.id}: sight for "${goal}" isn't one of this game's goals`)
    if (!(v >= 0 && v <= 1)) problems.push(`${p.id}: sight ${goal} ${v} must be 0–1`)
  }
  return problems
}

/** The mode for this decision: the first switch whose reading matches, else home (null). */
export function modeFor(p: Personality, readings: Record<string, number>, modes: Mode[]): Mode | null {
  for (const sw of p.switches ?? []) {
    const r = readings[sw.reading]
    if (r === undefined) continue
    if ((sw.atLeast === undefined || r >= sw.atLeast) && (sw.atMost === undefined || r <= sw.atMost)) return modes.find((m) => m.id === sw.to) ?? null
  }
  return null
}

/** The personality as it plays in a mode: the mode's settings replace its own (traits trait by trait). */
export function inMode(p: Personality, mode: Mode | null): Personality {
  if (!mode) return p
  return {
    ...p,
    traits: { ...p.traits, ...(mode.traits ?? {}) },
    goals: mode.goals?.length ? mode.goals : p.goals,
    nudge: mode.nudge ?? p.nudge,
    focus: mode.focus ?? p.focus,
    steady: mode.steady ?? p.steady,
    sight: mode.sight ?? p.sight,
  }
}

/** This turn's trait ranges: the personality's, blurred by skill.wobble, moved by the mood shifts. */
export function shiftedRanges(p: Personality, skill: Skill, readings: Record<string, number>): { ranges: Record<string, Range>; shifts: Decision<unknown>['shifts'] } {
  const ranges: Record<string, Range> = {}
  for (const [trait, r] of Object.entries(p.traits)) {
    const centre = (r.min + r.max) / 2
    const half = (r.max - r.min) / 2 * (1 + skill.wobble) + 10 * skill.wobble
    ranges[trait] = { min: centre - half, max: centre + half }
  }
  const shifts: Decision<unknown>['shifts'] = []
  for (const s of p.shifts) {
    const reading = readings[s.reading]
    if (reading === undefined || !ranges[s.trait] || s.from === s.full) continue
    const share = clamp((reading - s.from) / (s.full - s.from), 0, 1)
    const by = round(share * s.by)
    if (by === 0) continue
    ranges[s.trait] = { min: ranges[s.trait].min + by, max: ranges[s.trait].max + by }
    shifts.push({ trait: s.trait, by, because: `${s.reading} ${round(reading)}` })
  }
  for (const trait of Object.keys(ranges)) ranges[trait] = { min: clamp(Math.round(ranges[trait].min), 0, 100), max: clamp(Math.round(ranges[trait].max), 0, 100) }
  return { ranges, shifts }
}

/** The goal roll: walk the priority list; a goal wins when d100 ≤ its trait's value this turn. None → the first. */
export function rollGoal(goalOrder: string[], traitOf: (goal: string) => string, traits: Record<string, number>, rng: number) {
  const rolls: Decision<unknown>['rolls'] = []
  let pos = rng
  for (const goal of goalOrder) {
    const r = randomBetween(pos, 1, 100)
    pos = r.rng
    const threshold = traits[traitOf(goal)] ?? 0
    rolls.push({ goal, threshold, roll: r.value })
    if (r.value <= threshold) return { goal, rolls, rng: pos }
  }
  return { goal: goalOrder[0], rolls, rng: pos }
}

export function makeBrain<View, Action, World>(plug: GamePlug<View, Action, World>, home: Personality, skill: Skill, modes: Mode[] = []): Brain<View, Action> {
  const problems = personalityProblems(home, plug, modes)
  if (problems.length) throw new Error(`This personality doesn't fit the game: ${problems.join('; ')}`)
  const goalById = new Map(plug.goals.map((g) => [g.id, g]))
  const traitOf = (goal: string) => goalById.get(goal)!.trait

  return {
    decide(view, seat, rng) {
      let pos = rng
      // 1–2. Feel + lean.
      const readings = plug.readings(view, seat)
      // 0. Which mode? A switch can put it heavily into another one (the Scholar threatened → Flight).
      const mode = modeFor(home, readings, modes)
      const personality = inMode(home, mode)
      const modeName = mode?.id ?? home.homeMode ?? home.id
      const modeText = mode ? ` [${mode.id}]` : ''
      const { ranges, shifts } = shiftedRanges(personality, skill, readings)
      const traits: Record<string, number> = {}
      for (const [trait, r] of Object.entries(ranges)) {
        const v = randomBetween(pos, r.min, r.max)
        pos = v.rng
        traits[trait] = v.value
      }
      // 5 (first world, needed by the special decision too).
      const worlds: World[] = []
      for (let i = 0; i < Math.max(1, skill.worlds); i++) {
        const w = plug.imagine(view, seat, pos)
        pos = w.rng
        worlds.push(w.world)
      }
      const ctxFor = (world: World): Context<View, World> => ({ view, world, seat, readings, traits, personality, skill, cache: new Map() })
      const contexts = worlds.map(ctxFor)

      // 3. A decision the game makes by itself?
      if (plug.special) {
        const s = plug.special(contexts[0], pos)
        pos = s.rng
        if (s.special) {
          const move = plug.describe(s.special.action, worlds[0])
          const note = `${personality.id}${modeText} — ${s.special.goal}: ${move} (${s.special.why})`
          return {
            action: s.special.action,
            rng: pos,
            decision: { action: s.special.action, goal: s.special.goal, rolls: [], readings, shifts, traits, considered: 1, mainGoalMattered: true, bigMoment: false, mode: modeName, chosen: { move, score: 1, why: [s.special.why] }, alternatives: [], note },
          }
        }
      }

      // 4. Want.
      const rolled = rollGoal(personality.goals, traitOf, traits, pos)
      pos = rolled.rng
      const main = goalById.get(rolled.goal)!

      // 5. Look.
      const c = plug.candidates(worlds[0], seat, Math.max(1, skill.candidates), pos)
      pos = c.rng
      const actions = c.actions
      if (!actions.length) throw new Error(`${personality.id} has no move to make (seat ${seat})`)

      // 6. Score: every goal that counts, averaged over the imagined worlds, then 0–1 within this decision.
      const steady = personality.steady ?? {}
      const others = plug.goals.filter((g) => g !== main && (personality.nudge > 0 || (steady[g.id] ?? 0) > 0))
      const sightOf = (goalId: string) => Math.min(1, Math.max(0, personality.sight?.[goalId] ?? 1))
      const scored = [main, ...others].map((goal) => {
        const clear = actions.map((a) => contexts.reduce((sum, ctx) => sum + goal.score(a, ctx).value, 0) / contexts.length)
        // Poor sight: each move's score for this goal is misjudged by up to (1 − sight) × the spread of this turn's
        // scores — it can't tell a closing trap from a safe spot as well as someone who sees it.
        const blur = (1 - sightOf(goal.id)) * (Math.max(...clear) - Math.min(...clear))
        const values = clear.map((v) => {
          if (blur <= 0) return v
          const r = nextRandom(pos)
          pos = r.rng
          return v + (r.value * 2 - 1) * blur
        })
        const lo = Math.min(...values)
        const hi = Math.max(...values)
        return { goal, values, norm: values.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0)), mattered: hi > lo }
      })
      // Each other goal adds its steady weight (goals every move tries for) + nudge × (its trait ÷ 100): a greedy
      // Bully still likes a hunt that spells, a Bully with no greed doesn't care. (Not a share split between the
      // goals — that made every one of them too faint.)
      const weightOf = (goalId: string) => (steady[goalId] ?? 0) + personality.nudge * (Math.max(0, traits[traitOf(goalId)] ?? 0) / 100)
      const combined = actions.map((_, i) => scored[0].norm[i] + scored.slice(1).reduce((s, g) => s + weightOf(g.goal.id) * g.norm[i], 0))

      // 7. Choose like a person. Focus first: only moves at least `focus` good for the main goal stay in the running
      //    (a Bully always picks a real hunt), then the nudge decides among them — identity from the main goal,
      //    strength from the others.
      const bigMoment = scored[0].mattered && (main.bigAt === undefined || Math.max(...scored[0].values) >= main.bigAt)
      const focus = bigMoment ? (personality.focus ?? 0) : 0
      const inFocus = actions.map((_, i) => i).filter((i) => scored[0].norm[i] >= focus - 1e-9)
      const best = Math.max(...inFocus.map((i) => combined[i]))
      const worst = Math.min(...inFocus.map((i) => combined[i]))
      const floor = best - (1 - skill.spread) * (best - worst)
      // Shuffled first, so equally good moves are equally likely (a person doesn't always take the first of a tie).
      const near = shuffle(inFocus.filter((i) => combined[i] >= floor - 1e-9), pos)
      pos = near.rng
      const order = near.items.sort((a, b) => combined[b] - combined[a]).slice(0, Math.max(1, skill.topN))
      const gap = best - worst || 1
      const pick = weightedPick(order, order.map((i) => combined[i] - floor + 0.05 * gap), pos)
      pos = pick.rng
      const chosenIndex = pick.item

      // 8. Explain.
      const why: string[] = []
      const mainWhy = main.score(actions[chosenIndex], contexts[0]).why
      if (mainWhy) why.push(mainWhy)
      for (const g of scored.slice(1)) {
        if (g.norm[chosenIndex] < 0.5 || !g.mattered) continue
        const w = g.goal.score(actions[chosenIndex], contexts[0]).why
        if (w) why.push(`also ${w}`)
      }
      const move = plug.describe(actions[chosenIndex], worlds[0])
      const won = rolled.rolls[rolled.rolls.length - 1]
      const rollText = won.roll <= won.threshold ? `${main.trait} ${won.threshold} vs roll ${won.roll}` : 'nothing rolled — first goal'
      const shiftText = shifts.length ? `; moods: ${shifts.map((s) => `${s.trait} ${s.by > 0 ? '+' : ''}${s.by} (${s.because})`).join(', ')}` : ''
      const flat = scored[0].mattered ? '' : ` (${main.id} saw no difference — the other goals chose)`
      const big = bigMoment && (personality.focus ?? 0) > 0 && main.bigAt !== undefined ? ' Big moment — went for it.' : ''
      const note = `${personality.id}${modeText} rolled ${main.id} (${rollText}${shiftText}).${big} ${move}${why.length ? ' — ' + why.join('; ') : ''}${flat}. Looked at ${actions.length}.`
      return {
        action: actions[chosenIndex],
        rng: pos,
        decision: {
          action: actions[chosenIndex],
          goal: main.id,
          rolls: rolled.rolls,
          readings,
          shifts,
          traits,
          considered: actions.length,
          mainGoalMattered: scored[0].mattered,
          bigMoment,
          mode: modeName,
          chosen: { move, score: round(combined[chosenIndex]), why },
          alternatives: order.filter((i) => i !== chosenIndex).slice(0, 3).map((i) => ({ move: plug.describe(actions[i], worlds[0]), score: round(combined[i]) })),
          note,
        },
      }
    },
  }
}

/** The brain in the Table's Bot shape: (view, seat, rng) → { action, rng }. `onDecision` hears every note. */
export function asBot<View, Action>(brain: Brain<View, Action>, onDecision?: (d: Decision<Action>, seat: number) => void) {
  return (view: View, seat: number, rng: number): { action: Action; rng: number } => {
    const { action, rng: next, decision } = brain.decide(view, seat, rng)
    onDecision?.(decision, seat)
    return { action, rng: next }
  }
}

// ─── Banter: bots talk through the emote module (F22) ───
// The game hands it its moment map (plug.moments), who the bots are, the banter settings, its lines (read live) and a
// say(seat, id). After every change it calls hear(events): each bot seat turns the events into its moments, rolls
// chance × chattiness (banter.ts maybeSay: cooldown, no repeats), and — a short moment later on the RULES clock, so the
// Dev Kit's full and half pause (and the game's own pause) stop it — says one line through say(), i.e. the emote
// module's emotes.say(seatId, id): the same bucket, the same bubble, the same mute. A line is an emote id
// (banter.<personality>.<moment>…), never words: each device looks its words up in its own text file.
//   Local:   say: (seat, id) => emotes.say(seatIdOf(seat), id).ok
//   Online:  bots speak from the SERVER — say: (seat, id) => room.emote(seatIdOf(seat), id). Never a client-side
//            say() online (it would go out as the player's own seat; the emotes module refuses it).
// At most one line waits per seat (a newer one replaces it); `tableGap` keeps a second bot from talking over the first.

/** One bot seat: its seat number and its personality (only id + chattiness are read — the lines are keyed by id). */
export interface BanterSeat {
  seat: number
  personality: Pick<Personality, 'id' | 'chattiness'>
}

export interface BotBanterOptions<Event> {
  /** The game's moment map: plug.moments. */
  moments: MomentMap<Event>
  /** The bot seats right now (a function: a bot can take over a seat mid-game, and the Dev Kit edits chattiness live). */
  bots: () => readonly BanterSeat[]
  /** content/ai/banter.json, read with readBanterSettings (a function → read each time, for live edits). */
  settings: BanterSettings | (() => BanterSettings)
  /** content/text/en.json "banter" — a function, read at every moment (never copied), so a line edited in the Dev Kit
   *  is used at the next moment without a reload. */
  lines: () => BanterLines | undefined
  /** Say it: the emote module's say (local) or the room's emote (online server). → true if it went out. */
  say: (seat: number, id: string) => boolean
  /** The game's seed (each seat gets its own randomness from it — botSeed). */
  seed: number
  /** The clock it waits on. Default: the bots' pace clock — the game's rules clock once it called setPaceClock. */
  clock?: PaceClock
  /** The player's "Bot chatter" (Settings → Off · Some · Lots) to start at — when there's no save. Default 'some'. */
  chatter?: ChatterLevel
  /** Where "Bot chatter" is kept: a saves-module save made with BANTER_SAVE (save.ts). With one, it starts at the
   *  saved level and setChatter keeps the new one. */
  save?: BanterSaveLike
  /** Is this bot seat muted on this device (local: (seat) => emotes.isMuted(seatIdOf(seat)))? A muted bot's lines are
   *  never said (and never hold up the table gap), and a person's good move is answered by an UNMUTED bot. Without
   *  it, a muted bot's line goes out and the emote module drops it — and the answer may go to a muted bot. Online
   *  (the server) leave it out: each device mutes for itself. */
  muted?: (seat: number) => boolean
}

export interface BotBanter {
  /** The player changed "Bot chatter" (applyBanterSetting calls it): live — Off drops any waiting line at once. */
  setChatter(level: ChatterLevel): void
  chatter(): ChatterLevel
  /** One change happened at the table: these are its events (all of them — each seat only hears what it may see). */
  hear(events: readonly unknown[]): void
  /** Stop: every waiting line is dropped (the game ended and was left, the screen closed). */
  stop(): void
  /** Lines waiting to be said right now (seat → emote id) — for tests and the Dev Kit. */
  waiting(): Record<number, string>
}

const paceClockNow = (): PaceClock => ({ now: paceNow, after: botWait })

export function botBanter<Event>(options: BotBanterOptions<Event>): BotBanter {
  const clock = options.clock ?? paceClockNow()
  let level: ChatterLevel = options.save ? BANTER_SAVE.clean(options.save.load()).chatter : options.chatter ?? 'some'
  // The file's numbers at the player's level (null = Off: nothing is said)
  const settingsNow = () => settingsAtLevel(typeof options.settings === 'function' ? options.settings() : options.settings, level)
  const memories = new Map<number, BanterMemory>()
  const rngs = new Map<number, number>()
  // (answer = a reply to a person's good move: it always waits out the table gap, and a bot's ordinary line never
  // replaces it)
  const waiting = new Map<number, { id: string; cancel: () => void; answer: boolean }>()
  let turn = 0
  let lastSpokeAt: number | null = null
  const rngOf = (seat: number) => rngs.get(seat) ?? botSeed(options.seed ^ 0xba7, seat)
  let tieRng = botSeed(options.seed ^ 0xa45, 0) // (which of two equally chatty bots answers a person)
  const isMuted = (seat: number) => options.muted?.(seat) === true

  // Someone spoke less than tableGap ago: wait for the gap once (a second bot answers a beat later, like people do) —
  // unless that would make the line later than delay.max + tableGap after its moment (then it's stale: let it go).
  // An answer to a person always waits: it must come.
  const speak = (seat: number, id: string, memory: BanterMemory, heardAt: number, answer: boolean) => {
    waiting.delete(seat)
    if (!options.bots().some((bot) => bot.seat === seat)) return // (a person took the seat back while the line waited)
    const settings = settingsNow()
    if (!settings) return // (chatter went Off while it waited)
    if (isMuted(seat)) return // (muted while it waited: nothing said, the table gap untouched)
    const gapMs = (settings.tableGap ?? 0) * 1000
    const left = lastSpokeAt === null ? 0 : gapMs - (clock.now() - lastSpokeAt)
    if (gapMs > 0 && left > 0) {
      const staleAfter = (settings.delay?.max ?? 0) * 1000 + gapMs
      if (answer || clock.now() + left - heardAt <= staleAfter) waiting.set(seat, { id, answer, cancel: clock.after(left, () => speak(seat, id, memory, heardAt, answer)) })
      return
    }
    if (!options.say(seat, id)) return // (false = refused; without a muted check a muted bot's line "goes out" and the emote module drops it)
    memories.set(seat, memory)
    lastSpokeAt = clock.now()
  }

  const schedule = (seat: number, id: string, memory: BanterMemory, settings: BanterSettings, answer: boolean) => {
    const delay = settings.delay ?? { min: 0, max: 0 }
    const wait = randomBetween(rngOf(seat), Math.round(delay.min * 1000), Math.round(delay.max * 1000))
    rngs.set(seat, wait.rng)
    waiting.get(seat)?.cancel()
    const heardAt = clock.now()
    waiting.set(seat, { id, answer, cancel: clock.after(wait.value, () => speak(seat, id, memory, heardAt, answer)) })
  }

  const dropWaiting = () => {
    for (const w of waiting.values()) w.cancel()
    waiting.clear()
  }

  return {
    setChatter(next) {
      if (next === level) return
      level = next
      if (level === 'off') dropWaiting()
      options.save?.save({ chatter: level })
    },
    chatter: () => level,
    hear(events) {
      turn += 1
      const settings = settingsNow()
      if (!settings) return // Off: the bots say nothing at all
      const lines = options.lines()
      const bots = options.bots()
      const botSeats = new Set(bots.map((bot) => bot.seat))
      const linesOf = (bot: BanterSeat, moment: string) => {
        const own = linesFor(lines, bot.personality.id, moment)
        return own.length ? own : settings.presets?.[moment] ?? []
      }

      // 1. A PERSON's good move always gets an answer (answerPeople — Muzzy 2026-10-23, "like Sparky in MTG Arena"):
      // exactly one bot, the chattiest unmuted one with a line for it (ties: the seed) — no chance roll, no cooldown.
      // The other bots let this change go (one reply, not a chorus — the table gap would queue them anyway).
      const answerable = settings.answerPeople ?? []
      const askers = bots.flatMap((bot) => {
        // (a missing chattiness counts as 0 — silent — like check:framework; never NaN in the "chattiest" pick below)
        if (!(Number.isFinite(bot.personality.chattiness) && bot.personality.chattiness > 0) || isMuted(bot.seat)) return []
        const hit = momentsWithCause(options.moments, events as Event[], bot.seat)
          .find((m) => answerable.includes(m.moment) && m.by !== undefined && !botSeats.has(m.by) && linesOf(bot, m.moment).length)
        return hit ? [{ bot, moment: hit.moment }] : []
      })
      if (askers.length) {
        const most = Math.max(...askers.map((a) => a.bot.personality.chattiness))
        const tied = askers.filter((a) => a.bot.personality.chattiness === most)
        const roll = nextRandom(tieRng)
        tieRng = roll.rng
        const { bot, moment } = tied[Math.floor(roll.value * tied.length)]
        const r = freshLine(linesOf(bot, moment), turn, memories.get(bot.seat) ?? quietMemory(), rngOf(bot.seat))
        rngs.set(bot.seat, r.rng)
        if (r.line) schedule(bot.seat, r.line, r.memory, settings, true)
        return
      }

      // 2. Everyone else's moments: chance × chattiness, the cooldown, no repeats.
      for (const bot of bots) {
        if (waiting.get(bot.seat)?.answer) continue // (its answer to a person comes first)
        if (isMuted(bot.seat)) continue
        const said = memories.get(bot.seat) ?? quietMemory()
        for (const moment of momentsFor(options.moments, events as Event[], bot.seat)) {
          const r = maybeSay(moment, turn, bot.personality.chattiness, linesOf(bot, moment), said, settings, rngOf(bot.seat))
          rngs.set(bot.seat, r.rng)
          if (!r.line) continue
          schedule(bot.seat, r.line, r.memory, settings, false)
          break // (one line per seat per change)
        }
      }
    },
    stop: dropWaiting,
    waiting: () => Object.fromEntries([...waiting].map(([seat, w]) => [seat, w.id])),
  }
}

/** A fresh rng position for a bot from a game's seed and its seat (so two bots in one game never mirror each other). */
export const botSeed = (gameSeed: number, seat: number) => nextRandom((gameSeed ^ 0x5eed) + seat * 7919).rng
