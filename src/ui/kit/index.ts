// THE GAME UI KIT — copy this whole folder into a game's src/ui/kit/.
// Then: applyStyle(styleJson) once at start-up, and build screens from these parts.
// Needs React 18 or newer (tested on 18.3 and 19).
import './fonts/fonts.css'
import './kit.css'
import './art.css'

export * from './layout'
export * from './artStage'
export * from './controls'
export { screens } from './screens'
export { ScreenStack, useScreens } from './ScreenStack'
export { markPadUsed } from './keysOrPad'
export { applyStyle, resolveStyle, type StyleFile } from './style/applyStyle'
export { startPseudoPage } from './pseudoPage'
export { presets } from './styles'
export { firstFontName, fontValue, gameFontFaceCss, kitFonts, licenceLight, loadGameFonts, type FontLicence, type GameFont, type GameFontsFile } from './fonts/gameFonts'
export * from './blocks'
export * from './views'
export * from './drag'
export { useFixedSize, watchFixedSize, type Growth } from './fixedSize'
