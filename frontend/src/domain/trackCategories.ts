/** Shared supported categories; user-defined categories remain valid. */
export const TRACK_CATEGORIES = [
    {value:'hiking',label:'Hiking'},
    {value:'running',label:'Running'},
    {value:'walking',label:'Walking'},
    {value:'cycling',label:'Cycling'},
    {value:'skiing',label:'Skiing'},
    {value:'other',label:'Other'},
];

export function validateCategories(categories: readonly string[]): string | null {
    if (categories.length > 50) return 'Choose at most 50 categories.';
    if (categories.some(category => new TextEncoder().encode(category).length > 100)) return 'Each category must fit within 100 UTF-8 bytes. Shorten the category and try again.';
    return null;
}
