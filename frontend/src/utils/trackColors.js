const trackColors = [
  '#0D3632',
  '#58D8CB',
  '#774EB7',
  '#26A497',
  '#76B0D6',
];
const colorMap = new Map();
let colorMapNextIdx = 0;
export function getColorForId(id) {
  if (!id) return trackColors[0];
  if (!colorMap.has(id)) {
    colorMap.set(id, colorMapNextIdx % trackColors.length);
    colorMapNextIdx++;
  }
  return trackColors[colorMap.get(id)];
}
