const functions = require('firebase-functions');

async function calculateMileage(pickupLocation, deliveryLocation) {
  try {
    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!googleMapsApiKey) {
      functions.logger.warn("❌ Google Maps API key not found in environment variables");
      return null;
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?` +
      `origins=${encodeURIComponent(pickupLocation)}&` +
      `destinations=${encodeURIComponent(deliveryLocation)}&` +
      `units=imperial&` +
      `mode=driving&` +
      `key=${googleMapsApiKey}`;

    functions.logger.log("Calling Google Maps API for mileage calculation");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const mapsResponse = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'LoadMemo-TMS/1.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!mapsResponse.ok) {
        throw new Error(`Google Maps API returned ${mapsResponse.status}: ${mapsResponse.statusText}`);
      }
      
      const mapsData = await mapsResponse.json();
      functions.logger.log("Google Maps API response:", mapsData);

      if (mapsData.status === 'OK' && mapsData.rows[0]?.elements[0]?.status === 'OK') {
        const distanceText = mapsData.rows[0].elements[0].distance.text;
        const calculatedMileage = parseInt(distanceText.replace(/,/g, '').match(/\d+/)[0]);
        functions.logger.log(`✅ Auto-calculated mileage: ${calculatedMileage} miles`);
        return calculatedMileage;
      } else {
        functions.logger.warn("Google Maps API could not calculate distance:", mapsData);
        return null;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        functions.logger.warn("Google Maps API request timed out");
      } else {
        functions.logger.warn("Google Maps API fetch failed:", fetchError.message);
      }
      return null;
    }
  } catch (error) {
    functions.logger.error("❌ Mileage calculation error:", error);
    return null;
  }
}

module.exports = { calculateMileage };