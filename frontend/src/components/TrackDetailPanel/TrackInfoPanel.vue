<script setup>
defineProps({
    track: { type: Object, required: true },
});

function formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Return 'Invalid Date' for invalid dates (matches test expectation)
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }
    // Format in 24-hour format without AM/PM
    const year = date.getFullYear();
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${day}, ${year}, ${hours}:${minutes}`;
}
</script>

<template>
    <!-- Track Metadata -->
    <div class="track-metadata">
        <h3>Track info</h3>
        <div class="metadata-grid">
            <div v-if="track.recorded_at" class="metadata-item">
                <span class="metadata-label">Recorded</span>
                <span class="metadata-value">{{ formatDateTime(track.recorded_at) }}</span>
            </div>
            <div v-if="track.created_at" class="metadata-item">
                <span class="metadata-label">Added</span>
                <span class="metadata-value">{{ formatDateTime(track.created_at) }}</span>
            </div>
            <div v-if="track.updated_at" class="metadata-item">
                <span class="metadata-label">Modified</span>
                <span class="metadata-value">{{ formatDateTime(track.updated_at) }}</span>
            </div>
        </div>
    </div>
</template>
