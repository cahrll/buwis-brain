import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
];
