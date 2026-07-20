// config/constants.js - Updated with broker contact extraction and improved section identification

const COMMODITY_PROMPTS = {
  auto: `
Extract auto transport load data. Return ONLY valid JSON.

🚨 CRITICAL SECTION IDENTIFICATION RULES (READ FIRST):
When parsing PDFs, you MUST correctly identify these sections:

1. CARRIER INFORMATION section:
   - Labels: "Carrier:", "Carrier Information", "USDOT:", "MC#"
   - Contains: Trucking company name, USDOT number, MC number, carrier contact
   - THIS IS THE TRUCKING COMPANY DOING THE TRANSPORT
   - ⚠️ NEVER use Carrier Information as pickup or delivery location
   - ✅ DO extract the company name from this section as "carrierName"
   
2. SHIPPER / BROKER section (at TOP of document):
   - Labels: "Shipper", "Broker", company name at very top, letterhead/logo
   - This is the BROKER arranging transport → extract as brokerName
   - Examples: "Copart Inc.", "Navi Transport Services LLC", "Nexus AT LLC", "Carpool Logistics"
   
3. PICKUP INFORMATION section:
   - Labels: "Pickup Information", "Pickup From", "Pick Up Location", "Origin", "Shipper 1" (when under vehicle details)
   - Usually appears AFTER Vehicle Information section
   - Contains: Name, address, phone of WHERE TO PICK UP the vehicle
   - → Extract as pickupLocation, pickupLocationName, pickupContactPhone
   
4. DELIVERY INFORMATION section:
   - Labels: "Delivery Information", "Deliver To", "Delivery Location", "Destination", "Receiver", "Receiver 1"
   - Usually appears AFTER or BESIDE Pickup Information
   - Contains: Name, address, phone of WHERE TO DELIVER the vehicle
   - → Extract as deliveryLocation, deliveryLocationName, deliveryContactPhone

⚠️ COMMON MISTAKES TO AVOID:
- "Carrier: MATILLDA LLC" with USDOT = TRUCKING COMPANY, not pickup!
- The broker is at the TOP of the document (Shipper section or letterhead)
- Pickup/Delivery sections are clearly labeled and appear AFTER vehicle info
- If you see "USDOT:" or "MC#" in a section, that's the carrier - SKIP IT for pickup/delivery

🆕 LOADBOARD SOURCE DETECTION:
Detect which loadboard this order came from by looking for these indicators:

1. SUPER DISPATCH (SD):
   - Text contains: "Super Dispatch", "SuperDispatch", "superdispatch.com", "Powered by SuperDispatch", "Powered by Super Dispatch"
   - If found → set "loadboardSource": "super_dispatch"

2. CENTRAL DISPATCH (CD):
   - Text contains: "Central Dispatch", "CentralDispatch", "centraldispatch.com", "CD Order"
   - If found → set "loadboardSource": "central_dispatch"

3. CARS ARRIVE (CA):
   - Text contains: "Carsarrive", "Cars Arrive", "carsarrive.com", "CarsArrive Network"
   - If found → set "loadboardSource": "carsarrive"

4. SHIP.CARS (SC):
   - Text contains: "Ship.cars", "Ship cars", "ship.cars", "Shipcars"
   - If found → set "loadboardSource": "ship_cars"

5. ACV TRANSPORTATION (ACV):
   - Text contains: "ACV Transportation", "ACV Logistics", "ACV Load Board", "acvauctions.com/transport"
   - If found → set "loadboardSource": "acv_transport"

6. RUNBUGGY (RB):
   - Text contains: "Runbuggy", "Run Buggy", "runbuggy.com"
   - If found → set "loadboardSource": "runbuggy"

7. DIRECT FREIGHT (DF):
   - Text contains: "Direct Freight", "DirectFreight", "directfreight.com"
   - If found → set "loadboardSource": "direct_freight"

8. MONTWAY (MW):
   - Text contains: "Montway", "montway.com", "Montway Auto Transport"
   - If found → set "loadboardSource": "montway"

9. CARPOOL LOGISTICS (CP):
   - Text contains: "Carpool", "Carpool Logistics", "carpoollogistics.com", "CARPOOL MOBILE APP", "CARPOOL LOAD CONFIRMATION"
   - If found → set "loadboardSource": "carpool"

10. COPART:
   - Text contains: "Copart", "copart.com", "Copart Inc", "Copart Delivered", "Copart Transportation"
   - If found → set "loadboardSource": "copart"

11. CARVANA:
   - Text contains: "Carvana", "carvana.com", "ClearPath TMS", "ClearPath Load Manager"
   - If found → set "loadboardSource": "carvana"

12. HAULEX:
   - Text contains: "Haulex", "haulex.com", "HaulEx"
   - If found → set "loadboardSource": "haulex"

13. RPM:
   - Text contains: "RPM", "LoadRPM", "loadrpm.com", "RPM Drive"
   - If found → set "loadboardSource": "rpm"

14. AUTOSLED:
   - Text contains: "Autosled", "autosled.com"
   - If found → set "loadboardSource": "autosled"

15. ACERTUS / METROGISTICS:
   - Text contains: "Acertus", "acertus.com", "Metrogistics", "metrogistics.com", "Vinlocity"
   - If found → set "loadboardSource": "acertus"

If NONE of these are found → set "loadboardSource": "unknown"

IMPORTANT: Check the ENTIRE PDF for these indicators - headers, footers, watermarks, company names, URLs, etc.

IMPORTANT ID RULES:
- load_id = order number, BOL number, Order ID, Contract #, or Dispatch Order (they are the same)
- If you see "Order ID", "Order #", "Order Number" → use it as load_id
- If you see "BOL Number", "BOL #" → use it as load_id
- If you see "Contract Number", "Contract #", "Contract No" → use it as load_id
- If you see "Dispatch Order", "Dispatch #", "Dispatch Number" → use it as load_id
- If you see "Load ID", "Load #" → use it as load_id
- Always include both load_id and order_id if they're different
- If they're the same, just use load_id

CRITICAL AMOUNT/PAYMENT RULES:
- amount = total carrier payment (look for: rate, load rate, payout, carrier pay, carrier total pay, total rate, line haul, carrier rate, gross pay, Total Payment to Carrier, Carrier Pay)
- Extract the LARGEST dollar amount if multiple amounts exist
- IMPORTANT CURRENCY PARSING:
  * "1039,00" or "1039.00" = 1039 (NOT 103900!)
  * "1,039.00" = 1039
  * "$1,039" = 1039
  * European format "1.039,00" = 1039
  * Always use period as decimal separator in output
  * If amount > 50000, double-check - it's likely a parsing error
- Remove ALL symbols ($, €, commas, periods used as thousands separators)
- Common terms that indicate the carrier payment amount:
  * "Carrier Pay" or "Carrier Payout"
  * "Total Rate" or "Line Haul Rate"
  * "Gross Pay" or "Total Pay"
  * "Load Rate" or "Freight Rate"
  * "Carrier Total" or "Total to Carrier"
  * "Total Payment to Carrier"

DRIVER PAY AUTO-CALCULATION RULE:
- If paymentTerms is "on_delivery" or "on_pickup" AND you cannot find a specific driver collection amount in the PDF:
  → Set driverCollectionAmount = amount - brokerFeeCollection
- If brokerFeeCollection is not found, assume it's 0
- Example: If amount=1500, brokerFeeCollection=50, paymentTerms="on_delivery" → driverCollectionAmount=1450
- Example: If amount=1200, no broker fee found, paymentTerms="on_pickup" → driverCollectionAmount=1200

PHONE NUMBER EXTRACTION RULES:
- pickupContactPhone = phone number at pickup location (shipper, dealer, warehouse)
  * Look in: "Pickup Information", "Pickup From", "Origin Phone", "Shipper Phone" sections
  * Extract format: "1234567890" or "(123) 456-7890" or "123-456-7890"
- deliveryContactPhone = phone number at delivery location (consignee, receiver)
  * Look in: "Delivery Information", "Deliver To", "Destination Phone", "Receiver Phone" sections
  * Extract the phone number as-is (keep formatting if present)
- Extract both if available, use null if not found
- ⚠️ DO NOT extract phone from "Carrier Information" section - that's the trucking company!

PAYMENT METHOD MAPPING (check in this ORDER - first match wins):
- "Cash/Certified Funds", "cash/certified", "cash or certified funds" → "cash" (PRIORITY: if "cash" appears before "certified", use "cash")
- "cash", "COD", "cash on delivery", "cash payment" → "cash"
- "check", "cheque", "personal check" → "check"
- "cashier's check", "certified check only", "certified funds only", "bank check", "certified funds" (without "cash") → "cashiers_check"
- "ACH", "bank transfer", "electronic transfer", "wire" → "ach"
- "TCH", "tch", "TCH payment", "tch transfer" → "tch"- "Zelle", "zelle payment" → "zelle"
- "Venmo" → "venmo"
- "Cash App", "CashApp", "$cashtag" → "cashapp"
- "credit card", "CC", "card payment" → "credit_card"
- "uShip code", "uship payment code" → "uship_code"
- "comcheck", "com check", "comchek" → "comcheck"
- "factoring", "factor payment" → "factoring"
- "Billing", "Shipper Invoice" → "ach"

PAYMENT TERMS MAPPING:
- "on delivery", "upon delivery", "COD", "when delivered", "Cash on delivery" → "on_delivery"
- "on pickup", "upon pickup", "when picked up" → "on_pickup"
- "2 days", "2 business days", "within 2 days" → "2_business_days"
- "5 days", "5 business days", "within 5 days" → "5_business_days"
- "7 days", "7 business days", "1 week" → "7_business_days"
- "10 days", "10 business days" → "10_business_days"
- "15 days", "15 business days", "2 weeks" → "15_business_days"
- "20 days", "20 business days" → "20_business_days"
- "30 days", "1 month", "30 business days", "net 30" → "30_business_days"
- "Quick pay", "quick pay", "fast pay", "QuickPay" → "quick_pay"
- "Standard terms" → "30_business_days"
- "Immediate" → "on_delivery"

🆕 BROKER/SHIPPER CONTACT EXTRACTION RULES:
IMPORTANT: The BROKER is the company arranging transport. Find it at the TOP of the document:

WHERE TO FIND BROKER INFO:
1. "Shipper" section at very top (e.g., "Copart Inc. Shipper", "Navi Transport Services LLC Shipper", "Nexus AT LLC")
2. Company letterhead/logo area (e.g., "Carpool Logistics", "CarsArrive Network")
3. "Bill to:" section (contains broker's billing address)
4. Company name with "Co. Phone:", "Company Phone:" near top

⚠️ DO NOT CONFUSE WITH:
- "Carrier Information" section = the TRUCKING COMPANY (has USDOT/MC#) - NOT the broker!
- "Pickup Information" section = WHERE to pick up vehicle - NOT the broker!
- "Pickup From" section = WHERE to pick up vehicle - NOT the broker!

Extract the broker/shipper company's contact information:

- brokerName = Company name from "Shipper" section at TOP or letterhead/logo
  * Common brokers: ACV Auctions, Carvana, Ready Logistics, Runbuggy, Montway, Acertus, Metroloads, Backlotcars, Excellent Auto Transport, Carpool Logistics, CarsArrive Network, Openlane, Copart Inc., Navi Transport Services, Nexus AT LLC
  * If "ACV" appears → brokerName = "ACV Auctions"
  * If "Copart" appears in Shipper → brokerName = "Copart Inc."
  * If "CarsArrive" logo appears → brokerName = "CarsArrive Network"
  * If "Carpool" or "CARPOOL" in header → brokerName = "Carpool Logistics"
  * Never use "Central Dispatch" or "Super Dispatch" as broker (they're just loadboards)
  
- brokerPhone = Phone number of the broker/shipper company
  * Look in: "Shipper" section at top, "Co. Phone:", "Company Phone:", letterhead
  * NOT the pickup location phone - this is the broker's office phone
  * Format: keep as-is or "1234567890"
  
- brokerEmail = Email address of the broker/shipper company
  * Look in: "Shipper" section, company header, "Email:" near company name
  * Common patterns: dispatch@company.com, orders@company.com, info@company.com
  
- brokerAddress = Physical address of the broker/shipper company
  * Look in: "Shipper" section header, company letterhead
  * This is the broker's office address, NOT the pickup address

IMPORTANT DISTINCTIONS:
- brokerPhone ≠ pickupContactPhone (broker office vs pickup location)
- brokerAddress ≠ pickupLocation (broker office vs pickup address)
- The Shipper section at TOP = broker info
- The Pickup Information section = where to get the vehicle

BROKER RULES:
- Broker = Company at TOP of document in "Shipper" section or letterhead
- Known brokers: ACV Auctions, Carvana, Ready Logistics, Runbuggy, Montway, Acertus, Metrogistics, Metroloads, Backlotcars, Excellent Auto Transport, Carpool Logistics, CarsArrive Network, Openlane, Navi Transport Services, Nexus AT LLC, Copart Inc., Copart Delivered
- If "Metrogistics" appears → brokerName = "Acertus" (Metrogistics is part of Acertus)- If "ACV" appears → brokerName = "ACV Auctions"
- If "Copart" appears in Shipper section → brokerName = "Copart Inc."
- If "CarsArrive" logo/text appears → brokerName = "CarsArrive Network"
- If "Carpool Logistics" or "CARPOOL" appears in header → brokerName = "Carpool Logistics"
- Never use "Central Dispatch" or "Super Dispatch" as broker (they're just loadboards)
- ⚠️ NEVER use "Carrier Information" section as broker - that's the trucking company!
- Carrier = trucking company in "Carrier Information" section (IGNORE for broker/pickup/delivery)

REQUIRED APP DETECTION RULES:
Look for instructions in the PDF requiring driver to use specific apps for inspection/BOL/signature.
Check: pickup instructions, delivery instructions, general notes, terms & conditions sections.

1. SUPER DISPATCH:
   - "use Super Dispatch app", "sign BOL in Super Dispatch", "SuperDispatch app", "SD app for inspection"
   - If found → requiredApp: "super_dispatch"

2. RUNBUGGY:
   - "Runbuggy app", "RB Mobile App", "sign within RB", "ONLY sign the inspection within the RB Mobile App", "use runbuggy"
   - If found → requiredApp: "runbuggy"

3. CARPOOL:
   - "Carpool app", "use Carpool", "Carpool Auto Transport app", "CARPOOL MOBILE APP", "CARPOOL APP USE IS MANDATORY"
   - If found → requiredApp: "carpool"

4. SHIP.CARS:
   - "Ship.cars app", "use Ship.cars", "SmartHaul app", "shipcars app"
   - If found → requiredApp: "ship_cars"

5. ACERTUS / METROGISTICS:
   - "Acertus app", "use Acertus", "Metrogistics app", "use Metrogistics"
   - If found → requiredApp: "acertus"

 6. CENTRAL DISPATCH:
   - ⚠️ NEVER set requiredApp to "central_dispatch"
   - Central Dispatch is a LOADBOARD, NOT a driver inspection app
   - Even if PDF mentions "Central Dispatch" or comes from Central Dispatch → requiredApp: null
   - Only the LOADBOARD SOURCE should be "central_dispatch", NOT the requiredApp

7. HAULEX:
   - "Haulex app", "use Haulex", "HaulEx app", "sign in Haulex"
   - If found → requiredApp: "haulex"

8. CARSARRIVE:
   - "CarsArrive app", "use CarsArrive", "Cars Arrive app", "CarsArrive Plus app"
   - If found → requiredApp: "carsarrive"

9. RPM:
   - "RPM app", "RPM Drive app", "use RPM", "RPM Drive"
   - If found → requiredApp: "rpm"

10. AUTOSLED:
   - "Autosled app", "use Autosled", "sign in Autosled"
   - If found → requiredApp: "autosled"

11. CARVANA:
   - "Carvana app", "ClearPath app", "Load Manager app", "ClearPath TMS", "use Carvana", "Clearpath Load Manager"
   - If found → requiredApp: "carvana"

12. COPART:
   - "Copart Transportation APP", "Copart app", "use Copart app", "mark yourself as Arrived in the app"
   - If found → requiredApp: "super_dispatch"

IMPORTANT:
- Only set requiredApp if PDF EXPLICITLY requires driver to use an app for inspection/BOL/signature
- Do NOT set requiredApp just because PDF came from a loadboard (e.g., don't set "super_dispatch" just because it's a Super Dispatch PDF)
- ⚠️ NEVER set requiredApp to "central_dispatch" — Central Dispatch is a loadboard, NOT a driver app. Even if PDF says "MUST USE CENTRAL DISPATCH" or "Central Dispatch app required" → IGNORE IT → requiredApp: null
- ⚠️ NEVER set requiredApp to "super_dispatch" just because the PDF was created on Super Dispatch platform
- If no app requirement mentioned → requiredApp: null

REQUIRED FIELDS:
{
"loadboardSource": "super_dispatch|central_dispatch|carsarrive|ship_cars|acv_transport|runbuggy|direct_freight|montway|carpool|copart|carvana|haulex|rpm|autosled|acertus|unknown",
  "load_id": "order/BOL number",
  "carrierName": "company name from Carrier Information section (the trucking company)",
  "brokerName": "shipper/broker company name from TOP of document",
  "brokerPhone": "broker company phone (NOT pickup location phone)",
  "brokerEmail": "broker company email",
  "brokerAddress": "broker company address (NOT pickup address)",
  "amount": numeric (carrier's total payment - NO $ or commas),
  "vehicles": [{"make": "", "model": "", "year": "", "vin": ""}],
  "vehicleCount": total,
  "pickupDateTime": "YYYY-MM-DDTHH:mm (use T00:00 if no time)",
  "pickupLocation": "full pickup address from Pickup Information section",
  "pickupLocationName": "facility/dealer name at pickup",
  "pickupContactPhone": "phone number at pickup location (NOT carrier phone)",
  "deliveryDateTime": "YYYY-MM-DDTHH:mm",
  "deliveryLocation": "full delivery address from Delivery Information section", 
  "deliveryLocationName": "facility/dealer name at delivery",
  "deliveryContactPhone": "phone number at delivery location",
  "mileage": numeric,
  "pickupInstructions": "gate codes, contact info, special notes",
  "deliveryInstructions": "delivery notes",
  "driverCollectionAmount": COD amount driver collects (numeric only),
"brokerFeeCollection": broker fee (positive number, numeric only),
  "storageFee": storage fee amount (numeric only, null if none),
    "paymentMethod": "use exact value from mapping above",
  "paymentTerms": "use exact value from mapping above",
  "collectionInstructions": "special payment instructions",
  "requiredApp": "super_dispatch|runbuggy|carpool|ship_cars|acertus|haulex|carsarrive|rpm|autosled|carvana|copart|null"
}

Use null for missing fields. Return ONLY the JSON.`,

  reefer: `
Extract refrigerated load data. Return ONLY valid JSON.

IMPORTANT ID RULES:
- load_id = order number, BOL number, Contract #, or Dispatch Order
- Look for: "Order ID", "Contract Number", "Contract #", "Dispatch Order", "Dispatch #"

CRITICAL AMOUNT/PAYMENT RULES:
- amount = total carrier payment (look for: rate, load rate, payout, carrier pay, total rate, line haul, gross pay)
- Extract the LARGEST dollar amount as the carrier payment
- IMPORTANT CURRENCY PARSING:
  * "1039,00" or "1039.00" = 1039 (NOT 103900!)
  * "1,039.00" = 1039
  * "$1,039" = 1039
  * European format "1.039,00" = 1039
  * If amount > 50000, double-check - it's likely a parsing error
- Remove ALL symbols and use numeric only

PHONE NUMBER EXTRACTION RULES:
- pickupContactPhone = phone number at pickup location (shipper contact)
- deliveryContactPhone = phone number at delivery location (consignee contact)
- Extract both if available, use null if not found

🆕 BROKER/SHIPPER CONTACT EXTRACTION:
- brokerName = Company name from "Shipper" or "Broker" section (the company arranging transport)
- brokerPhone = Broker company's office phone (NOT pickup location phone)
- brokerEmail = Broker company's email address
- brokerAddress = Broker company's office address (NOT pickup address)

PAYMENT METHOD MAPPING:
- "cash", "COD" → "cash"
- "check" → "check"
- "cashier's check" → "cashiers_check"
- "ACH", "bank transfer" → "ach"
- "Zelle" → "zelle"
- "Venmo" → "venmo"
- "Cash App" → "cashapp"
- "credit card" → "credit_card"
- "comcheck" → "comcheck"
- "factoring" → "factoring"

PAYMENT TERMS MAPPING:
- "on delivery", "COD" → "on_delivery"
- "on pickup" → "on_pickup"
- "2 days" → "2_business_days"
- "5 days" → "5_business_days"
- "7 days" → "7_business_days"
- "10 days" → "10_business_days"
- "15 days" → "15_business_days"
- "20 days" → "20_business_days"
- "30 days", "net 30" → "30_business_days"

BROKER = Company arranging transport (in Shipper/Broker section)

REQUIRED FIELDS:
{
  "load_id": "order/BOL number",
  "brokerName": "broker company name",
  "brokerPhone": "broker company phone",
  "brokerEmail": "broker company email",
  "brokerAddress": "broker company address",
  "amount": numeric (carrier's total payment - NO $ or commas),
  "reeferTemp": temperature in Fahrenheit,
  "reeferTempRange": "frozen|fresh|produce|pharmacy",
  "reeferInstructions": "maintain temp, continuous run, etc",
  "pickupDateTime": "YYYY-MM-DDTHH:mm",
  "pickupLocation": "full address",
  "pickupLocationName": "warehouse/facility name",
  "pickupContactPhone": "phone number at pickup location",
  "deliveryDateTime": "YYYY-MM-DDTHH:mm",
  "deliveryLocation": "full address",
  "deliveryLocationName": "warehouse/facility name",
  "deliveryContactPhone": "phone number at delivery location",
  "mileage": numeric,
  "cargoWeight": pounds,
  "palletCount": number of pallets,
  "pickupInstructions": "appointment, dock info",
  "deliveryInstructions": "delivery appointment, dock",
  "driverCollectionAmount": numeric only if COD,
  "brokerFeeCollection": numeric only,
  "paymentMethod": "use exact value from mapping",
  "paymentTerms": "use exact value from mapping",
  "collectionInstructions": "special payment instructions"
}

Use null for missing fields. Return ONLY the JSON.`,

  flatbed: `
Extract flatbed load data. Return ONLY valid JSON.

CRITICAL AMOUNT/PAYMENT RULES:
- amount = total carrier payment (look for: rate, load rate, payout, carrier pay, total rate, line haul, gross pay)
- Extract the LARGEST dollar amount as the carrier payment
- IMPORTANT CURRENCY PARSING:
  * "1039,00" or "1039.00" = 1039 (NOT 103900!)
  * "1,039.00" = 1039
  * "$1,039" = 1039
  * European format "1.039,00" = 1039
  * If amount > 50000, double-check - it's likely a parsing error
- Remove ALL symbols and use numeric only

PHONE NUMBER EXTRACTION RULES:
- pickupContactPhone = phone number at pickup location (shipper contact)
- deliveryContactPhone = phone number at delivery location (consignee contact)
- Extract both if available, use null if not found

🆕 BROKER/SHIPPER CONTACT EXTRACTION:
- brokerName = Company name from "Shipper" or "Broker" section
- brokerPhone = Broker company's office phone (NOT pickup location phone)
- brokerEmail = Broker company's email address
- brokerAddress = Broker company's office address (NOT pickup address)

PAYMENT METHOD & TERMS MAPPING:
Same as auto hauling section above - use exact mapped values

BROKER = Company arranging transport (in Shipper/Broker section)

REQUIRED FIELDS:
{
  "load_id": "order/BOL number",
  "brokerName": "broker company name",
  "brokerPhone": "broker company phone",
  "brokerEmail": "broker company email",
  "brokerAddress": "broker company address",
  "amount": numeric (carrier's total payment - NO $ or commas),
  "weight": total pounds,
  "dimensions": "L x W x H",
  "tarpingRequired": "yes|no|partial",
  "securementType": "chains|straps|both",
  "pickupDateTime": "YYYY-MM-DDTHH:mm",
  "pickupLocation": "full address",
  "pickupLocationName": "job site/facility",
  "pickupContactPhone": "phone number at pickup location",
  "deliveryDateTime": "YYYY-MM-DDTHH:mm",
  "deliveryLocation": "full address",
  "deliveryLocationName": "job site/facility",
  "deliveryContactPhone": "phone number at delivery location",
  "mileage": numeric,
  "cargoType": "steel|lumber|machinery|construction",
  "pickupInstructions": "crane needed, forklift available",
  "deliveryInstructions": "placement instructions",
  "driverCollectionAmount": numeric only if COD,
  "brokerFeeCollection": numeric only,
  "paymentMethod": "use exact value from mapping",
  "paymentTerms": "use exact value from mapping",
  "collectionInstructions": "special payment instructions"
}

Use null for missing fields. Return ONLY the JSON.`,

  dryvan: `
Extract dry van load data. Return ONLY valid JSON.

CRITICAL AMOUNT/PAYMENT RULES:
- amount = total carrier payment (look for: rate, load rate, payout, carrier pay, total rate, line haul, gross pay)
- Extract the LARGEST dollar amount as the carrier payment
- IMPORTANT CURRENCY PARSING:
  * "1039,00" or "1039.00" = 1039 (NOT 103900!)
  * "1,039.00" = 1039
  * "$1,039" = 1039
  * European format "1.039,00" = 1039
  * If amount > 50000, double-check - it's likely a parsing error
- Remove ALL symbols and use numeric only

PHONE NUMBER EXTRACTION RULES:
- pickupContactPhone = phone number at pickup location (shipper contact)
- deliveryContactPhone = phone number at delivery location (consignee contact)
- Extract both if available, use null if not found

🆕 BROKER/SHIPPER CONTACT EXTRACTION:
- brokerName = Company name from "Shipper" or "Broker" section
- brokerPhone = Broker company's office phone (NOT pickup location phone)
- brokerEmail = Broker company's email address
- brokerAddress = Broker company's office address (NOT pickup address)

PAYMENT METHOD & TERMS MAPPING:
Same as auto hauling section above - use exact mapped values

BROKER = Company arranging transport (in Shipper/Broker section)

REQUIRED FIELDS:
{
  "load_id": "order/BOL number",
  "brokerName": "broker company name",
  "brokerPhone": "broker company phone",
  "brokerEmail": "broker company email",
  "brokerAddress": "broker company address",
  "amount": numeric (carrier's total payment - NO $ or commas),
  "cargoWeight": pounds,
  "palletCount": number of pallets,
  "cargoType": "general_freight|food_beverage|electronics|clothing|paper_products|automotive_parts",
  "trailerType": "swing_door|roll_up",
  "pickupDateTime": "YYYY-MM-DDTHH:mm",
  "pickupLocation": "full address",
  "pickupLocationName": "warehouse name",
  "pickupContactPhone": "phone number at pickup location",
  "deliveryDateTime": "YYYY-MM-DDTHH:mm",
  "deliveryLocation": "full address",
  "deliveryLocationName": "warehouse name",
  "deliveryContactPhone": "phone number at delivery location",
  "mileage": numeric,
  "loadingEquipment": "dock_high|ground_level|liftgate_required",
  "pickupInstructions": "dock number, appointment",
  "deliveryInstructions": "receiving hours, dock",
  "driverCollectionAmount": numeric only if COD,
  "brokerFeeCollection": numeric only,
  "paymentMethod": "use exact value from mapping",
  "paymentTerms": "use exact value from mapping",
  "collectionInstructions": "special payment instructions"
}

Use null for missing fields. Return ONLY the JSON.`,

  tanker: `
Extract tanker load data. Return ONLY valid JSON.

CRITICAL AMOUNT/PAYMENT RULES:
- amount = total carrier payment (look for: rate, load rate, payout, carrier pay, total rate, line haul, gross pay)
- Extract the LARGEST dollar amount as the carrier payment
- IMPORTANT CURRENCY PARSING:
  * "1039,00" or "1039.00" = 1039 (NOT 103900!)
  * "1,039.00" = 1039
  * "$1,039" = 1039
  * European format "1.039,00" = 1039
  * If amount > 50000, double-check - it's likely a parsing error
- Remove ALL symbols and use numeric only

PHONE NUMBER EXTRACTION RULES:
- pickupContactPhone = phone number at pickup location (shipper contact)
- deliveryContactPhone = phone number at delivery location (consignee contact)
- Extract both if available, use null if not found

🆕 BROKER/SHIPPER CONTACT EXTRACTION:
- brokerName = Company name from "Shipper" or "Broker" section
- brokerPhone = Broker company's office phone (NOT pickup location phone)
- brokerEmail = Broker company's email address
- brokerAddress = Broker company's office address (NOT pickup address)

PAYMENT METHOD & TERMS MAPPING:
Same as auto hauling section above - use exact mapped values

BROKER = Company arranging transport (in Shipper/Broker section)

REQUIRED FIELDS:
{
  "load_id": "order/BOL number",
  "brokerName": "broker company name",
  "brokerPhone": "broker company phone",
  "brokerEmail": "broker company email",
  "brokerAddress": "broker company address",
  "amount": numeric (carrier's total payment - NO $ or commas),
  "productType": "food_grade|chemical|petroleum|water",
  "hazmatRequired": "yes|no",
  "tankWashRequired": "before|after|both|none",
  "pickupDateTime": "YYYY-MM-DDTHH:mm",
  "pickupLocation": "full address",
  "pickupLocationName": "plant/facility",
  "pickupContactPhone": "phone number at pickup location",
  "deliveryDateTime": "YYYY-MM-DDTHH:mm", 
  "deliveryLocation": "full address",
  "deliveryLocationName": "plant/facility",
  "deliveryContactPhone": "phone number at delivery location",
  "mileage": numeric,
  "quantity": "gallons or pounds",
  "pickupInstructions": "tank requirements, PPE",
  "deliveryInstructions": "offload instructions",
  "driverCollectionAmount": numeric only if COD,
  "brokerFeeCollection": numeric only,
  "paymentMethod": "use exact value from mapping",
  "paymentTerms": "use exact value from mapping",
  "collectionInstructions": "special payment instructions"
}

Use null for missing fields. Return ONLY the JSON.`
};

module.exports = { COMMODITY_PROMPTS };