import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "backend/dist/**",
      "frontend/dist/**",
      "coverage/**",
      "node_modules/**",
      "internal-docs/**",
      "frontend/src/lib/api/types.gen.ts",
      "frontend/src/lib/auth/permissionKeys.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // V2 frontend code: hook rules and accessibility rules (06 section 4). The
  // V1 feature files are excluded until each one is deleted by its sprint.
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    ignores: ["frontend/src/features/**", "frontend/src/app/**"],
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
);
