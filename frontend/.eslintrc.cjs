module.exports = {
    root: true,
    env: {
        browser: true,
        es2024: true,
        node: true,
        'vue/setup-compiler-macros': true,
    },
    globals: {
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        withDefaults: 'readonly',
        defineSlots: 'readonly',
        defineModel: 'readonly',
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    ignorePatterns: [
        'node_modules/',
        'dist/',
        'coverage/',
        'test-results/',
        'public/wasm/',
        '*.d.ts',
    ],
    extends: [
        'eslint:recommended',
        'plugin:vue/vue3-recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    plugins: ['vue', '@typescript-eslint'],
    rules: {
        'no-console': 'off',
        'no-debugger': 'warn',
        'no-empty': ['error', { allowEmptyCatch: true }],
        'no-control-regex': 'off',
        'no-inner-declarations': 'off',
        'vue/no-mutating-props': 'off',
        'vue/no-v-html': 'off',
        'vue/require-default-prop': 'off',
        'vue/require-prop-types': 'off',
        'vue/multi-word-component-names': 'off',
        '@typescript-eslint/no-this-alias': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
    },
    overrides: [
        {
            files: ['*.vue'],
            parser: 'vue-eslint-parser',
            parserOptions: {
                parser: '@typescript-eslint/parser',
                extraFileExtensions: ['.vue'],
            },
        },
        {
            files: ['*.ts', '*.tsx', '*.js'],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off',
            },
        },
        {
            files: [
                'src/**/__tests__/**/*.{js,ts}',
                'src/**/*.{test,spec}.{js,ts}',
                'test/**/*.{js,ts}',
                'e2e/**/*.ts',
            ],
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                waitFor: 'readonly',
            },
            rules: {
                'vue/one-component-per-file': 'off',
                'no-constant-condition': 'off',
            },
        },
        {
            files: ['scripts/**/*.js', 'test-format-duration.js'],
            rules: {
                '@typescript-eslint/no-var-requires': 'off',
                '@typescript-eslint/no-require-imports': 'off',
            },
        },
        {
            files: [
                'src/**/__tests__/**/*.{js,ts}',
                'src/**/*.{test,spec}.{js,ts}',
                'test/**/*.{js,ts}',
            ],
            rules: {
                '@typescript-eslint/no-require-imports': 'off',
            },
        },
    ],
};
