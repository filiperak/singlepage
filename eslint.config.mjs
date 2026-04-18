import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore output
  { ignores: ['dist/**', 'scripts/**'] },

  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prefer explicit return types on public API surface
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Keep non-null assertions allowed — the codebase uses them after guards
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Allow 'any' only where explicitly cast ( SVGAnimatedString interop)
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
