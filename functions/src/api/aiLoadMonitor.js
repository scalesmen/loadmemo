// functions/src/api/aiLoadMonitor.js
//
// SELF-LEARNING AI LOAD MONITOR
//
// The agent learns each loadboard through trial and error:
//
// 1. CHECK: Does a saved profile exist for this loadboard domain?
//    YES → Return saved steps (fast, no Gemini call)
//    NO  → Go to step 2
//
// 2. LEARN: Send page elements to Gemini, get search instructions
//
// 3. VERIFY: After extension executes steps, it calls back with
//    "did the page content change?" If yes → save profile. If no → retry.
//
// 4. MATCH: Once search results are on screen, extract and match loads
//
// Profiles are stored in Firestore: loadboardProfiles/{domain}
// No extension update needed — agent improves itself

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
      // Authenticate
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

      switch (action) {
        case "getSearchProfile":
          return await handleGetSearchProfile(req, res, tenantId);
        case "learnSearchPage":
          return await handleLearnSearchPage(req, res, tenantId);
        case "saveProfile":
          return await handleSaveProfile(req, res, tenantId);
        case "reportFailure":
          return await handleReportFailure(req, res, tenantId);
        case "matchLoads":
          return await handleMatchLoads(req, res, tenantId);
        case "saveDispatchRules":
          return await handleSaveDispatchRules(req, res, tenantId);
        default:
          return res.status(400).json({ error: "Invalid action" });
      }
    } catch (error) {
      console.error("❌ aiLoadMonitor error:", error);
      return res.status(500).json({ error: "Internal server error", message: error.message });
    }
  }
);

// ============================================
// ACTION 1: GET SAVED PROFILE FOR A DOMAIN
// ============================================

async function handleGetSearchProfile(req, res, tenantId) {
  const { domain } = req.body;

  if (!domain) return res.status(400).json({ error: "Missing domain" });

  console.log(`📖 Looking up profile for: ${domain}`);

  // Check for a saved profile
  const profileDoc = await db
    .collection("loadboardProfiles")
    .doc(domain)
    .get();

  if (profileDoc.exists) {
    const profile = profileDoc.data();

    // Check if profile is still reliable (success rate > 60%)
    const successRate = profile.attempts > 0
      ? profile.successes / profile.attempts
      : 0;

    if (successRate >= 0.6 || profile.attempts < 3) {
      console.log(`✅ Found profile for ${domain} (${profile.successes}/${profile.attempts} success rate)`);
      return res.status(200).json({
        success: true,
        hasProfile: true,
        profile: {
          searchSteps: profile.searchSteps,
          fieldMappings: profile.fieldMappings,
          pageType: profile.pageType,
          notes: profile.notes,
          lastSuccess: profile.lastSuccess,
          successRate: Math.round(successRate * 100) + '%'
        }
      });
    } else {
      console.log(`⚠️ Profile for ${domain} has low success rate (${Math.round(successRate * 100)}%), re-learning`);
      // Delete bad profile so it re-learns
      await db.collection("loadboardProfiles").doc(domain).delete();
    }
  }

  console.log(`❓ No profile for ${domain}, need to learn`);
  return res.status(200).json({
    success: true,
    hasProfile: false
  });
}

// ============================================
// ACTION 2: LEARN A NEW LOADBOARD
// ============================================

async function handleLearnSearchPage(req, res, tenantId) {
  const { pageElements, pageUrl, pageTitle, domain, drivers, attempt } = req.body;

  if (!pageElements || !drivers || drivers.length === 0) {
    return res.status(400).json({ error: "Missing pageElements or drivers" });
  }

  const attemptNum = attempt || 1;
  console.log(`🧠 Learning ${domain} (attempt ${attemptNum})`);

  const geminiKey = geminiApiKeyParam.value();
  if (!geminiKey) return res.status(500).json({ error: "Gemini API key not configured" });

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  // Load previous failures so Gemini doesn't repeat mistakes
  let failureContext = '';
  if (attemptNum > 1) {
    const failuresSnap = await db
      .collection("loadboardProfiles")
      .doc(domain)
      .collection("failures")
      .orderBy("timestamp", "desc")
      .limit(3)
      .get();

    if (!failuresSnap.empty) {
      const failures = failuresSnap.docs.map(d => d.data());
      failureContext = `\n\nPREVIOUS FAILED ATTEMPTS (DO NOT REPEAT THESE):
${failures.map((f, i) => `Attempt ${i + 1}: Used selector "${f.failedSelector}" for "${f.failedField}" — FAILED because: ${f.reason}`).join('\n')}

You MUST try DIFFERENT selectors and a DIFFERENT approach this time.`;
    }
  }

  const prompt = buildLearnPrompt(pageElements, pageUrl, pageTitle, drivers, failureContext);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let instructions;
  try {
    const cleaned = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    instructions = JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse learning response");
    return res.status(200).json({ success: false, message: "Could not analyze page" });
  }

  console.log(`✅ Gemini produced ${instructions.searchSteps?.length || 0} search steps`);

  return res.status(200).json({
    success: true,
    instructions
  });
}

// ============================================
// ACTION 3: SAVE SUCCESSFUL PROFILE
// ============================================

async function handleSaveProfile(req, res, tenantId) {
  const { domain, searchSteps, fieldMappings, pageType, notes } = req.body;

  if (!domain || !searchSteps) {
    return res.status(400).json({ error: "Missing domain or searchSteps" });
  }

  console.log(`💾 Saving profile for ${domain}`);

  const profileRef = db.collection("loadboardProfiles").doc(domain);
  const existing = await profileRef.get();

  if (existing.exists) {
    // Update existing profile
    await profileRef.update({
      searchSteps,
      fieldMappings: fieldMappings || null,
      pageType: pageType || null,
      notes: notes || null,
      successes: admin.firestore.FieldValue.increment(1),
      attempts: admin.firestore.FieldValue.increment(1),
      lastSuccess: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: tenantId
    });
  } else {
    // Create new profile
    await profileRef.set({
      domain,
      searchSteps,
      fieldMappings: fieldMappings || null,
      pageType: pageType || null,
      notes: notes || null,
      successes: 1,
      attempts: 1,
      lastSuccess: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: tenantId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  console.log(`✅ Profile saved for ${domain}`);
  return res.status(200).json({ success: true });
}

// ============================================
// ACTION 4: REPORT FAILED ATTEMPT
// ============================================

async function handleReportFailure(req, res, tenantId) {
  const { domain, failedSteps, failedSelector, failedField, reason, pageElements } = req.body;

  if (!domain) return res.status(400).json({ error: "Missing domain" });

  console.log(`❌ Search failed on ${domain}: ${reason}`);

  // Increment failure count
  const profileRef = db.collection("loadboardProfiles").doc(domain);
  const existing = await profileRef.get();

  if (existing.exists) {
    await profileRef.update({
      attempts: admin.firestore.FieldValue.increment(1),
      lastFailure: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await profileRef.set({
      domain,
      searchSteps: null,
      successes: 0,
      attempts: 1,
      lastFailure: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Save failure details for learning
  await profileRef.collection("failures").add({
    failedSteps: failedSteps || null,
    failedSelector: failedSelector || null,
    failedField: failedField || null,
    reason: reason || "unknown",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    tenantId
  });

  return res.status(200).json({ success: true, message: "Failure recorded, will try differently next time" });
}

// ============================================
// ACTION 5: MATCH LOADS FROM RESULTS
// ============================================

async function handleMatchLoads(req, res, tenantId) {
  const { pageContent, pageUrl, pageTitle, dispatchRules } = req.body;

  if (!pageContent) return res.status(400).json({ error: "Missing pageContent" });

  console.log(`🎯 Matching loads for ${tenantId}`);

  const driversNeedingLoads = await getDriversNeedingLoads(tenantId);
  if (driversNeedingLoads.length === 0) {
    return res.status(200).json({ success: true, loadsFound: 0, matches: [] });
  }

  // Load dispatch rules from Firestore if not passed in request
  let rules = dispatchRules || '';
  if (!rules) {
    try {
      const rulesDoc = await db.collection("dispatchRules").doc(tenantId).get();
      if (rulesDoc.exists) rules = rulesDoc.data().rules || '';
    } catch (e) {}
  }

  const geminiKey = geminiApiKeyParam.value();
  if (!geminiKey) return res.status(500).json({ error: "Gemini API key not configured" });

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = buildMatchPrompt(driversNeedingLoads, pageContent, pageUrl, pageTitle, rules);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let analysis;
  try {
    const cleaned = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch (e) {
    return res.status(200).json({ success: true, loadsFound: 0, matches: [] });
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
  }

  return res.status(200).json({
    success: true,
    loadsFound: matches.length,
    matches,
    bookingInfo: analysis.bookingInfo || null,
  });
}

// ============================================
// ACTION 6: SAVE DISPATCH RULES
// ============================================

async function handleSaveDispatchRules(req, res, tenantId) {
  const { rules } = req.body;

  console.log(`💾 Saving dispatch rules for ${tenantId} (${(rules || '').split('\n').filter(l => l.trim()).length} rules)`);

  await db.collection("dispatchRules").doc(tenantId).set({
    rules: rules || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    tenantId
  });

  return res.status(200).json({ success: true });
}

// ============================================
// LEARN PROMPT
// ============================================

function buildLearnPrompt(pageElements, pageUrl, pageTitle, drivers, failureContext) {
  const driverInfo = drivers.map((d, i) => {
    const loc = d.location;
    let locationStr = '';
    if (typeof loc === 'string') locationStr = loc;
    else if (loc) {
      const parts = [];
      if (loc.city) parts.push(loc.city);
      if (loc.state) parts.push(loc.state);
      if (loc.zip) parts.push(`ZIP: ${loc.zip}`);
      locationStr = parts.join(', ') || loc.fullAddress || 'unknown';
    }
    return `${i + 1}. ${d.driverName} (${d.category}) — ${locationStr}${d.profile ? ` | ${d.profile.summary}` : ''}`;
  }).join("\n");

  const zipCodes = drivers
    .map(d => (typeof d.location === 'object' && d.location?.zip) ? d.location.zip : null)
    .filter(Boolean);

  // Pre-filter elements for Gemini
  const filterInputs = (pageElements.inputs || []).filter(inp => {
    const text = `${inp.label || ''} ${inp.placeholder || ''} ${inp.ariaLabel || ''} ${inp.parentText || ''} ${inp.sectionHeading || ''} ${inp.name || ''} ${inp.id || ''}`.toLowerCase();
    return text.match(/origin|pickup|from|source|city|state|zip|location|destination|deliver|to|radius|distance|mile|search|filter|where/);
  });

  const elements = {
    filterRelevantInputs: filterInputs,
    otherInputs: (pageElements.inputs || []).filter(i => !filterInputs.includes(i)).slice(0, 5),
    selects: pageElements.selects || [],
    buttons: pageElements.buttons || [],
    filterSections: pageElements.filterSections || []
  };

  return `You are an AI agent learning how to use a load board website to search for freight loads. You are seeing this website for the first time and need to figure out how its search/filter system works.
${failureContext}

WEBSITE: ${pageUrl || "unknown"}
PAGE TITLE: ${pageTitle || "unknown"}

GOAL: Find loads that pick up near these driver locations:
${driverInfo}

ZIP CODES TO SEARCH: ${zipCodes.length > 0 ? zipCodes.join(', ') : 'not available — use city, state'}

PAGE ELEMENTS (inputs are labeled with their context — "label", "parentText", "sectionHeading" tell you what each field is for):
${JSON.stringify(elements, null, 2)}

YOUR TASK — FIGURE OUT THE SEARCH PATTERN:

Most freight loadboards have this pattern:
1. A PICKUP/ORIGIN location field (text input, sometimes with autocomplete)
2. A RADIUS/DISTANCE field (dropdown or input, in miles)  
3. A SEARCH or APPLY button

Study the elements carefully:
- "filterSections" shows the filter toolbar with all its text — read it to understand the layout
- "filterRelevantInputs" are the most likely search fields — check their "label" and "parentText"
- Each input has a "selector" — use that EXACT selector in your steps

IDENTIFICATION RULES:
- PICKUP/ORIGIN field: Look for label/parentText containing "pickup", "origin", "from", "pick up location", "where"
- RADIUS field: Look for "radius", "distance", "miles", "within", "range"  
- SEARCH button: Look for "search", "find", "apply", "go", "filter", "submit"
- Some sites use separate city/state/zip fields — fill the ZIP field if it exists

IMPORTANT — POPUP/MODAL FILTERS:
Many loadboards (like ACV Auctions, Central Dispatch) use POPUP filters:
- There's a button like "PICKUP LOCATION" in a toolbar
- Clicking it opens a popup/modal with the actual input fields (ZIP code, miles/radius)
- The popup fields do NOT exist in the DOM until you click the button
- If you see buttons like "PICKUP LOCATION", "ORIGIN", "FROM" but NO corresponding input fields, it means you need to:
  1. Click the button to open the popup
  2. Use {"action": "recaptureAndContinue", "duration": 1500} — this tells the extension to re-capture the page elements (including the new popup fields) and send them back for another round of analysis
  3. In the next round, you'll see the popup fields and can fill them

- After filling popup fields, look for "Add", "Apply", "Done", "OK" buttons INSIDE the popup to confirm
- The popup may have BOTH a zip/location field AND a radius/miles field

GENERATE STEP-BY-STEP INSTRUCTIONS:

Each step is one of:
- {"action": "click", "selector": "...", "description": "..."} — click an element
- {"action": "clear", "selector": "...", "description": "..."} — clear a field
- {"action": "type", "selector": "...", "value": "...", "description": "..."} — type into a field
- {"action": "select", "selector": "...", "value": "...", "description": "..."} — select dropdown option
- {"action": "clickAutocomplete", "duration": 1500, "description": "..."} — wait for and click autocomplete
- {"action": "pressEnter", "selector": "...", "description": "..."} — press Enter
- {"action": "wait", "duration": 3000, "description": "..."} — wait for page to update
- {"action": "recaptureAndContinue", "duration": 1500, "description": "..."} — IMPORTANT: re-capture page elements after opening a popup/modal, so the next round can see the new fields

RESPOND WITH ONLY THIS JSON:
{
  "isSearchPage": true/false,
  "pageType": "loadboard name (e.g. ACV Auctions, Central Dispatch, DAT)",
  "needsRecapture": true/false,
  "fieldMappings": {
    "pickupField": {"selector": "...", "type": "input/combobox/dropdown/popup-button", "acceptsZip": true/false},
    "radiusField": {"selector": "...", "type": "select/input", "defaultValue": "50"} or null,
    "searchButton": {"selector": "...", "text": "button text"} or null
  },
  "searchSteps": [
    {
      "driverLocation": "zip code or city, state",
      "driverName": "name",
      "steps": [
        ... step objects ...
      ]
    }
  ],
  "notes": "what you learned about this loadboard's UI"
}

SET needsRecapture: true when:
- You see filter buttons (like "PICKUP LOCATION") but NO input fields for entering a location
- This tells the extension to click the button, re-capture elements, and call you again with the popup fields visible

CRITICAL RULES:
- Use EXACT selectors from the elements list
- Prefer ZIP code in the pickup field (more precise for radius search)
- Set radius to 40-50 miles if a radius field exists
- After typing a location, add "clickAutocomplete" if the field likely has autocomplete
- Always end with a "wait" step (3000-5000ms)
- If the page already shows load results and has no filter, set searchSteps to empty array

If NOT a loadboard search page:
{
  "isSearchPage": false,
  "pageType": "description",
  "fieldMappings": null,
  "searchSteps": [],
  "notes": "where the user should navigate to find available loads"
}`;
}

// ============================================
// MATCH PROMPT
// ============================================

function buildMatchPrompt(drivers, pageContent, pageUrl, pageTitle, dispatchRules) {
  const driverList = drivers.map(d => {
    const parts = [`${d.driverName} [ID: ${d.driverId}] (${d.category}) — near: ${d.location}`];
    if (d.truckNumber) parts.push(`Truck: ${d.truckNumber}`);
    if (d.profile) {
      const p = d.profile;
      const profileParts = [];
      if (p.typicalVehicleCount) profileParts.push(`${p.typicalVehicleCount}-car capacity`);
      if (p.commodityType) profileParts.push(p.commodityType);
      if (p.avgRatePerMile) profileParts.push(`avg $${p.avgRatePerMile}/mi`);
      if (profileParts.length > 0) parts.push(`Profile: ${profileParts.join(', ')}`);
    }
    return `- ${parts.join(' | ')}`;
  }).join("\n");

  const truncated = pageContent.length > 30000
    ? pageContent.substring(0, 30000) + "\n...[TRUNCATED]..."
    : pageContent;

  return `You are an AI dispatcher. Analyze these load board search results and match loads to drivers.

PAGE: ${pageUrl || "unknown"} — ${pageTitle || "unknown"}

DRIVERS:
${driverList}

DISPATCHER RULES — BE STRICT:

1. DEADHEAD (empty miles to pickup) MUST MAKE BUSINESS SENSE:
   - Deadhead should NOT exceed 30-40% of loaded miles
   - A $400 single-car load does NOT justify 200 miles of deadhead
   - Under 30mi deadhead = excellent, 30-75mi = good, 75-120mi = fair
   - Over 120mi deadhead = DO NOT MATCH unless load pays extremely well
   - Think about fuel cost: ~$0.70/mile empty. 200 empty miles = $140 wasted

2. DRIVER CAPACITY:
   - Match vehicle count to driver's typical capacity
   - 1-car driver → single vehicle loads only
   - 3-car driver → 1 to 4 vehicle loads
   - Unknown capacity → match conservatively

3. RATE CHECK:
   - If driver averages $1.50/mi, skip loads under $1.00/mi
   - Factor in deadhead: total pay / (deadhead + loaded miles) = effective rate

4. ONLY MATCH LOADS THAT A REAL DISPATCHER WOULD ASSIGN
   - Would you actually call this driver and tell them to go get this load?
   - If the math doesn't work, don't match it

ALERTS TO FLAG:
REPO, night delivery, 24hr notice, facility hours, inspection, hazmat,
oversized, appointment required, FCFS, driver assist, liftgate, inside delivery

RESPOND WITH ONLY THIS JSON:
{
  "totalLoadsOnPage": number,
  "matches": [
    {
      "loadId": "ID or null",
      "origin": "pickup city, state",
      "destination": "delivery city, state",
      "price": number or null,
      "pricePerMile": number or null,
      "mileage": number or null,
      "vehicleCount": number or null,
      "freightType": "auto/reefer/dry van/flatbed/etc",
      "freightDetails": "description",
      "pickupDate": "date or null",
      "deliveryDate": "date or null",
      "alerts": [],
      "specialInstructions": "notes",
      "matchedDriverId": "driver ID",
      "matchedDriverName": "driver name",
      "proximityMiles": number,
      "matchQuality": "excellent/good/fair",
      "matchReason": "why this makes business sense",
      "effectiveRate": "$/mile after deadhead",
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
      "reason": "too far / low rate / wrong capacity / etc"
    }
  ],
  "bookingInfo": {
    "requiresCall": true/false,
    "canBookOnline": true/false,
    "bookingNotes": "notes"
  }
}

SEARCH RESULTS:
${truncated}`;

  // Inject dispatch rules if they exist
  if (dispatchRules && dispatchRules.trim()) {
    const rulesSection = `

DISPATCHER'S CUSTOM RULES — THESE ARE MANDATORY, FOLLOW EVERY ONE:
${dispatchRules.trim().split('\n').map(r => `• ${r.trim()}`).join('\n')}

These rules come from an experienced dispatcher who knows this market. They override general logic. If a rule says "never take loads to Long Island", then DO NOT match any load delivering to Long Island, even if proximity and rate look good.`;

    return prompt.replace('SEARCH RESULTS:', rulesSection + '\n\nSEARCH RESULTS:');
  }

  return prompt;
}

// ============================================
// GET DRIVERS NEEDING LOADS
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
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(d => (!d.status || d.status === "Active") && !d.isDeleted);

  const activeLoads = activeLoadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const deliveredLoads = deliveredSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.actualDEL?.toDate?.() || 0) - (a.actualDEL?.toDate?.() || 0));

  const driverActiveLoadMap = {};
  for (const load of activeLoads) {
    if (load.driverId && !driverActiveLoadMap[load.driverId]) driverActiveLoadMap[load.driverId] = load;
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
  const fiveDaysEnd = new Date(todayStart); fiveDaysEnd.setDate(fiveDaysEnd.getDate() + 5);

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
        } else if (delDate >= todayEnd && delDate < tomorrowEnd) {
          category = "delivering_tomorrow";
        } else if (delDate >= tomorrowEnd && delDate < fiveDaysEnd) {
          const daysOut = Math.ceil((delDate - todayStart) / (1000 * 60 * 60 * 24));
          category = `delivering_in_${daysOut}_days`;
        }
        if (category) locationStr = extractLocationString(activeLoad, "delivery");
      }
    }

    if (category && locationStr) {
      const profile = buildProfile(pastLoads);
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

function buildProfile(loads) {
  if (!loads || loads.length === 0) return { totalLoads: 0, summary: "no history" };

  const vCounts = loads.map(l => l.vehicleCount || l.vehicle_count).filter(v => v > 0);
  let typicalVC = null;
  if (vCounts.length > 0) {
    const freq = {};
    vCounts.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    typicalVC = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  const commodities = loads.map(l => l.commodityType || l.freightType).filter(Boolean);
  const cFreq = {};
  commodities.forEach(c => { cFreq[c] = (cFreq[c] || 0) + 1; });
  const topC = Object.entries(cFreq).sort((a, b) => b[1] - a[1])[0];

  const rates = loads.map(l => l.ratePerMile || (l.amount && l.mileage > 0 ? l.amount / l.mileage : null)).filter(r => r > 0);
  const avgRate = rates.length > 0 ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100 : null;

  const parts = [];
  if (typicalVC) parts.push(`${typicalVC}-car`);
  if (topC) parts.push(topC[0]);
  if (avgRate) parts.push(`$${avgRate}/mi`);

  return {
    totalLoads: loads.length,
    typicalVehicleCount: typicalVC,
    commodityType: topC ? topC[0] : null,
    avgRatePerMile: avgRate,
    summary: parts.length > 0 ? parts.join(', ') : 'limited history',
  };
}

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
