// functions/src/api/aiLoadMonitor.js
//
// AI Load Monitor - Two-Pass Chrome Extension Agent
//
// PASS 1 (action: "analyzeSearchPage"):
//   Receives page elements + driver data (locations, profiles)
//   Gemini figures out how to use the loadboard's search filters
//   Returns step-by-step instructions (fill pickup zip, set radius, click search)
//
// PASS 2 (action: "matchLoads"):
//   Receives scraped search results
//   Gemini extracts loads, matches to drivers using profiles
//   Returns matched loads with alerts and booking info

const { onRequest } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const db = admin.firestore();
const geminiApiKeyParam = functions.params.defineString("GEMINI_API_KEY");

exports.aiLoadMonitor = onRequest(
  {
    region: "us-central1",
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization" });
      }

      const apiKey = authHeader.replace("Bearer ", "");

      const apiKeySnapshot = await db
        .collection("apiKeys")
        .where("apiKey", "==", apiKey)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (apiKeySnapshot.empty) {
        return res.status(403).json({ error: "Invalid API key" });
      }

      const tenantId = apiKeySnapshot.docs[0].data().tenantId;
      const { action } = req.body;

      if (action === "analyzeSearchPage") {
        return await handleAnalyzeSearchPage(req, res, tenantId);
      } else if (action === "matchLoads") {
        return await handleMatchLoads(req, res, tenantId);
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }
    } catch (error) {
      console.error("❌ aiLoadMonitor error:", error);
      return res.status(500).json({ error: "Internal server error", message: error.message });
    }
  }
);

// ============================================
// PASS 1: ANALYZE SEARCH PAGE
// ============================================

async function handleAnalyzeSearchPage(req, res, tenantId) {
  const { pageElements, pageUrl, pageTitle, drivers } = req.body;

  if (!pageElements || !drivers || drivers.length === 0) {
    return res.status(400).json({ error: "Missing pageElements or drivers" });
  }

  console.log(`🔍 Pass 1: Analyzing search page for ${tenantId} (${drivers.length} drivers)`);

  const geminiKey = geminiApiKeyParam.value();
  if (!geminiKey) return res.status(500).json({ error: "Gemini API key not configured" });

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = buildSearchAnalysisPrompt(pageElements, pageUrl, pageTitle, drivers);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let instructions;
  try {
    const cleaned = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    instructions = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse Pass 1:", result.response.text().substring(0, 500));
    return res.status(200).json({ success: false, message: "Could not analyze search page" });
  }

  console.log(`✅ Pass 1: ${instructions.searchSteps?.length || 0} search steps`);
  return res.status(200).json({ success: true, instructions });
}

// ============================================
// PASS 2: MATCH LOADS FROM RESULTS
// ============================================

async function handleMatchLoads(req, res, tenantId) {
  const { pageContent, pageUrl, pageTitle } = req.body;

  if (!pageContent) return res.status(400).json({ error: "Missing pageContent" });

  console.log(`🎯 Pass 2: Matching loads for ${tenantId}`);

  const driversNeedingLoads = await getDriversNeedingLoads(tenantId);
  if (driversNeedingLoads.length === 0) {
    return res.status(200).json({ success: true, loadsFound: 0, matches: [], message: "No drivers need loads" });
  }

  const geminiKey = geminiApiKeyParam.value();
  if (!geminiKey) return res.status(500).json({ error: "Gemini API key not configured" });

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = buildMatchPrompt(driversNeedingLoads, pageContent, pageUrl, pageTitle);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let analysis;
  try {
    const cleaned = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse Pass 2:", result.response.text().substring(0, 500));
    return res.status(200).json({ success: true, loadsFound: 0, matches: [], message: "Could not parse loads" });
  }

  const matches = analysis.matches || [];

  if (matches.length > 0) {
    const batch = db.batch();
    for (const match of matches) {
      batch.set(db.collection("suggestedLoads").doc(), {
        tenantId,
        ...match,
        source: pageUrl || "chrome_extension",
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`💾 Saved ${matches.length} suggested loads`);
  }

  return res.status(200).json({
    success: true,
    loadsFound: matches.length,
    matches,
    bookingInfo: analysis.bookingInfo || null,
  });
}

// ============================================
// PASS 1 PROMPT
// ============================================

function buildSearchAnalysisPrompt(pageElements, pageUrl, pageTitle, drivers) {
  // Build driver info with zip codes and profiles
  const driverInfo = drivers.map((d, i) => {
    const loc = d.location;
    let locationStr = '';
    if (typeof loc === 'string') {
      locationStr = loc;
    } else if (loc) {
      const parts = [];
      if (loc.city) parts.push(loc.city);
      if (loc.state) parts.push(loc.state);
      if (loc.zip) parts.push(`(ZIP: ${loc.zip})`);
      locationStr = parts.join(', ') || loc.fullAddress || 'unknown';
    }

    let profileStr = '';
    if (d.profile) {
      profileStr = ` | Profile: ${d.profile.summary || 'no history'}`;
    }

    return `${i + 1}. ${d.driverName} (${d.category}) — Location: ${locationStr}${profileStr}`;
  }).join("\n");

  // Extract just the zip codes for search
  const zipCodes = drivers
    .map(d => {
      if (typeof d.location === 'object' && d.location?.zip) return d.location.zip;
      return null;
    })
    .filter(Boolean);

  const cityStates = drivers
    .map(d => {
      if (typeof d.location === 'string') return d.location;
      if (typeof d.location === 'object' && d.location?.city && d.location?.state) {
        return `${d.location.city}, ${d.location.state}`;
      }
      return null;
    })
    .filter(Boolean);

  const elementsStr = JSON.stringify(pageElements, null, 2);

  return `You are an AI agent controlling a Chrome Extension on a freight/load board website. You need to search for available loads near specific driver locations.

PAGE URL: ${pageUrl || "unknown"}
PAGE TITLE: ${pageTitle || "unknown"}

DRIVERS NEEDING LOADS:
${driverInfo}

SEARCH LOCATIONS:
- ZIP codes: ${zipCodes.length > 0 ? zipCodes.join(', ') : 'not available'}
- Cities: ${cityStates.join(', ') || 'not available'}

INTERACTIVE ELEMENTS ON THE PAGE:
${elementsStr}

YOUR TASK:
Figure out how to use this loadboard's search/filter to find loads near the driver locations. Look for:

1. **ORIGIN/PICKUP filter** — This is the most important field. Look for inputs labeled: origin, pickup, from, pickup location, pickup city, pickup zip, origin city, etc. 
   - If the field accepts ZIP codes, use the ZIP code (more precise)
   - If it only accepts city/state, use city, state format
   - Do NOT use a general "search" bar — use the specific pickup/origin filter

2. **RADIUS/DISTANCE filter** — Look for: radius, distance, miles, range, within
   - Set to 100-150 miles if available
   - If it's a dropdown, pick the closest option to 150 miles

3. **SEARCH/APPLY button** — The button that executes the search or applies filters
   - Look for: search, find loads, apply, filter, go, submit

4. **Other useful filters** — Equipment type, trailer type, etc.
   - Only set these if the driver profile indicates a specific type

RESPOND WITH ONLY THIS JSON:
{
  "isSearchPage": true/false,
  "pageType": "loadboard name if recognized (e.g. Central Dispatch, ACV, Super Dispatch, DAT)",
  "searchSteps": [
    {
      "driverLocation": "city, state or zip being searched",
      "driverName": "which driver this search is for",
      "steps": [
        {
          "action": "clear",
          "selector": "CSS selector",
          "description": "Clear the pickup/origin input"
        },
        {
          "action": "type",
          "selector": "CSS selector",
          "value": "zip code or city, state",
          "description": "Enter pickup location"
        },
        {
          "action": "clickAutocomplete",
          "duration": 1500,
          "description": "Wait for and click autocomplete suggestion"
        },
        {
          "action": "select",
          "selector": "CSS selector",
          "value": "150",
          "description": "Set search radius to 150 miles"
        },
        {
          "action": "click",
          "selector": "CSS selector",
          "description": "Click search/apply button"
        },
        {
          "action": "wait",
          "duration": 3000,
          "description": "Wait for results to load"
        }
      ]
    }
  ],
  "notes": "observations about the page"
}

IMPORTANT RULES:
- Use EXACT selectors from the elements list (#id preferred, then [name=...], then classes)
- Prefer ZIP code over city name when the input accepts it
- Do NOT use general search bars — use specific pickup/origin location filters
- Always add a "wait" step (2000-5000ms) after clicking search for results to load
- If the page has autocomplete dropdowns, add "clickAutocomplete" after typing
- If the page already shows filtered load results, set isSearchPage: true and return empty searchSteps
- Group nearby drivers — if two drivers are within 50 miles, search once for that area
- If no search/filter form is found, set isSearchPage: false

If NOT a search page:
{
  "isSearchPage": false,
  "pageType": "what this page is",
  "searchSteps": [],
  "notes": "where the user should navigate to find the search/load listing page"
}`;
}

// ============================================
// PASS 2 PROMPT
// ============================================

function buildMatchPrompt(drivers, pageContent, pageUrl, pageTitle) {
  const driverList = drivers
    .map((d) => {
      let profileStr = '';
      if (d.profile) {
        const p = d.profile;
        const parts = [];
        if (p.typicalVehicleCount) parts.push(`${p.typicalVehicleCount}-car capacity`);
        if (p.commodityType) parts.push(`${p.commodityType} freight`);
        if (p.avgRatePerMile) parts.push(`avg $${p.avgRatePerMile}/mi`);
        if (p.avgLoadPrice) parts.push(`avg $${p.avgLoadPrice}/load`);
        profileStr = parts.length > 0 ? ` | ${parts.join(', ')}` : '';
      }
      return `- ${d.driverName} [ID: ${d.driverId}] (${d.category}) — near: ${d.location}${d.truckNumber ? ` [Truck: ${d.truckNumber}]` : ''}${profileStr}`;
    })
    .join("\n");

  const truncated = pageContent.length > 30000
    ? pageContent.substring(0, 30000) + "\n...[TRUNCATED]..."
    : pageContent;

  return `You are an AI dispatcher agent for a trucking company analyzing load board search results.

PAGE URL: ${pageUrl || "unknown"}
PAGE TITLE: ${pageTitle || "unknown"}

DRIVERS NEEDING LOADS:
${driverList}

MATCHING RULES:
- Match loads to the nearest driver based on pickup location
- Consider the driver's profile when matching:
  - If a driver typically hauls 3 cars, match loads with 1-4 vehicles (not 8-car loads)
  - If a driver does 1-car loads, match single vehicle loads only
  - If a driver averages $1.50/mile, don't match loads below $0.80/mile
  - If no profile exists, match any reasonable load
- Proximity: within 50mi = excellent, within 100mi = good, within 150mi = fair
- Skip loads that are clearly a bad fit for the driver's capacity or freight type

ALERTS TO FLAG:
REPO, night delivery, 24hr notice, facility hours, inspection required,
no-touch, hazmat, oversized, appointment required, FCFS, driver assist,
liftgate, inside delivery, any special instructions

RESPOND WITH ONLY THIS JSON:
{
  "totalLoadsOnPage": number,
  "matches": [
    {
      "loadId": "load ID or null",
      "origin": "pickup city, state",
      "destination": "delivery city, state",
      "price": number or null,
      "pricePerMile": number or null,
      "mileage": number or null,
      "vehicleCount": number or null,
      "freightType": "auto/reefer/dry van/flatbed/etc",
      "freightDetails": "what is being hauled",
      "pickupDate": "date or null",
      "deliveryDate": "date or null",
      "alerts": [],
      "specialInstructions": "important notes",
      "matchedDriverId": "driver ID",
      "matchedDriverName": "driver name",
      "proximityMiles": estimated_miles,
      "matchQuality": "excellent/good/fair",
      "matchReason": "why this driver was chosen (capacity, proximity, rate)",
      "bookingMethod": "how to book",
      "canAutoBook": true/false,
      "bookButtonSelector": "CSS selector or null"
    }
  ],
  "unmatchedLoads": [
    {
      "loadId": "ID",
      "origin": "city, state",
      "destination": "city, state",
      "price": number or null,
      "reason": "why no match (too far, wrong capacity, low rate, etc.)"
    }
  ],
  "bookingInfo": {
    "requiresCall": true/false,
    "canBookOnline": true/false,
    "bookingNotes": "how booking works on this site"
  }
}

SEARCH RESULTS:
${truncated}`;
}

// ============================================
// GET DRIVERS NEEDING LOADS (for Pass 2)
// ============================================

async function getDriversNeedingLoads(tenantId) {
  const activeStatuses = [
    "Booked", "Dispatched", "At Shipper", "Picked Up",
    "In Transit", "At Receiver", "At Delivery",
  ];

  const [driversSnap, activeLoadsSnap, deliveredSnap] = await Promise.all([
    db.collection("drivers").where("tenantId", "==", tenantId).get(),
    db.collection("loads").where("tenantId", "==", tenantId).where("status", "in", activeStatuses).get(),
    db.collection("loads").where("tenantId", "==", tenantId).where("status", "==", "Delivered")
      .where("actualDEL", ">=", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).get(),
  ]);

  const allDrivers = driversSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((d) => (!d.status || d.status === "Active") && !d.isDeleted);

  const activeLoads = activeLoadsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const deliveredLoads = deliveredSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.actualDEL?.toDate?.() || 0) - (a.actualDEL?.toDate?.() || 0));

  const driverActiveLoadMap = {};
  for (const load of activeLoads) {
    if (load.driverId && !driverActiveLoadMap[load.driverId]) {
      driverActiveLoadMap[load.driverId] = load;
    }
  }

  const driverDeliveredLoads = {};
  for (const load of deliveredLoads) {
    if (load.driverId) {
      if (!driverDeliveredLoads[load.driverId]) driverDeliveredLoads[load.driverId] = [];
      driverDeliveredLoads[load.driverId].push(load);
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
  const tomorrowEnd = new Date(todayStart); tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

  const result = [];

  for (const driver of allDrivers) {
    const activeLoad = driverActiveLoadMap[driver.id];
    const pastLoads = driverDeliveredLoads[driver.id] || [];
    const lastDelivered = pastLoads[0] || null;

    let category = null;
    let locationStr = null;

    if (!activeLoad) {
      category = "empty";
      if (lastDelivered) locationStr = extractLocationString(lastDelivered, "delivery");
      else {
        const city = driver.city || driver.homeCity;
        const state = driver.state || driver.homeState;
        if (city && state) locationStr = `${city}, ${state}`;
      }
    } else {
      const delDate = getDeliveryDate(activeLoad);
      if (delDate) {
        if (delDate >= todayStart && delDate < todayEnd) {
          category = "delivering_today";
          locationStr = extractLocationString(activeLoad, "delivery");
        } else if (delDate >= todayEnd && delDate < tomorrowEnd) {
          category = "delivering_tomorrow";
          locationStr = extractLocationString(activeLoad, "delivery");
        }
      }
    }

    if (category && locationStr) {
      // Build profile
      const profile = buildDriverProfileFromLoads(pastLoads);

      result.push({
        driverId: driver.id,
        driverName: driver.name || (driver.firstName ? `${driver.firstName} ${driver.lastName || ""}`.trim() : "Unknown"),
        truckNumber: driver.truckNumber || driver.truck || null,
        category,
        location: locationStr,
        profile,
      });
    }
  }

  return result;
}

function buildDriverProfileFromLoads(loads) {
  if (!loads || loads.length === 0) {
    return { totalLoads: 0, summary: "no history" };
  }

  const vehicleCounts = loads.map(l => l.vehicleCount || l.vehicle_count).filter(v => v > 0);
  let typicalVehicleCount = null;
  if (vehicleCounts.length > 0) {
    const freq = {};
    vehicleCounts.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    typicalVehicleCount = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  const commodities = loads.map(l => l.commodityType || l.freightType).filter(Boolean);
  const commodityFreq = {};
  commodities.forEach(c => { commodityFreq[c] = (commodityFreq[c] || 0) + 1; });
  const topCommodity = Object.entries(commodityFreq).sort((a, b) => b[1] - a[1])[0];

  const rates = loads
    .map(l => l.ratePerMile || (l.amount && l.mileage > 0 ? l.amount / l.mileage : null))
    .filter(r => r > 0);
  const avgRate = rates.length > 0 ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100 : null;

  const prices = loads.map(l => l.amount).filter(a => a > 0);
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  const parts = [];
  if (typicalVehicleCount) parts.push(`${typicalVehicleCount}-car`);
  if (topCommodity) parts.push(topCommodity[0]);
  if (avgRate) parts.push(`$${avgRate}/mi`);
  if (avgPrice) parts.push(`$${avgPrice}/load`);

  return {
    totalLoads: loads.length,
    typicalVehicleCount,
    commodityType: topCommodity ? topCommodity[0] : null,
    avgRatePerMile: avgRate,
    avgLoadPrice: avgPrice,
    summary: parts.length > 0 ? parts.join(', ') : 'limited history',
  };
}

// ============================================
// HELPERS
// ============================================

function getDeliveryDate(load) {
  const dt = load.deliveryDateTime || load.actualDEL;
  if (!dt) return null;
  if (typeof dt.toDate === "function") return dt.toDate();
  if (dt instanceof Date) return dt;
  if (typeof dt === "string") return new Date(dt);
  if (dt._seconds) return new Date(dt._seconds * 1000);
  return null;
}

function extractLocationString(load, type) {
  const prefix = type === "pickup" ? "pickup" : "delivery";
  const city = load[`${prefix}City`];
  const state = load[`${prefix}State`];
  if (city && state) return `${city}, ${state}`;
  const addr = load[`${prefix}Location`];
  if (!addr) return null;
  const match = addr.match(/([A-Za-z\s.'-]+),\s*([A-Z]{2})\s*(\d{5})?/);
  if (match) return `${match[1].trim()}, ${match[2]}`;
  return addr;
}
