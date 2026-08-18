import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        // Un préfixe `_` marque une valeur volontairement ignorée : le reste
        // d'un destructuring, ou un contrôle qui n'existe qu'à la compilation.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // Le moteur est pur : rien du navigateur, rien de l'horloge ambiante.
  // Le test d'architecture (tests/architecture.test.ts) couvre les imports ;
  // ici on bloque au plus tôt les globales interdites.
  {
    files: ['src/engine/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Le moteur est pur (CLAUDE.md §4).' },
        { name: 'document', message: 'Le moteur est pur (CLAUDE.md §4).' },
        { name: 'localStorage', message: 'Le moteur est pur (CLAUDE.md §4).' },
        { name: 'navigator', message: 'Le moteur est pur (CLAUDE.md §4).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "Le temps courant se passe en paramètre, il ne se lit pas dans le moteur (CLAUDE.md §6).",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Le temps courant se passe en paramètre, il ne se lit pas dans le moteur (CLAUDE.md §6).",
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='round']",
          message:
            "Un seul point d'arrondi, dans roundingPolicy (CLAUDE.md §6). Passe par lui.",
        },
      ],
    },
  },
  {
    files: ['src/engine/primitives/roundingPolicy.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}', 'src/pdf/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', '*.config.ts', 'vitest.setup.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
)
