export function capitalize(s) {
    if (!s) return '';
    const str = String(s);
    return str.charAt(0).toUpperCase() + str.slice(1);
}
