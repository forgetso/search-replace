module.exports = {
    env: {
        browser: true,
        es2022: true,
        node: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/stylistic',
        'plugin:json/recommended',
        'plugin:regexp/recommended',
        'prettier', // must be last! disables rules which conflict with prettier
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    plugins: [
        '@typescript-eslint',
        'unused-imports',
        '@html-eslint',
        'sort-imports-es6-autofix',
        // do not add prettier to plugins otherwise rule conflicts will occur between prettier and eslint! run prettier as a separate command
    ],
    rules: {
        '@typescript-eslint/no-unused-vars': 'warn', // allow unused vars
        '@typescript-eslint/no-explicit-any': 'warn', // allow any type
        '@typescript-eslint/prefer-for-of': 'warn', // allow indexed loops
        '@typescript-eslint/consistent-type-assertions': 'off', // needs tsconfig to be set up
        '@typescript-eslint/consistent-indexed-object-style': 'off', // allow indexed objects instead of Record<A, B>
        '@typescript-eslint/array-type': 'off', // allow Array<A> or A[]
        '@typescript-eslint/consistent-type-definitions': 'off', // allow type Foo = { a: string } or interface Foo { a: string }
        'no-unused-vars': 'off',
        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': 'off',
        'sort-imports': [
            'error',
            {
                ignoreDeclarationSort: true,
                allowSeparatedGroups: false,
            },
        ],
        'sort-imports-es6-autofix/sort-imports-es6': [
            2,
            {
                ignoreCase: false,
                ignoreMemberSort: false,
                memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
            },
        ],
        'json/*': ['error', { allowComments: true }],
    },
}
