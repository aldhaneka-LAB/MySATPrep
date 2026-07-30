// Sound utility function
const AUDIO_CACHE_NAME = 'audio-cache-v1';
const objectUrlCache: Record<string, string> = {};

export const playSound = async (soundFile: string) => {
  try {
    const audioUrl = `/assets/audio/${soundFile}`;
    let finalUrl = audioUrl;

    if (objectUrlCache[audioUrl]) {
      finalUrl = objectUrlCache[audioUrl];
    } else if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cache = await caches.open(AUDIO_CACHE_NAME);
        let response = await cache.match(audioUrl);
        
        if (!response) {
          response = await fetch(audioUrl);
          if (response.ok) {
            cache.put(audioUrl, response.clone());
          }
        }

        if (response && response.ok) {
          const blob = await response.blob();
          finalUrl = URL.createObjectURL(blob);
          objectUrlCache[audioUrl] = finalUrl;
        }
      } catch (cacheError) {
        console.warn("Cache API error:", cacheError);
      }
    }

    const audio = new Audio(finalUrl);
    audio.volume = 0.5; // Set volume to 50%
    audio.play().catch((error) => {
      console.warn("Could not play sound:", error);
    });
  } catch (error) {
    console.warn("Audio not supported:", error);
  }
};
