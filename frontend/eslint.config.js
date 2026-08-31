import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // Vite's React 18 JSX runtime doesn't need it
      "react/prop-types": "off", // props are typed via TS interfaces, not PropTypes
      "react-refresh/only-export-components": "warn",
      // tsconfig's noUnusedLocals/noUnusedParameters already catch this more
      // precisely (and run in CI's typecheck step) - avoid double-reporting.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { caughtErrorsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  }
);
