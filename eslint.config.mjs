import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * eslint-config-next ships native flat configs, so they are spread directly
 * rather than going through FlatCompat.
 */
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      // The database is the source of truth for money; a stray `==` coercion
      // in economic code is worth failing the build over.
      eqeqeq: ["error", "always"],
    },
  },
];

export default config;
