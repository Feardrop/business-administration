import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
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
      "react/prop-types": "off", // no PropTypes convention in this codebase
      "react-refresh/only-export-components": "warn",
      // matches this codebase's existing convention of `catch (_)` for a
      // deliberately-ignored error (see api.js)
      "no-unused-vars": ["error", { caughtErrorsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
];
