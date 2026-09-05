const trackColors: string[] = [
  '#0D3632',
  '#58D8CB',
  '#774EB7',
  '#26A497',
  '#76B0D6',
];
const colorMap = new Map<string, number>();
let colorMapNextIdx = 0;
export function getColorForId(id: string | undefined): string {
  if (!id) return trackColors[0] ?? '#0D3632';
  if (!colorMap.has(id)) {
    colorMap.set(id, colorMapNextIdx % trackColors.length);
    colorMapNextIdx++;
  }
  return trackColors[colorMap.get(id) ?? 0] ?? '#0D3632';
}
