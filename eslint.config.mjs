import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default [
    {
        ignores: [
            "tests/**/*",
            "test/**/*",
            "!tests/**/*tests.js",
            "!test/**/*tests.js",
            "!tests/**/*_test.js",
            "!test/**/*_test.js",
            "!tests/**/*_helpers.js",
            "!test/**/*_helpers.js",
            "dist/**/*",
            "connectors/jquery/dist/**/*",
            "example/**/*",
            "src/**/*.ts",
        ],
    },
    ...compat.extends("eslint:recommended"),
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },

            ecmaVersion: 2020,
            sourceType: "module",
        },

        rules: {
            semi: ["warn", "always"],
            "comma-dangle": ["warn", "always-multiline"],
            "comma-style": ["warn", "last"],
            "no-var": ["warn"],

            "arrow-spacing": ["warn", {
                before: true,
                after: true,
            }],

            "space-infix-ops": ["warn", {
                int32Hint: true,
            }],

            "keyword-spacing": ["warn", {
                before: true,
                after: true,
            }],

            "space-unary-ops": ["warn", {
                words: true,
                nonwords: false,
            }],

            "comma-spacing": ["warn", {
                before: false,
                after: true,
            }],

            "object-curly-spacing": ["warn", "always"],

            "no-unused-vars": ["warn", {
                vars: "all",
                args: "after-used",
                varsIgnorePattern: "[iIgnored]|^_",
                ignoreRestSiblings: false,
                argsIgnorePattern: "^_",
                caughtErrors: "all",
                caughtErrorsIgnorePattern: "^ignore",
            }],

            "no-console": "warn",
            "no-extra-semi": "warn",
            "no-unreachable": "warn",

            "no-fallthrough": ["error", {
                commentPattern: "break[\\s\\w]*omitted|fallthrough",
            }],

            "no-useless-escape": "warn",
            "no-constant-condition": "warn",
            "no-return-await": "warn",
            "no-async-promise-executor": "warn",
        },
    }, {
        files: [
            "tests/**/*tests.js",
            "test/**/*tests.js",
            "tests/**/*_test.js",
            "test/**/*_test.js",
        ],

        languageOptions: {
            globals: {
                ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, "off"])),
                ...globals.node,
                ...globals.mocha,
                ...globals.jest,
            },
        },

        rules: {
            "no-console": "off",
        },
    }, {
        files: ["*db*/**/migrations/**/*.js"],

        rules: {
            "no-console": "off",
        },
    }, {
        files: ["scripts/**/*.js", "**/.eslintrc.js"],

        languageOptions: {
            globals: {
                ...Object.fromEntries(Object.entries(globals.browser).map(([key]) => [key, "off"])),
                ...globals.node,
            },
        },
    },
];
