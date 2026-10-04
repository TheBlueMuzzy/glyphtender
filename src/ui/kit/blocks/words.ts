// WORDS — every block's text is a `words` prop with English defaults (the …Words objects),
// so a game can pass its own from content/text/en.json and translate later.
//   <Pause words={text.pause} />      → only the words you pass change; the rest stay English
// fill('Round {n} of {total}', { n: 2, total: 5 }) → 'Round 2 of 5'
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))

// noOrphan('…from 18 moves to 7') → the last two words held together (a no-break space), so a wrapped sentence never
// leaves one short word alone on its last line. The kit's text also asks the browser for this (kit.css text-wrap:
// pretty); this makes sure of it in browsers that don't.
const NO_BREAK = String.fromCharCode(160) // a no-break space
export const noOrphan = (sentence: string) => sentence.replace(/ (\S+)\s*$/, `${NO_BREAK}$1`)
