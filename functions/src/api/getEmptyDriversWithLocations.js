// functions/src/api/getEmptyDriversWithLocations.js
//
// Returns drivers who need loads with:
// - Location (city, state, ZIP from last delivery)
// - Driver profile learned from load history:
//   - Typical vehicle count per load
//   - Freight/commodity type
//   - Average rate per mile
//   - Typical lanes/regions
// - Category: empty, delivering_today, delivering_tomorrow

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = admin.firestore();

exports.getEmptyDriversWithLocations = onRequest(
  {
    region: "us-central1",
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (req, res) => {
    try {
      // Authenticate via API key
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

      const apiKeyData = apiKeySnapshot.docs[0].data();
      const tenantId = apiKeyData.tenantId;
      const tenantData = { companyName: apiKeyData.companyName || tenantId };

      console.log(`🔍 getEmptyDriversWithLocations called for tenant: ${tenantId}`);

      // 1. Get all active drivers
      const driversSnapshot = await db
        .collection("drivers")
        .where("tenantId", "==", tenantId)
        .get();

      const allDrivers = driversSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((d) => {
          const isActive = !d.status || d.status === "Active";
          return isActive && !d.isDeleted;
        });

      console.log(`👤 Found ${allDrivers.length} active drivers`);

      // 2. Get active loads
      const activeStatuses = [
        "Booked", "Dispatched", "At Shipper", "Picked Up",
        "In Transit", "At Receiver", "At Delivery",
      ];

      const activeLoadsSnapshot = await db
        .collection("loads")
        .where("tenantId", "==", tenantId)
        .where("status", "in", activeStatuses)
        .get();

      const activeLoads = activeLoadsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 3. Get delivered loads (last 90 days for driver profile analysis)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const deliveredLoadsSnapshot = await db
        .collection("loads")
        .where("tenantId", "==", tenantId)
        .where("status", "==", "Delivered")
        .where("actualDEL", ">=", ninetyDaysAgo)
        .get();

      const deliveredLoads = deliveredLoadsSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const aTime = a.actualDEL?.toDate?.() || new Date(0);
          const bTime = b.actualDEL?.toDate?.() || new Date(0);
          return bTime - aTime;
        });

      console.log(`✅ Found ${deliveredLoads.length} delivered loads (last 90 days)`);

      // 4. Build maps
      const driverActiveLoadMap = {};
      for (const load of activeLoads) {
        if (load.driverId) {
          if (!driverActiveLoadMap[load.driverId]) {
            driverActiveLoadMap[load.driverId] = load;
          } else {
            const existingDate = getDeliveryDate(driverActiveLoadMap[load.driverId]);
            const newDate = getDeliveryDate(load);
            if (newDate && (!existingDate || newDate < existingDate)) {
              driverActiveLoadMap[load.driverId] = load;
            }
          }
        }
      }

      // Group delivered loads by driver for profile analysis
      const driverDeliveredLoads = {};
      for (const load of deliveredLoads) {
        if (load.driverId) {
          if (!driverDeliveredLoads[load.driverId]) {
            driverDeliveredLoads[load.driverId] = [];
          }
          driverDeliveredLoads[load.driverId].push(load);
        }
      }

      // 5. Also check archived loads for drivers with no recent deliveries
      const emptyDriverIdsWithoutDelivery = allDrivers
        .filter((d) => !driverActiveLoadMap[d.id] && !driverDeliveredLoads[d.id])
        .map((d) => d.id);

      if (emptyDriverIdsWithoutDelivery.length > 0) {
        for (let i = 0; i < emptyDriverIdsWithoutDelivery.length; i += 10) {
          const batch = emptyDriverIdsWithoutDelivery.slice(i, i + 10);
          const archivedSnapshot = await db
            .collection("loads")
            .where("tenantId", "==", tenantId)
            .where("driverId", "in", batch)
            .where("status", "==", "Delivered")
            .get();

          const archivedLoads = archivedSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
              const aTime = a.actualDEL?.toDate?.() || a.deliveryDateTime?.toDate?.() || new Date(0);
              const bTime = b.actualDEL?.toDate?.() || b.deliveryDateTime?.toDate?.() || new Date(0);
              return bTime - aTime;
            });

          for (const load of archivedLoads) {
            if (load.driverId) {
              if (!driverDeliveredLoads[load.driverId]) {
                driverDeliveredLoads[load.driverId] = [];
              }
              driverDeliveredLoads[load.driverId].push(load);
            }
          }
        }
      }

      // 6. Categorize drivers and build response with profiles
      // Window: today through 5 days out — dispatchers plan ahead
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      const tomorrowEnd = new Date(todayStart);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
      const fiveDaysEnd = new Date(todayStart);
      fiveDaysEnd.setDate(fiveDaysEnd.getDate() + 5);

      const result = [];

      for (const driver of allDrivers) {
        const activeLoad = driverActiveLoadMap[driver.id];
        const pastLoads = driverDeliveredLoads[driver.id] || [];
        const lastDelivered = pastLoads[0] || null;

        let category = null;
        let location = null;
        let deliveryDate = null;
        let loadInfo = null;

        if (!activeLoad) {
          category = "empty";
          if (lastDelivered) {
            location = extractLocation(lastDelivered, "delivery");
            deliveryDate = lastDelivered.actualDEL?.toDate?.() || null;
          } else {
            location = {
              city: driver.city || driver.homeCity || null,
              state: driver.state || driver.homeState || null,
              zip: driver.zip || driver.homeZip || null,
              fullAddress: driver.address || driver.homeAddress || null,
            };
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

            if (category) {
              location = extractLocation(activeLoad, "delivery");
              deliveryDate = delDate;
              loadInfo = {
                loadId: activeLoad.load_id || activeLoad.id,
                status: activeLoad.status,
                deliveryLocation: activeLoad.deliveryLocation || null,
              };
            }
          }
        }

        if (category && location && (location.city || location.state || location.fullAddress)) {
          // Build driver profile from load history
          const profile = buildDriverProfile(pastLoads);

          result.push({
            driverId: driver.id,
            driverName: driver.name ||
              (driver.firstName
                ? `${driver.firstName || ""} ${driver.lastName || ""}`.trim()
                : "Unknown"),
            phone: driver.phone || null,
            truckNumber: driver.truckNumber || driver.truck || null,
            category,
            location,
            deliveryDate: deliveryDate ? deliveryDate.toISOString() : null,
            currentLoad: loadInfo,
            profile,
          });
        }
      }

      // Sort by urgency
      const priority = { delivering_today: 0, delivering_tomorrow: 1, empty: 2 };
      result.sort((a, b) => priority[a.category] - priority[b.category]);

      console.log(
        `📊 Results: ${result.filter((d) => d.category === "empty").length} empty, ` +
        `${result.filter((d) => d.category === "delivering_today").length} delivering today, ` +
        `${result.filter((d) => d.category === "delivering_tomorrow").length} delivering tomorrow`
      );

      return res.status(200).json({
        success: true,
        tenantId,
        companyName: tenantData.companyName || tenantId,
        totalActiveDrivers: allDrivers.length,
        driversNeedingLoads: result.length,
        drivers: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ getEmptyDriversWithLocations error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
);

// ─── Build Driver Profile from Load History ─────────────────────

function buildDriverProfile(loads) {
  if (!loads || loads.length === 0) {
    return {
      totalLoads: 0,
      typicalVehicleCount: null,
      isMultiCar: null,
      commodityType: null,
      avgRatePerMile: null,
      avgLoadPrice: null,
      typicalRegions: [],
      summary: "New driver — no load history available"
    };
  }

  // Vehicle counts
  const vehicleCounts = loads
    .map((l) => l.vehicleCount || l.vehicle_count)
    .filter((v) => v && v > 0);

  let typicalVehicleCount = null;
  let isMultiCar = null;
  if (vehicleCounts.length > 0) {
    // Use the mode (most common value)
    const countFreq = {};
    vehicleCounts.forEach((v) => { countFreq[v] = (countFreq[v] || 0) + 1; });
    typicalVehicleCount = parseInt(
      Object.entries(countFreq).sort((a, b) => b[1] - a[1])[0][0]
    );
    isMultiCar = typicalVehicleCount > 1;
  }

  // Commodity/freight type
  const commodities = loads
    .map((l) => l.commodityType || l.commodity_type || l.freightType)
    .filter(Boolean);
  const commodityFreq = {};
  commodities.forEach((c) => { commodityFreq[c] = (commodityFreq[c] || 0) + 1; });
  const topCommodity = Object.entries(commodityFreq).sort((a, b) => b[1] - a[1])[0];

  // Rate per mile
  const rates = loads
    .map((l) => {
      if (l.ratePerMile) return l.ratePerMile;
      if (l.amount && l.mileage && l.mileage > 0) return l.amount / l.mileage;
      return null;
    })
    .filter((r) => r && r > 0);
  const avgRate = rates.length > 0
    ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100
    : null;

  // Average price
  const prices = loads.map((l) => l.amount).filter((a) => a && a > 0);
  const avgPrice = prices.length > 0
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;

  // Regions (pickup and delivery states)
  const states = new Set();
  loads.forEach((l) => {
    const pState = l.pickupState || extractStateFromAddress(l.pickupLocation);
    const dState = l.deliveryState || extractStateFromAddress(l.deliveryLocation);
    if (pState) states.add(pState);
    if (dState) states.add(dState);
  });

  // Build summary
  const parts = [];
  if (typicalVehicleCount) {
    parts.push(`typically hauls ${typicalVehicleCount} vehicle${typicalVehicleCount > 1 ? 's' : ''} per load`);
  }
  if (topCommodity) {
    parts.push(`${topCommodity[0]} freight`);
  }
  if (avgRate) {
    parts.push(`avg $${avgRate}/mile`);
  }
  if (avgPrice) {
    parts.push(`avg $${avgPrice}/load`);
  }
  if (states.size > 0) {
    parts.push(`runs ${Array.from(states).slice(0, 5).join(', ')}`);
  }

  return {
    totalLoads: loads.length,
    typicalVehicleCount,
    isMultiCar,
    commodityType: topCommodity ? topCommodity[0] : null,
    avgRatePerMile: avgRate,
    avgLoadPrice: avgPrice,
    typicalRegions: Array.from(states).slice(0, 10),
    summary: parts.length > 0
      ? `${loads.length} loads in 90 days — ${parts.join(', ')}`
      : `${loads.length} loads in 90 days`
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function getDeliveryDate(load) {
  const dt = load.deliveryDateTime || load.actualDEL;
  if (!dt) return null;
  if (typeof dt.toDate === "function") return dt.toDate();
  if (dt instanceof Date) return dt;
  if (typeof dt === "string") return new Date(dt);
  if (dt._seconds) return new Date(dt._seconds * 1000);
  return null;
}

function extractLocation(load, type) {
  const prefix = type === "pickup" ? "pickup" : "delivery";
  const city = load[`${prefix}City`];
  const state = load[`${prefix}State`];
  const zip = load[`${prefix}Zip`];

  if (city && state) {
    return { city, state, zip: zip || null, fullAddress: load[`${prefix}Location`] || null };
  }

  const fullAddress = load[`${prefix}Location`];
  if (!fullAddress) {
    return { city: null, state: null, zip: null, fullAddress: null };
  }

  return parseAddressString(fullAddress);
}

function parseAddressString(address) {
  if (!address || typeof address !== "string") {
    return { city: null, state: null, zip: null, fullAddress: address };
  }

  const trimmed = address.trim();
  const match = trimmed.match(/([A-Za-z\s.'-]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (match) {
    return {
      city: match[1].trim(),
      state: match[2],
      zip: match[3] || null,
      fullAddress: trimmed,
    };
  }

  const parts = trimmed.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5})?/);
    if (stateZipMatch) {
      return {
        city: parts[parts.length - 2],
        state: stateZipMatch[1],
        zip: stateZipMatch[2] || null,
        fullAddress: trimmed,
      };
    }
  }

  return { city: null, state: null, zip: null, fullAddress: trimmed };
}

function extractStateFromAddress(address) {
  if (!address) return null;
  const match = address.match(/,\s*([A-Z]{2})\s*\d{0,5}/);
  return match ? match[1] : null;
}
