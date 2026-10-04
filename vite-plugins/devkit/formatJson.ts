// HOW THE DEV KIT WRITES A JSON FILE — so a Save looks like the hand-written file it replaces: saving
// content/ai/personalities.json without changing anything leaves `git diff` empty. Used by the Save endpoint
// (devkitVite.ts), which hands it the file as it is on disk now.
//
// 1. KEEP WHAT THE FILE HAD. Every object and list that was already in the file stays the way it was written:
//    on one line, or spread over lines. Every value keeps its exact spelling if it didn't change (1.0 stays 1.0,
//    "\u00a0" stays "\u00a0"). Things are found by their place in the file ("ai.personality.Bully", "shifts.2").
// 2. ANYTHING NEW follows a rule of thumb (2 spaces, like a hand-written file):
//    - a list of only numbers / true / false / null: one line                   [8, 6, 4, 2, 1]
//    - an object or list of only plain values (text, numbers, true / false), if the line fits in 120 characters:
//      one line                                                                  { "min": 80, "max": 95 }
//    - anything else: spread over lines, one value per line.
//    Invisible characters in text (a non-breaking space…) are written as \u00a0, so they show in the file.
// The file itself is always spread over lines and ends with a newline.

/** The longest a NEW one-line object or list may make its line (indent and key included). */
export const LINE_LIMIT = 120

/** How the old file was written, by place: objects / lists → one line or not; plain values → their exact text. */
export type Layout = Map<string, { oneLine?: boolean; raw?: string }>

type Key = string | number
type Entry = [key: string | null, value: unknown] // key = null for a list item

const placeOf = (path: Key[]) => JSON.stringify(path)
const isPlain = (v: unknown) => v === null || typeof v !== 'object'
const isNumberish = (v: unknown) => v === null || typeof v === 'number' || typeof v === 'boolean'
const entriesOf = (value: object): Entry[] => (Array.isArray(value) ? value.map((v): Entry => [null, v]) : Object.entries(value))

// ---- 1. Reading how the old file was written ----

/** Walk the old file's text once and note how each object, list and value was written. Junk → an empty layout. */
export function readLayout(text: string): Layout {
  const layout: Layout = new Map()
  let at = 0
  let line = 0
  const skipSpace = () => {
    while (at < text.length && ' \t\r\n'.includes(text[at])) {
      if (text[at] === '\n') line++
      at++
    }
  }
  const skipText = () => {
    at++ // the opening "
    while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1
    at++ // the closing "
  }
  const readValue = (path: Key[]) => {
    skipSpace()
    const open = text[at]
    if (open === '{' || open === '[') {
      const startLine = line
      const close = open === '{' ? '}' : ']'
      at++
      skipSpace()
      if (text[at] === close) at++
      else {
        for (let index = 0; at < text.length; index++) {
          let key: Key = index
          if (open === '{') {
            skipSpace()
            const start = at
            skipText()
            key = JSON.parse(text.slice(start, at)) as string
            skipSpace()
            at++ // the :
          }
          readValue([...path, key])
          skipSpace()
          if (text[at++] !== ',') break // } or ] ends it
        }
      }
      layout.set(placeOf(path), { oneLine: line === startLine })
      return
    }
    const start = at
    if (open === '"') skipText()
    else while (at < text.length && !' \t\r\n,]}'.includes(text[at])) at++
    layout.set(placeOf(path), { raw: text.slice(start, at) })
  }
  try {
    JSON.parse(text) // only a readable file has a layout worth keeping
    readValue([])
  } catch {
    return new Map()
  }
  return layout
}

// ---- 2. Writing ----

// Non-breaking spaces, soft hyphens, zero-width and other invisible characters
const isInvisible = (code: number) =>
  code === 0xa0 || code === 0xad || (code >= 0x2000 && code <= 0x200f) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0xfeff

/** A plain value as JSON, with invisible characters written as \uXXXX. */
function plainText(value: unknown): string {
  let out = ''
  for (const char of JSON.stringify(value)) {
    const code = char.charCodeAt(0)
    out += isInvisible(code) ? `\\u${code.toString(16).padStart(4, '0')}` : char
  }
  return out
}

/** Writes one file. `layout` = how the old file was written (empty for a new file). */
function writer(layout: Layout) {
  /** A plain value: its old spelling if it's still the same value, else fresh. */
  function plain(value: unknown, path: Key[]): string {
    const raw = layout.get(placeOf(path))?.raw
    if (raw !== undefined) {
      try {
        if (Object.is(JSON.parse(raw), value)) return raw
      } catch { /* not readable — write it fresh */ }
    }
    return plainText(value)
  }

  /** An object or list on one line: [1, 2] or { "min": 80, "max": 95 }. */
  function joined(value: object, path: Key[]): string {
    const parts = entriesOf(value).map(([k, v], i) => {
      const at = [...path, k ?? i]
      return (k === null ? '' : `${plainText(k)}: `) + (isPlain(v) ? plain(v, at) : joined(v as object, at))
    })
    if (parts.length === 0) return Array.isArray(value) ? '[]' : '{}'
    return Array.isArray(value) ? `[${parts.join(', ')}]` : `{ ${parts.join(', ')} }`
  }

  /** Any value at this indent; `lead` = how many characters come before it on its line. */
  function write(value: unknown, path: Key[], indent: string, lead: number): string {
    if (isPlain(value)) return plain(value, path)
    const object = value as object
    const entries = entriesOf(object)
    const isList = Array.isArray(object)
    if (entries.length === 0) return isList ? '[]' : '{}'

    // 1. The file had it: keep it the way it was (the file itself is always spread over lines)
    const isFile = path.length === 0
    const wasOneLine = layout.get(placeOf(path))?.oneLine
    if (wasOneLine === true && !isFile) return joined(object, path)
    // 2. New: the rule of thumb
    if (wasOneLine === undefined && !isFile && entries.every(([, v]) => isPlain(v))) {
      const line = joined(object, path)
      const allNumbers = isList && entries.every(([, v]) => isNumberish(v))
      if (allNumbers || lead + line.length + 1 <= LINE_LIMIT) return line // + 1 for a comma after it
    }

    const inner = `${indent}  `
    const rows = entries.map(([k, v], i) => {
      const key = k === null ? '' : `${plainText(k)}: `
      return inner + key + write(v, [...path, k ?? i], inner, inner.length + key.length)
    })
    return `${isList ? '[' : '{'}\n${rows.join(',\n')}\n${indent}${isList ? ']' : '}'}`
  }

  return write
}

/** A whole file's text. `oldText` = the file as it is on disk now (keeps its layout); leave it out for a new file. */
export function formatJson(data: unknown, oldText?: string): string {
  const layout = oldText ? readLayout(oldText) : new Map()
  return `${writer(layout)(data, [], '', 0)}\n`
}
