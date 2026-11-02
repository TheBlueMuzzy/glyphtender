import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import bmuz from './src/lint/rules.mjs' // bmuz lint (F90)

export default defineConfig([
  globalIgnores(['dist', 'src/ui/kit', 'src/audio', 'sketches', '.claude', 'src/devkit', 'vite-plugins/devkit', 'src/table', 'src/ai/kit', 'src/rooms', 'src/version', 'src/crashes', 'src/lint']), // src/ui/kit + src/audio = framework copies (linted there); sketches = throwaway prototypes; .claude = helpers' worktrees
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // bmuz lint (F90, install-lint): settings live in content/ (the Dev Kit and Obsidian edit them there), and React state
    // is never set every frame in useFrame. A real constant says why on its line: // tuning-ok: <why>
    // Player words live in content/text/en.json; anything else says why: // text-ok: <why>
    // Code that takes a clock option (now) uses it, never Date.now() beside it: // clock-ok: <why>
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/devkit-game/**', '**/*.test.*'],
    plugins: { bmuz },
    rules: { 'bmuz/no-state-in-frame': 'warn', 'bmuz/no-tuning-numbers': 'warn', 'bmuz/no-player-text': 'warn', 'bmuz/own-clock': 'error' },
  },
])
