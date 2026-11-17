// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno (npm: / jsr: specifiers), linted by `deno lint` instead.
    ignores: ['dist/*', 'supabase/functions/**', '.expo/*'],
  },
]);
