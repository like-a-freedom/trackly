import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vuePlugin from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default tseslint.config(
    {
        ignores: [
            "node_modules/",
            "dist/",
            "coverage/",
            "test-results/",
            "public/wasm/",
            "**/*.d.ts",
            "scripts/",
            "wasm/",
        ],
    },
    js.configs.recommended,
    {
        files: ["**/*.{js,ts,vue}"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parser: vueParser,
            parserOptions: {
                parser: tsParser,
                extraFileExtensions: [".vue"],
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2024,
                // Vue compiler macros
                defineProps: "readonly",
                defineEmits: "readonly",
                defineExpose: "readonly",
                withDefaults: "readonly",
                defineSlots: "readonly",
                defineModel: "readonly",
                // Test globals
                describe: "readonly",
                it: "readonly",
                test: "readonly",
                expect: "readonly",
                vi: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                beforeAll: "readonly",
                afterAll: "readonly",
                waitFor: "readonly",
                // Leaflet globals (L, GeoJSON are attached to window by Leaflet)
                L: "readonly",
                GeoJSON: "readonly",
                // Test utilities
                VueWrapper: "readonly",
                // Vue components referenced in tests
                TrackView: "readonly",
                // DOM types not in globals.browser
                RequestInit: "readonly",
                GeolocationPosition: "readonly",
            },
        },
        plugins: {
            vue: vuePlugin,
            "@typescript-eslint": tseslint.plugin,
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-console": "off",
            "no-debugger": "warn",
            "no-empty": ["error", { allowEmptyCatch: true }],
            "no-control-regex": "off",
            "no-inner-declarations": "off",
            "no-unused-vars": "off",
            // Vue rules
            "vue/no-mutating-props": "off",
            "vue/no-v-html": "off",
            "vue/require-default-prop": "off",
            "vue/require-prop-types": "off",
            "vue/multi-word-component-names": "off",
            "vue/one-component-per-file": "off",
            // TypeScript rules
            "@typescript-eslint/no-this-alias": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/consistent-type-imports": "off",
            "@typescript-eslint/consistent-type-exports": "off",
            "@typescript-eslint/no-require-imports": "off",
        },
    },
);
