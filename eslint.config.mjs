import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.vercel/**',
      '.opencode/**',
      'scripts/**',
      'plan.md',
      'package-lock.json',
      // apps/web (frontend) and supabase (dba) are owned by other agents;
      // root CI must not lint or fail on their in-progress files.
      'apps/web/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // NestJS CLI stubs are intentionally empty until features are implemented.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
