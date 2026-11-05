import js from '@eslint/js';
import globals from 'globals';

const unusedVars = ['error', { args: 'after-used', caughtErrors: 'none' }];

export default [
    { ignores: ['node_modules/'] },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: { ...globals.browser, Chart: 'readonly', ChartDataLabels: 'readonly' }
        },
        rules: { 'no-unused-vars': unusedVars }
    },
    {
        files: ['sw.js'],
        languageOptions: { sourceType: 'script', globals: globals.serviceworker },
        rules: { 'no-unused-vars': unusedVars }
    },
    {
        // Apps Script llama a estas funciones por su nombre, por eso no se marcan como sin usar
        files: ['apps-script/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                ContentService: 'readonly',
                DriveApp: 'readonly',
                LockService: 'readonly',
                Logger: 'readonly',
                PropertiesService: 'readonly',
                ScriptApp: 'readonly',
                Session: 'readonly',
                SpreadsheetApp: 'readonly',
                Utilities: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', varsIgnorePattern: '^(doGet|doPost|backupSpreadsheet|installWeeklyBackup)$' }]
        }
    },
    {
        files: ['tests/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: { sourceType: 'module', globals: globals.node },
        rules: { 'no-unused-vars': unusedVars }
    }
];
