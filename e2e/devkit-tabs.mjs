// OPEN A DEV KIT TAB, wherever it is (B030): the one way every e2e script does it.
// On a phone the tabs row is a carousel, so a tab may be on a page before OR after the one showing.
// The Dev Kit loads a moment after the page, and much later on a busy PC: this waits for it to arrive (by waiting for
// the tab itself), and only then looks at where the tab is.

// tuning-ok: a test's patience, not a game value: long enough for a very busy PC, short enough to fail a real break
const ARRIVE_MS = 60_000
// tuning-ok: the carousel's slide (ms) between presses
const SLIDE_MS = 250

/** The Dev Kit must be open already (Backquote). `name` = the tab's whole text ("Words"). */
export async function pickTab(page, name) {
  const tab = page.locator('.devkit-tab', { hasText: new RegExp(`^${name}$`) })
  await tab.waitFor({ state: 'attached', timeout: ARRIVE_MS })
  // pressable = it's what's under its own centre (a tab half past the page's edge is masked off, not just "off")
  const inView = () => tab.evaluate((t) => {
    const box = t.getBoundingClientRect()
    return t.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  })
  const back = page.getByRole('button', { name: 'Previous tools' })
  for (let i = 0; i < 8 && !(await inView()) && (await back.isVisible()) && (await back.isEnabled()); i++) {
    await back.click()
    await page.waitForTimeout(SLIDE_MS)
  }
  for (let i = 0; i < 8 && !(await inView()); i++) {
    await page.getByRole('button', { name: 'Next tools' }).click()
    await page.waitForTimeout(SLIDE_MS)
  }
  await tab.click()
}
