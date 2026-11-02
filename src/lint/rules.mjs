// LINT — the coding standards every game checks itself (F90). Two ESLint rules, added to a game's eslint.config.js
// by install-lint.mjs. Plain JavaScript, no packages of its own: ESLint hands each rule the parsed code.
//
// bmuz/no-state-in-frame — React state set inside a useFrame callback. useFrame runs every frame (60+ times a second);
//   a state update there re-renders React every frame. Mutate a ref instead. A setter inside an `if` passes: that's the
//   "tell React only when it changed" pattern (Roll Better's RowChips: a ref remembers the faded chip, setDimmed only
//   when another one fades) — measured on four games, sprint 44.
//
// bmuz/no-tuning-numbers — a number that is a setting, written into game code instead of content/ (where Muzzy edits
//   it in the Dev Kit or Obsidian). It finds the two shapes a setting takes in code:
//     - a named one: a top-level `const POP_DURATION = 0.15`, or a top-level object of numbers (a settings group:
//       `const TRAP_WEIGHTS = { near: 5, far: 2 }`). Lists of numbers are data (winning lines, pip layouts): skipped.
//     - a timer: setTimeout / setInterval with a fixed delay.
//   Plain maths numbers never count (HARMLESS). A real constant — a save version, a rounding margin, a rule of the
//   game — says so on its line or the line above: `// tuning-ok: <why>`. Measured on four games (sprint 44): "every
//   number" found 131–3,957 per game; these two shapes found 1–53, mostly real settings.

const HARMLESS = new Set([0, 1, 2, -1, 0.5, 10, 100, 1000, 60, 180, 360, 255])

const numberOf = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value
  if (node?.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value
  return null
}
// `0.15 as const`, `{ … } satisfies Tuning` — look through TypeScript's wrappers
const unwrap = (node) => (node && (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') ? unwrap(node.expression) : node)
const isSetting = (node) => { const value = numberOf(unwrap(node)); return value !== null && !HARMLESS.has(value) }

// `// tuning-ok: <why>` (or `// text-ok: <why>`) on the statement's own line or the line above it
function markedOk(sourceCode, node, tag = 'tuning-ok') {
  const line = node.loc.start.line
  const note = new RegExp(`^\\s*${tag}:\\s*\\S`)
  return sourceCode.getAllComments().some((comment) => note.test(comment.value) && (comment.loc.end.line === line || comment.loc.end.line === line - 1 || comment.loc.start.line === node.loc.end.line))
}

const timerName = (callee) => (callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null)

const noTuningNumbers = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Settings (named numbers, timer delays) live in content/, not in game code' },
    schema: [],
    messages: {
      named: '{{name}} = {{value}} is a setting written into the code — move it to content/ (the Dev Kit and Obsidian edit it there), or say why it isn\'t one: // tuning-ok: <why>',
      group: '{{name}} holds {{count}} setting(s) written into the code — move them to content/ (the Dev Kit and Obsidian edit them there), or say why they aren\'t: // tuning-ok: <why>',
      timer: 'A {{value}} ms timer written into the code — put the time in content/ so it can be tuned, or say why it isn\'t a setting: // tuning-ok: <why>',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CallExpression(node) {
        if (!/^set(Timeout|Interval)$/.test(timerName(node.callee) ?? '')) return
        const delay = numberOf(unwrap(node.arguments[1]))
        if (delay === null || delay <= 0 || markedOk(sourceCode, node)) return
        context.report({ node: node.arguments[1], messageId: 'timer', data: { value: String(delay) } })
      },
      VariableDeclarator(node) {
        const declaration = node.parent
        const topLevel = declaration.parent.type === 'Program' || declaration.parent.type === 'ExportNamedDeclaration'
        if (declaration.kind !== 'const' || !topLevel || node.id.type !== 'Identifier') return
        const statement = declaration.parent.type === 'ExportNamedDeclaration' ? declaration.parent : declaration
        const init = unwrap(node.init)
        if (isSetting(init)) {
          if (!markedOk(sourceCode, statement)) context.report({ node, messageId: 'named', data: { name: node.id.name, value: String(numberOf(init)) } })
          return
        }
        if (init?.type !== 'ObjectExpression') return
        const settings = init.properties.filter((property) => property.type === 'Property' && isSetting(property.value))
        if (settings.length && !markedOk(sourceCode, statement)) context.report({ node, messageId: 'group', data: { name: node.id.name, count: String(settings.length) } })
      },
    }
  },
}

const isUseFrame = (node) => node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'useFrame'

const noStateInFrame = {
  meta: {
    type: 'problem',
    docs: { description: 'No React state updates every frame inside useFrame — mutate a ref' },
    schema: [],
    messages: {
      setter: '{{name}}() inside useFrame sets React state every frame — keep the value in a ref (ref.current = …) and read it where it\'s drawn; set state only when it really changes (inside an if)',
      store: 'setState() inside useFrame updates the store every frame — keep the value in a ref, or set it only when it really changes (inside an if)',
    },
  },
  create(context) {
    const setters = new Set() // useState / useReducer setters declared in this file
    const frames = [] // the useFrame calls we're inside
    // inside the frame callback, but not behind an if / ?: / && (the "only when it changed" pattern)
    const unconditional = (node) => {
      for (let n = node.parent; n && n !== frames.at(-1); n = n.parent) {
        if (n.type === 'IfStatement' || n.type === 'ConditionalExpression' || n.type === 'LogicalExpression' || n.type === 'SwitchCase') return false
      }
      return true
    }
    return {
      VariableDeclarator(node) {
        const init = node.init?.type === 'CallExpression' ? node.init.callee : null
        const hook = init?.type === 'Identifier' ? init.name : init?.type === 'MemberExpression' && !init.computed ? init.property.name : null
        if ((hook === 'useState' || hook === 'useReducer') && node.id.type === 'ArrayPattern' && node.id.elements[1]?.type === 'Identifier') setters.add(node.id.elements[1].name)
      },
      CallExpression(node) {
        if (isUseFrame(node)) { frames.push(node); return }
        if (!frames.length || !unconditional(node)) return
        const callee = node.callee
        if (callee.type === 'Identifier' && setters.has(callee.name)) context.report({ node, messageId: 'setter', data: { name: callee.name } })
        else if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'setState') context.report({ node, messageId: 'store' })
      },
      'CallExpression:exit'(node) { if (isUseFrame(node)) frames.pop() },
    }
  },
}

// bmuz/no-player-text (F91) — words a player reads, written into game code instead of content/text/en.json, where
//   the Dev Kit's Text tab edits them and a translation would replace them. On only in a game that keeps its words in
//   en.json (the installer decides). It finds three shapes, measured on four games (sprint 45):
//     - JSX text with letters: <p>Your turn</p>, {'Your turn'}
//     - a string in a prop the player reads: title, label, aria-label (a screen reader says it), placeholder, alt, …
//     - a sentence in a plain string — a capital, a space, words: setError('Room not found') (Roll Better's room
//       errors were the real gap: the screens' words had already moved)
//   Not player words, so never flagged: imports, object keys, console.*, Error messages, anything thrown, what a
//   rules `check` returns (the Table's refusal reasons — a game that shows one gives the player en.json words for it)
//   and the helpers it splits into, named check… (checkTurn, checkFor — lint 0.4.0, F167: Glyphtender's 16), and a
//   self-check's list, named …Problem(s) (the tutorial's railsProblems, a test wants it empty). The name must BE that
//   word: checkout, checkedLabel, noProblemsHere are still judged; so is a callback inside one (it has its own name).
//   Anything else that isn't for players (a Dev Kit report's label) says why: `// text-ok: <why>`.
const PLAYER_PROPS = new Set(['title', 'label', 'aria-label', 'aria-description', 'aria-roledescription', 'placeholder', 'alt',
  'text', 'message', 'heading', 'subtitle', 'caption', 'tooltip', 'hint', 'description', 'detail', 'confirmLabel', 'cancelLabel'])
const hasWords = (text) => /\p{L}{2,}/u.test(text)
const SENTENCE = /^\p{Lu}[\p{L}'’]*( [\p{L}\p{N}'’,.!?…—:;()-]+)+[.!?…]?$/u
const stringOf = (node) => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value
  : node?.type === 'TemplateLiteral' ? node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ') : null)
const calleeName = (callee) => (callee?.type === 'Identifier' ? callee.name : callee?.type === 'MemberExpression' && !callee.computed ? callee.property.name : null)
const functionName = (fn) => {
  const p = fn.parent
  if (fn.id?.name) return fn.id.name
  if ((p?.type === 'Property' || p?.type === 'MethodDefinition') && p.key.type === 'Identifier') return p.key.name
  if (p?.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name
  return null
}
// check, checkTurn, check_draft — not checkout / checked; railsProblems, jsonProblem, problems
const CHECK_NAME = /^check(?![a-z])|(^p|P)roblems?$/

const noPlayerText = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Words a player reads live in content/text/en.json, not in game code' },
    schema: [],
    messages: {
      jsx: '"{{text}}" is player text written into the code — put it in content/text/en.json and read it from there (the Dev Kit\'s Text tab edits it, a translation replaces it), or say why it isn\'t: // text-ok: <why>',
      prop: '{{prop}}="{{text}}" is player text written into the code — put it in content/text/en.json (a screen reader says aria-labels too), or say why it isn\'t: // text-ok: <why>',
      sentence: '"{{text}}" looks like words a player reads — put them in content/text/en.json, or say why they aren\'t: // text-ok: <why>',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    const short = (text) => (text.length > 40 ? `${text.slice(0, 40)}…` : text).replace(/\s+/g, ' ').trim()
    const report = (node, messageId, data) => { if (!markedOk(sourceCode, node, 'text-ok')) context.report({ node, messageId, data }) }
    // a string that isn't for players because of where it sits
    const notForPlayers = (node) => {
      for (let n = node.parent, child = node; n; child = n, n = n.parent) {
        if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ExportNamedDeclaration' && n.source === child) return true
        if (n.type === 'ImportExpression' || n.type === 'ThrowStatement' || n.type.startsWith('TS')) return true
        if (n.type === 'Property' && n.key === child) return true
        if ((n.type === 'CallExpression' || n.type === 'NewExpression') && n.callee !== child) {
          const name = calleeName(n.callee)
          if (n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'console') return true
          // Error / TypeError / RoomError messages — capitalised, so a game's own setError('Room not found') still counts
          if (/^[A-Z]\w*Error$/.test(name ?? '') || name === 'require') return true
        }
        if (n.type === 'JSXAttribute') return true // props are judged by name, below
        if (n.type.endsWith('FunctionExpression') || n.type === 'FunctionDeclaration') return CHECK_NAME.test(functionName(n) ?? '')
      }
      return false
    }
    return {
      JSXText(node) {
        if (hasWords(node.value)) report(node, 'jsx', { text: short(node.value) })
      },
      JSXExpressionContainer(node) {
        const text = stringOf(node.expression)
        if (node.parent.type !== 'JSXAttribute' && text && hasWords(text)) report(node, 'jsx', { text: short(text) })
      },
      JSXAttribute(node) {
        const prop = node.name.type === 'JSXIdentifier' ? node.name.name : null
        if (!prop || !PLAYER_PROPS.has(prop)) return
        const value = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value
        const text = stringOf(value)
        if (text && hasWords(text)) report(node, 'prop', { prop, text: short(text) })
      },
      Literal(node) {
        if (typeof node.value !== 'string' || !SENTENCE.test(node.value.trim()) || node.parent.type === 'JSXExpressionContainer') return
        if (!notForPlayers(node)) report(node, 'sentence', { text: short(node.value) })
      },
    }
  },
}

// bmuz/own-clock (lint 0.3.0, F157) — code that takes a clock option (`now`) and still reads the real clock with
//   Date.now() somewhere else in the same file. Tests pin `now` to a fixed date; the stray Date.now() keeps reading
//   today, so the test passes the day it's written and goes red on its own once the fixed date is old enough (saves
//   0.6.4's loadLinkCode: a 7-day link code "expired" a week after its test's 2026-10-20 clock).
//   A file takes a clock when it has a `{ now }` option or reads `something.now` (a plain parameter named now is just
//   a time it was handed — the alarm that calls tidy(Date.now()) is where the real time belongs; measured, sprint 47).
//   Fine: the fallback itself — a default value (`now = () => Date.now()`) or `options.now?.() ?? Date.now()` — and
//   the clock's own definition (`now: () => …`, `const realNow = () => …`, a name ending in now/Now or with "clock").
//   A real one (a log line's own time stamp) says why on its line or the line above: `// clock-ok: <why>`.
const isDateNow = (node) => node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed
  && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Date' && node.callee.property.name === 'now'
// a `{ now }` option among a function's parameters (also `{ now = … }`, `{ clock: { now } }`, `opts = { now }`)
const optionsHaveNow = (pattern) => {
  if (!pattern) return false
  if (pattern.type === 'AssignmentPattern') return optionsHaveNow(pattern.left)
  if (pattern.type === 'ObjectPattern') return pattern.properties.some((p) => p.type === 'Property' && ((p.key.type === 'Identifier' && p.key.name === 'now') || optionsHaveNow(p.value)))
  return false
}
// a clock's own name, exactly: now, clock, or …Now (realNow, clockNow) — not "know" or "snow" (review, sprint 47)
const CLOCK_NAME = /^(now|clock)$|Now$/
const nameOf = (node) => (node?.type === 'Identifier' ? node.name : null)
const FUNCTION = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/
// a function's name: its own, or what it's assigned to (a variable, an object key, a method, a class field)
const clockHolderName = (fn) => {
  const parent = fn.parent
  if (fn.id) return fn.id.name
  if (parent.type === 'VariableDeclarator') return nameOf(parent.id)
  if (/^(Property|MethodDefinition|PropertyDefinition)$/.test(parent.type)) return nameOf(parent.key)
  return null
}
// Date.now() as the fallback, or inside the clock's own definition:
//   - anywhere inside a default value (`now = () => Date.now()`, `{ now = () => (ok ? Date.now() : 0) }`)
//   - the right side of ?? / ||, itself (`options.now?.() ?? Date.now()` — not `name || \`at ${Date.now()}\``)
//   - in a function named as a clock — the one that holds the call, not one further out (a callback inside
//     startClock is not the clock)
const isFallback = (node) => {
  const parent = node.parent
  if (parent.type === 'LogicalExpression' && (parent.operator === '??' || parent.operator === '||') && parent.right === node) return true
  let holder = null
  for (let child = node, up = node.parent; up; child = up, up = up.parent) {
    if (up.type === 'AssignmentPattern' && up.right === child) return true
    if (!holder && FUNCTION.test(up.type)) holder = up
    if (up.type === 'Program') break
  }
  const named = holder && clockHolderName(holder)
  return !!named && CLOCK_NAME.test(named)
}
// `x.now` that is one of the browser's / a library's own clocks, not a clock option: Date.now, performance.now,
// window.performance.now, globalThis.performance.now, luxon's DateTime.now, Temporal.Now
const BUILT_IN_CLOCK = /^(Date|performance|DateTime|Temporal)$/
const isBuiltInClock = (object) => (object.type === 'Identifier' && BUILT_IN_CLOCK.test(object.name))
  || (object.type === 'MemberExpression' && !object.computed && object.property.type === 'Identifier' && object.property.name === 'performance')
const ownClock = {
  meta: {
    type: 'problem',
    docs: { description: 'Code that takes a clock option (now) never reads the real clock with Date.now() beside it' },
    schema: [],
    messages: {
      stray: 'Date.now() in a file that takes a clock option (now) — use the clock it was given, so a test with a fixed date stays right next week; or say why it must be the real clock: // clock-ok: <why>',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    let takesClock = false
    const calls = []
    const params = (node) => { if (node.params.some(optionsHaveNow)) takesClock = true }
    return {
      FunctionDeclaration: params, FunctionExpression: params, ArrowFunctionExpression: params,
      MemberExpression(node) {
        if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'now' && !isBuiltInClock(node.object)) takesClock = true
      },
      CallExpression(node) { if (isDateNow(node)) calls.push(node) },
      'Program:exit'() {
        if (!takesClock) return
        for (const call of calls) if (!isFallback(call) && !markedOk(sourceCode, call, 'clock-ok')) context.report({ node: call, messageId: 'stray' })
      },
    }
  },
}

export const rules = { 'no-state-in-frame': noStateInFrame, 'no-tuning-numbers': noTuningNumbers, 'no-player-text': noPlayerText, 'own-clock': ownClock }
export default { meta: { name: 'bmuz' }, rules }
