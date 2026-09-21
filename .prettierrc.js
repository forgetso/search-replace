module.exports = {
    trailingComma: 'es5',
    tabWidth: 4,
    semi: false,
    singleQuote: true,
    printWidth: 120,
    // Some files in assets/ are CRLF. Preserving whatever a file already uses keeps prettier
    // from rewriting every line of them just to change the line endings.
    endOfLine: 'auto',
}
