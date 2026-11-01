// PSEUDO PAGE — the whole page in the long fake language (F91), to see which words won't fit once translated.
// It rewrites the words where they're drawn, the way a browser's translate button does, so every word is caught
// wherever it came from: content/text/en.json, the kit's English defaults, a module's words. React keeps working:
// when it changes a word, the new word is rewritten too.
//   - dev only: add ?pseudo to the game's address (applyStyle starts it), or call startPseudoPage() yourself
//   - also the words a screen reader says or a tooltip shows: title, aria-label, placeholder, alt
//   - never the Dev Kit (it's a tool, not the game) or code / style elements
//   - never what says translate="no" (0.37.0, F156): a player's name, initials, a room code stay the same in every
//     language — a browser's translate button leaves them too
//   - …nor those words inside any label (0.37.1, F161): a chip / seat button named after its player keeps the name
//     ("Ana"; "Remove Ana" → "[Ŕéɱöṽéŕé Ana]")
import { pseudo } from './blocks/words'

const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt']
const SKIP = 'script, style, noscript, code, pre, textarea, [data-devkit], #devkit-root, [translate="no"]'

const skipped = (node: Node) => {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return !element || !!element.closest(SKIP)
}

// What this pass wrote last, per text node / attribute: its own write comes back to it as a change, and must never be
// rewritten again (sprint 45: the Settings language picker's "日本語" has no accented letters, so the rewritten word
// didn't look done — each write came back and grew it, to 5 million characters and a stack overflow)
const wroteText = new WeakMap<Text, string>()
const wroteAttribute = new WeakMap<Element, Map<string, string>>()

function rewriteText(node: Text) {
  if (wroteText.get(node) === node.data || skipped(node)) return
  const next = pseudo(node.data)
  wroteText.set(node, next)
  if (next !== node.data) node.data = next
}

// The words the page never translates (0.37.1, F161): what's inside translate="no" (a player's name, a room code) and
// those parts' own labels. The same words in ANY label stay as written — a PlayerChip or a seat button is named after
// its player (aria-label) but holds words that are translated (a score, a badge), so it can't be translate="no" itself;
// the name drawn inside it is, and that marks the name. Gathered once per pass (a React commit arrives as one batch,
// the chip with its name inside it).
let keptWords: string[] = []
function gatherKeptWords() {
  const words = new Set<string>()
  for (const el of document.querySelectorAll('[translate="no"]')) {
    if (el.closest('[data-devkit], #devkit-root')) continue
    const text = el.textContent?.trim()
    if (text) words.add(text)
    for (const name of ATTRIBUTES) { const value = el.getAttribute(name)?.trim(); if (value) words.add(value) }
  }
  keptWords = [...words]
}

function rewriteAttributes(element: Element) {
  if (skipped(element)) return
  const wrote = wroteAttribute.get(element) ?? new Map<string, string>()
  wroteAttribute.set(element, wrote)
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name)
    if (value === null || wrote.get(name) === value) continue
    const next = pseudo(value, keptWords)
    wrote.set(name, next)
    if (next !== value) element.setAttribute(name, next)
  }
}

function rewriteAll(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return rewriteText(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return
  if (root.nodeType === Node.ELEMENT_NODE) rewriteAttributes(root as Element)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) rewriteText(node as Text)
    else rewriteAttributes(node as Element)
  }
}

let stopRunning: (() => void) | null = null

/** Rewrite the page's words into the long fake language, and keep doing it as they change. Returns stop(). */
export function startPseudoPage(root: Node = document.body): () => void {
  stopRunning?.()
  gatherKeptWords()
  rewriteAll(root)
  const observer = new MutationObserver((changes) => {
    gatherKeptWords()
    for (const change of changes) {
      if (change.type === 'characterData') rewriteText(change.target as Text)
      else if (change.type === 'attributes') rewriteAttributes(change.target as Element)
      else change.addedNodes.forEach(rewriteAll)
    }
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES })
  document.documentElement.dataset.pseudo = ''
  stopRunning = () => { observer.disconnect(); delete document.documentElement.dataset.pseudo; stopRunning = null }
  return stopRunning
}

/** ?pseudo in the address, in a dev build → the fake language (applyStyle calls this once at start-up). */
export function pseudoFromAddress() {
  if (!import.meta.env?.DEV || typeof location === 'undefined' || stopRunning) return
  if (!new URLSearchParams(location.search).has('pseudo')) return
  const start = () => startPseudoPage()
  if (document.body) start()
  else addEventListener('DOMContentLoaded', start, { once: true })
}
