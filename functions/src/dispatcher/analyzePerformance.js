const { onCall } = require('firebase-functions/v2/https');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================
// analyzeDispatcherPerformance
// Cloud Function (v2) — calls Gemini to rate dispatcher 1-5
// ============================================================
exports.analyzeDispatcherPerformance = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Must be authenticated');
  }

  const { loads, dispatcherName, timeFrame } = request.data;

  if (!loads || loads.length === 0) {
    throw new Error('No loads provided for analysis');
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured in environment');
  }

  try {
    const timeline          = buildLoadTimeline(loads);
    const deadheadAnalysis  = calculateDeadheadSequences(timeline, loads);
    const geographicAnalysis = analyzeGeographicClustering(loads);
    const driverUtilization = analyzeDriverUtilization(loads);
    const metrics           = calculatePerformanceMetrics(loads, deadheadAnalysis);

    const prompt = buildGeminiPrompt(
      dispatcherName, timeFrame, loads,
      timeline, deadheadAnalysis, geographicAnalysis,
      driverUtilization, metrics
    );

    const genAI  = new GoogleGenerativeAI(geminiApiKey);
    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const aiAnalysis = result.response.text();
    const rating     = extractRating(aiAnalysis);

    return {
      success: true,
      rating,
      aiAnalysis,
      metrics,
      deadheadAnalysis,
      geographicAnalysis,
      driverUtilization,
      timeline: timeline.slice(0, 20),
    };
  } catch (error) {
    console.error('Error in analyzeDispatcherPerformance:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }
});

// ============================================================
// buildLoadTimeline
// Converts load docs into a flat, chronological event list
// ============================================================
function buildLoadTimeline(loads) {
  const events = [];

  loads.forEach((load) => {
    if (load.actualPU) {
      const ts = load.actualPU.toDate ? load.actualPU.toDate() : new Date(load.actualPU);
      events.push({
        type:      'pickup',
        loadId:    load.load_id || load.id,
        driverId:  load.driverId,
        timestamp: ts,
        location:  load.pickupLocation,
        city:      extractCity(load.pickupLocation),
        state:     extractState(load.pickupLocation),
        lat:       load.pickupLat || load.puLat,
        lng:       load.pickupLng || load.puLng,
      });
    }

    if (load.actualDEL) {
      const ts = load.actualDEL.toDate ? load.actualDEL.toDate() : new Date(load.actualDEL);
      events.push({
        type:      'delivery',
        loadId:    load.load_id || load.id,
        driverId:  load.driverId,
        timestamp: ts,
        location:  load.deliveryLocation,
        city:      extractCity(load.deliveryLocation),
        state:     extractState(load.deliveryLocation),
        lat:       load.deliveryLat || load.delLat,
        lng:       load.deliveryLng || load.delLng,
      });
    }
  });

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// ============================================================
// calculateDeadheadSequences
// Groups events by driver, then measures miles between
// each delivery → next pickup (handles multi-load routing)
// ============================================================
function calculateDeadheadSequences(timeline, loads) {
  const deadheadSegments = [];
  const driverTimelines  = {};

  timeline.forEach((event) => {
    if (!event.driverId) return;
    if (!driverTimelines[event.driverId]) driverTimelines[event.driverId] = [];
    driverTimelines[event.driverId].push(event);
  });

  Object.values(driverTimelines).forEach((events) => {
    for (let i = 0; i < events.length - 1; i++) {
      const cur  = events[i];
      const next = events[i + 1];

      if (cur.type === 'delivery' && next.type === 'pickup') {
        const miles = Math.round(calculateDistance(cur.lat, cur.lng, next.lat, next.lng));

        deadheadSegments.push({
          driverId: cur.driverId,
          from: {
            loadId:    cur.loadId,
            location:  `${cur.city}, ${cur.state}`,
            timestamp: cur.timestamp,
          },
          to: {
            loadId:    next.loadId,
            location:  `${next.city}, ${next.state}`,
            timestamp: next.timestamp,
          },
          miles,
          hoursGap: (next.timestamp - cur.timestamp) / (1000 * 60 * 60),
        });
      }
    }
  });

  const totalDeadheadMiles = deadheadSegments.reduce((sum, s) => sum + s.miles, 0);
  const totalLoadedMiles   = loads.reduce((sum, l) => sum + (l.mileage || 0), 0);
  const deadheadPercentage =
    totalLoadedMiles > 0
      ? (totalDeadheadMiles / (totalLoadedMiles + totalDeadheadMiles)) * 100
      : 0;

  return {
    segments:         deadheadSegments,
    totalDeadheadMiles,
    averageDeadhead:  deadheadSegments.length > 0 ? totalDeadheadMiles / deadheadSegments.length : 0,
    deadheadPercentage: Math.round(deadheadPercentage * 10) / 10,
    segmentCount:     deadheadSegments.length,
  };
}

// ============================================================
// analyzeGeographicClustering
// ============================================================
function analyzeGeographicClustering(loads) {
  const stateGroups = {};
  const regionGroups = {
    west:      ['CA', 'NV', 'OR', 'WA', 'AZ', 'UT', 'ID', 'MT', 'WY', 'CO', 'NM'],
    midwest:   ['IL', 'IN', 'OH', 'MI', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'],
    south:     ['TX', 'OK', 'AR', 'LA', 'MS', 'AL', 'TN', 'KY', 'GA', 'FL', 'SC', 'NC', 'VA', 'WV'],
    northeast: ['PA', 'NY', 'NJ', 'CT', 'MA', 'RI', 'VT', 'NH', 'ME', 'DE', 'MD'],
  };

  loads.forEach((load) => {
    const ps = extractState(load.pickupLocation);
    const ds = extractState(load.deliveryLocation);
    stateGroups[ps] = (stateGroups[ps] || 0) + 1;
    stateGroups[ds] = (stateGroups[ds] || 0) + 1;
  });

  const regionCounts = {};
  Object.entries(stateGroups).forEach(([state, count]) => {
    for (const [region, states] of Object.entries(regionGroups)) {
      if (states.includes(state)) {
        regionCounts[region] = (regionCounts[region] || 0) + count;
      }
    }
  });

  const topRegion = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0];
  const topStates = Object.entries(stateGroups).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    stateGroups,
    regionCounts,
    topRegion:      topRegion ? topRegion[0] : 'none',
    topStates,
    clusteringScore: calculateClusteringScore(loads),
  };
}

function calculateClusteringScore(loads) {
  if (loads.length < 2) return 100;

  let totalDistance = 0;
  let pairCount     = 0;

  for (let i = 0; i < loads.length - 1; i++) {
    for (let j = i + 1; j < loads.length; j++) {
      const a = loads[i];
      const b = loads[j];
      if (a.pickupLat && a.pickupLng && b.pickupLat && b.pickupLng) {
        totalDistance += calculateDistance(a.pickupLat, a.pickupLng, b.pickupLat, b.pickupLng);
        pairCount++;
      }
    }
  }

  const avg = pairCount > 0 ? totalDistance / pairCount : 0;
  if (avg < 500)  return 100;
  if (avg < 1000) return 75;
  if (avg < 1500) return 50;
  return 25;
}

// ============================================================
// analyzeDriverUtilization
// ============================================================
function analyzeDriverUtilization(loads) {
  const driverStats = {};

  loads.forEach((load) => {
    const id = load.driverId || 'unassigned';
    if (!driverStats[id]) {
      driverStats[id] = { loadCount: 0, totalMiles: 0, totalRevenue: 0, loads: [] };
    }
    driverStats[id].loadCount++;
    driverStats[id].totalMiles   += load.mileage || 0;
    driverStats[id].totalRevenue += load.amount  || 0;
    driverStats[id].loads.push(load.load_id || load.id);
  });

  const driverCount       = Object.keys(driverStats).length;
  const loadCounts        = Object.values(driverStats).map((d) => d.loadCount);
  const avgLoadsPerDriver = loadCounts.reduce((a, b) => a + b, 0) / driverCount;
  const maxLoads          = Math.max(...loadCounts);
  const minLoads          = Math.min(...loadCounts);

  const variance    = loadCounts.reduce((sum, c) => sum + Math.pow(c - avgLoadsPerDriver, 2), 0) / driverCount;
  const balanceScore = Math.max(0, 100 - Math.sqrt(variance) * 20);

  return {
    driverStats,
    driverCount,
    avgLoadsPerDriver: Math.round(avgLoadsPerDriver * 10) / 10,
    maxLoads,
    minLoads,
    balanceScore: Math.round(balanceScore),
  };
}

// ============================================================
// calculatePerformanceMetrics
// ============================================================
function calculatePerformanceMetrics(loads, deadheadAnalysis) {
  const totalLoads   = loads.length;
  const totalRevenue = loads.reduce((sum, l) => sum + (l.amount  || 0), 0);
  const totalMiles   = loads.reduce((sum, l) => sum + (l.mileage || 0), 0);

  const withDates = loads.filter((l) => l.actualPU && l.actualDEL);
  const avgDeliveryHours =
    withDates.length > 0
      ? withDates.reduce((sum, l) => {
          const pu  = l.actualPU.toDate  ? l.actualPU.toDate()  : new Date(l.actualPU);
          const del = l.actualDEL.toDate ? l.actualDEL.toDate() : new Date(l.actualDEL);
          return sum + (del - pu) / (1000 * 60 * 60);
        }, 0) / withDates.length
      : 0;

  return {
    totalLoads,
    totalRevenue,
    totalMiles,
    avgRevenuePerLoad:    Math.round((totalLoads   > 0 ? totalRevenue / totalLoads : 0) * 100) / 100,
    revenuePerMile:       Math.round((totalMiles   > 0 ? totalRevenue / totalMiles : 0) * 100) / 100,
    avgDeliveryTimeHours: Math.round(avgDeliveryHours * 10) / 10,
    deadheadPercentage:   deadheadAnalysis.deadheadPercentage,
  };
}

// ============================================================
// buildGeminiPrompt
// ============================================================
function buildGeminiPrompt(
  dispatcherName, timeFrame, loads,
  timeline, deadheadAnalysis, geographicAnalysis,
  driverUtilization, metrics
) {
  const deadheadSample = deadheadAnalysis.segments
    .slice(0, 5)
    .map((s) => `  • ${s.from.location} → ${s.to.location}: ${s.miles} mi (${Math.round(s.hoursGap)}h gap)`)
    .join('\n');

  const timelineSample = timeline
    .slice(0, 10)
    .map((e) =>
      `  ${e.timestamp.toLocaleDateString()} ${e.timestamp.toLocaleTimeString()} — ` +
      `${e.type.toUpperCase()}: Load ${e.loadId} at ${e.city}, ${e.state}`
    )
    .join('\n');

  const topStates = geographicAnalysis.topStates
    .map(([state, count]) => `${state}(${count})`)
    .join(', ');

  return `You are an expert transportation logistics analyst. Analyze the following dispatcher's performance and provide a comprehensive evaluation.

DISPATCHER: ${dispatcherName}
TIME PERIOD: ${timeFrame} (${loads.length} loads)

PERFORMANCE METRICS:
- Total Loads: ${metrics.totalLoads}
- Total Revenue: $${metrics.totalRevenue.toLocaleString()}
- Total Miles: ${metrics.totalMiles.toLocaleString()}
- Revenue per Mile: $${metrics.revenuePerMile}
- Average Delivery Time: ${metrics.avgDeliveryTimeHours} hours
- Deadhead Percentage: ${metrics.deadheadPercentage}% (Industry standard: 15–20%)

DEADHEAD ANALYSIS:
- Total Deadhead Miles: ${deadheadAnalysis.totalDeadheadMiles}
- Average Deadhead per Segment: ${Math.round(deadheadAnalysis.averageDeadhead)} miles
- Deadhead Segments: ${deadheadAnalysis.segmentCount}
${deadheadSample}

GEOGRAPHIC CLUSTERING:
- Primary Region: ${geographicAnalysis.topRegion}
- Top States: ${topStates}
- Clustering Score: ${geographicAnalysis.clusteringScore}/100

DRIVER UTILIZATION:
- Total Drivers: ${driverUtilization.driverCount}
- Average Loads per Driver: ${driverUtilization.avgLoadsPerDriver}
- Load Balance Score: ${driverUtilization.balanceScore}/100
- Load Distribution: ${driverUtilization.minLoads} to ${driverUtilization.maxLoads} loads per driver

CHRONOLOGICAL TIMELINE (first 10 events):
${timelineSample}

TASK — provide a structured analysis with:
1. Overall Rating — format exactly as "RATING: X/5" on its own line.
2. Strengths — 2–3 items using ✅ emoji
3. Areas for Improvement — 2–3 items using ⚠️ (minor) or ❌ (major) emoji
4. Specific Recommendations — 2–3 actionable items referencing actual load IDs / locations
5. Industry Comparison — how does this dispatcher compare to industry benchmarks?

Be specific and constructive. Reference actual data from above.`;
}

// ============================================================
// extractRating  — pulls the numeric rating from Gemini text
// ============================================================
function extractRating(aiText) {
  const match = aiText.match(/RATING:\s*(\d)/i);
  if (match) return parseInt(match[1], 10);

  const stars = aiText.match(/[⭐★]{1,5}/);
  if (stars) return stars[0].length;

  return 3; // default
}

// ============================================================
// Haversine distance — returns miles between two coordinates
// ============================================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R    = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// Address helpers
// Handles formats: "Street City, ST 12345" and "Street CitySTzip"
// ============================================================
function extractCity(address) {
  if (!address) return '';

  if (address.includes(',')) {
    const parts = address.split(',').map((p) => p.trim());
    if (parts.length >= 2) return parts[parts.length - 2].split(' ').pop();
  }

  const m = address.match(/\b([A-Z]{2})(\d{5})?$/);
  if (m) {
    const before = address.substring(0, address.lastIndexOf(m[1])).trim();
    return before.split(' ').pop();
  }

  return '';
}

function extractState(address) {
  if (!address) return '';

  if (address.includes(',')) {
    const parts    = address.split(',').map((p) => p.trim());
    const lastPart = parts[parts.length - 1];
    const m        = lastPart.match(/^([A-Z]{2})/);
    return m ? m[1] : '';
  }

  const m = address.match(/\b([A-Z]{2})(\d{5})?$/);
  return m ? m[1] : '';
}