// THE AUDIO MODULE'S PROMISE CHECKS — run by the Dev Kit's check-framework.mjs (npm run check:framework).
// MODULE-CONTRACTS.md "Audio":
//   - code says what happened (playSound('seed.land')); content/audio.json says what it sounds like — so game code
//     never names a sound file or makes its own Audio / AudioContext
//   - the Dev Kit's ⏸ Full pause silences it: the engine (0.3.0) hears the Dev Kit's 'devkit:pause' event itself
export const title = 'Audio'

export async function check(t) {
  {
    const name = 'sounds are named in code, described in content/audio.json'
    const problems = []
    if (!t.exists('content/audio.json')) problems.push('content/audio.json is missing — it\'s where every sound is described.')
    const code = t.gameCode()
    const direct = t.linesMatching(code, /\bnew\s+(Audio|AudioContext|webkitAudioContext)\s*\(/)
    const files = t.linesMatching(code, /['"`][^'"`]*\.(mp3|ogg|wav|m4a|webm|flac)['"`]/)
    if (direct.length) problems.push('Game code makes its own sound player (the audio module, its mixing and the Dev Kit\'s pause can\'t reach it):', ...direct.map((l) => '  ' + l))
    if (files.length) problems.push('Game code names a sound file:', ...files.map((l) => '  ' + l))
    if (problems.length) t.fail(name, problems.slice(0, 16), 'Say what happened — playSound(\'seed.land\') from src/audio — and list the files for it in content/audio.json (the Dev Kit\'s Sound tab edits them).')
    else t.pass(name, 'no file names or own players in game code')
  }
  {
    const name = 'the Dev Kit\'s full pause silences the sound'
    const engine = t.exists(`${t.rel}/engine.ts`) ? t.read(`${t.rel}/engine.ts`) : ''
    if (!engine.includes('devkit:pause')) t.fail(name, [`This copy of the audio module (${t.version}) doesn't listen for the Dev Kit's pause.`], 'Update it: node <framework>/audio/scripts/install-audio.mjs .')
    else if (!t.has('devkit')) t.skip(name, 'no Dev Kit in this game (nothing pauses it)')
    else t.pass(name, 'the engine suspends on the Dev Kit\'s devkit:pause (full), plays on at resume')
  }
}
