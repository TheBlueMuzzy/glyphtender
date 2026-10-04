// DEV ONLY (never in a release build): add ?freeze to the address and the screen holds still, so the
// before / after screenshots (e2e/shots.mjs, npm run check:shots) come out exactly the same every run:
//   - the same "random" numbers every time: a new game's seed (src/ui/newGame.ts), the tray's shuffle
//     (src/store/turnPlan.ts) and anything else that rolls Math.random get one fixed sequence
//   - no CSS transitions (things jump straight to where they end up)
//   - the Highlights carousel doesn't move on by itself (GameOver.tsx)
//   - the Magic reveal doesn't step on by itself: it waits at the start until the script picks a step (Reveal.tsx)
// Animations still play — the script waits for them to end (a score pop's end is opacity 0, B007), and anything that
// loops forever (a glyphling's pulse) is stopped at its start while the picture is taken.
// In a release build import.meta.env.DEV is false, so `frozen` is always false and none of this ships.
export const frozen = import.meta.env.DEV && new URLSearchParams(window.location.search).has('freeze')

export function freezeScreen() {
  // The same dice every run: a plain "multiply and wrap" number sequence (Park–Miller), always starting at 1
  let n = 1
  Math.random = () => {
    n = (n * 16807) % 2147483647
    return (n - 1) / 2147483646
  }
  // No transitions anywhere (nothing waits on a transition's end, so turning them off is safe)
  const style = document.createElement('style')
  style.textContent = '*, *::before, *::after { transition: none !important; }'
  document.head.appendChild(style)
}
