import { formatDuration } from './src/composables/useTracks.js';

console.log('Testing formatDuration:');
console.log('formatDuration(0):', formatDuration(0));
console.log('formatDuration(null):', formatDuration(null));
console.log('formatDuration(undefined):', formatDuration(undefined));
console.log('formatDuration(30):', formatDuration(30));
console.log('formatDuration(90):', formatDuration(90));
console.log('formatDuration(3661):', formatDuration(3661));
