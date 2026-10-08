// The lock on balance sims made of AI games (Muzzy 2026-10-07: "ai:balance can only be called after proper AI have
// been implemented and feel at a satisfactory development level"). Rules and awards tuned from AI games are only as
// good as the AI playing them, so these scripts wait for Muzzy's sign-off in content/ai/signoff.json.
import { readFileSync } from 'node:fs'

/** Stops the script (with a plain-English note) unless content/ai/signoff.json "balanceReady" is true. */
export function requireAiSignOff(scriptName) {
  const signoff = JSON.parse(readFileSync(new URL('../content/ai/signoff.json', import.meta.url), 'utf8'))
  if (signoff.balanceReady === true) return
  console.log(`${scriptName} is locked: it tunes the game from AI-vs-AI games, and the AI isn't signed off yet.
Muzzy signs it off once the AI personalities are built and feel right (Personality Check green + his own games):
content/ai/signoff.json → "balanceReady": true (and a line in "signedOff" saying when and why).`)
  process.exit(1)
}
