<template>
  <button 
    class="geolocation-button"
    @click="getCurrentLocation"
    :disabled="gettingLocation"
    :title="gettingLocation ? 'Getting location...' : 'Center map on current location'"
  >
    <svg v-if="!gettingLocation" class="geolocation-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m9.5 14.5-6.737-1.773c-.915-.241-1.015-1.5-.15-1.882l16.878-7.458c.71-.313 1.435.411 1.122 1.121l-7.458 16.879c-.383.865-1.641.765-1.882-.15L9.5 14.5z" />
    </svg>
    <svg v-else class="geolocation-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
    </svg>
  </button>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['location-found']);

const gettingLocation = ref(false);

const getCurrentLocation = async () => {
  if (!navigator.geolocation) {
    emit('location-found', { error: 'Geolocation is not supported by this browser' });
    return;
  }

  gettingLocation.value = true;

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // Cache for 1 minute
        }
      );
    });

    const { latitude, longitude } = position.coords;
    emit('location-found', { latitude, longitude });
    
  } catch (error) {
    let errorMessage = 'Unable to get your location';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location access denied by user';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out';
        break;
      default:
        errorMessage = 'An unknown error occurred while getting location';
        break;
    }
    
    emit('location-found', { error: errorMessage });
  } finally {
    gettingLocation.value = false;
  }
};
</script>

<style scoped>
.geolocation-button {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  color: #666;
  /* Force layer creation for better rendering */
  transform: translateZ(0);
  will-change: transform;
}

.geolocation-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.geolocation-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.geolocation-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

  .geolocation-icon {
    width: 22px;
    height: 22px;
    color: #666 !important;
  }

.geolocation-button:hover:not(:disabled) .geolocation-icon {
  color: #333;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Mobile adjustments to match other buttons */
@media (max-width: 640px) {
  .geolocation-button {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    /* Solid background for better visibility */
    background: #ffffff;
    backdrop-filter: none;
    border: 1px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .geolocation-button svg {
    width: 22px;
    height: 22px;
  }
}

/* Safari-specific mobile fixes */
@supports (-webkit-appearance: none) {
  @media (max-width: 640px) {
    .geolocation-button {
      background: #ffffff !important;
      backdrop-filter: none !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
      transform: translate3d(0, 0, 0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
  }
}
</style>
