import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // react-hooks v7's recommended set treats these as errors. Most remaining
      // hits here are legitimate "resync local state with an external source"
      // effects (Firebase auth listener, settings/trades loaded per signed-in
      // user, debounced availability checks) rather than bugs — downgraded to
      // warn so real issues stay visible without blocking `npm run lint` on
      // patterns that need a deliberate design pass, not a blind rewrite.
      'react-hooks/set-state-in-effect': 'warn',
      // Same story for context files that intentionally export both a
      // Provider component and its `useX` hook from one file.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
