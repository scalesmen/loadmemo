// src/components/loads/utils/constants.js

/**
 * Load status options
 */
export const LOAD_STATUSES = [
  "Booked", 
  "Dispatched", 
  "In Transit", 
  "Delivered", 
  "Cancelled"
];

/**
 * Default statuses for "current" loads (when checkbox is unchecked)
 */
export const DEFAULT_CURRENT_STATUSES = [
  "Booked", 
  "Dispatched", 
  "In Transit"
];

/**
 * All statuses including completed (when checkbox is checked)
 */
export const ALL_STATUSES = [
  "Booked", 
  "Dispatched", 
  "In Transit",
  "Delivered",
  "Cancelled"
];

/**
 * Status color mappings for UI
 */
export const STATUS_COLORS = {
  'Booked': 'bg-blue-100 text-blue-800 border-blue-200',
  'Dispatched': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'In Transit': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Delivered': 'bg-green-100 text-green-800 border-green-200',
  'Cancelled': 'bg-red-100 text-red-800 border-red-200'
};

/**
 * Payment method options
 */
export const PAYMENT_METHODS = [
  { value: "", label: "Select Payment Method" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "cashiers_check", label: "Cashier Check" },
  { value: "ach", label: "ACH" },
  { value: "tch", label: "TCH" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "cashapp", label: "Cashapp" },
  { value: "uship_code", label: "uShip Code" },
  { value: "comcheck", label: "Comcheck" },
  { value: "credit_card", label: "Credit Card" },
  { value: "factoring", label: "Factoring" }
];

/**
 * Payment terms options
 */
export const PAYMENT_TERMS = [
  { value: "", label: "Select Payment Terms" },
  { value: "on_delivery", label: "On Delivery" },
  { value: "on_pickup", label: "On Pickup" },
  { value: "same_day_ach", label: "Same Day ACH" },
  { value: "quick_pay", label: "Quick Pay" },
  { value: "2_business_days", label: "2 Business Days" },
  { value: "5_business_days", label: "5 Business Days" },
  { value: "7_business_days", label: "7 Business Days" },
  { value: "10_business_days", label: "10 Business Days" },
  { value: "15_business_days", label: "15 Business Days" },
  { value: "20_business_days", label: "20 Business Days" },
  { value: "30_business_days", label: "30 Business Days" }
];

/**
 * Temperature range options for reefer
 */
export const TEMP_RANGES = [
  { value: "", label: "Select Range" },
  { value: "frozen", label: "Frozen (-10°F to 10°F)" },
  { value: "fresh", label: "Fresh (32°F to 38°F)" },
  { value: "produce", label: "Produce (34°F to 40°F)" },
  { value: "pharmacy", label: "Pharmacy (35°F to 46°F)" }
];

/**
 * Tarping options for flatbed
 */
export const TARPING_OPTIONS = [
  { value: "", label: "Select" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "partial", label: "Partial" }
];

/**
 * Securement type options for flatbed
 */
export const SECUREMENT_TYPES = [
  { value: "", label: "Select" },
  { value: "chains", label: "Chains" },
  { value: "straps", label: "Straps" },
  { value: "both", label: "Both" }
];

/**
 * Trailer type options for dry van
 */
export const TRAILER_TYPES = [
  { value: "", label: "Select Type" },
  { value: "swing_door", label: "Swing Door" },
  { value: "roll_up_door", label: "Roll Up Door" },
  { value: "double_door", label: "Double Door" },
  { value: "side_door", label: "Side Door" }
];

/**
 * Loading equipment options for dry van
 */
export const LOADING_EQUIPMENT = [
  { value: "", label: "Select Equipment" },
  { value: "dock_high", label: "Dock High" },
  { value: "ground_level", label: "Ground Level" },
  { value: "liftgate_required", label: "Liftgate Required" },
  { value: "forklift_available", label: "Forklift Available" }
];

/**
 * Cargo type options for dry van
 */
export const CARGO_TYPES = [
  { value: "", label: "Select Cargo" },
  { value: "general_freight", label: "General Freight" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "electronics", label: "Electronics" },
  { value: "clothing_textiles", label: "Clothing & Textiles" },
  { value: "paper_products", label: "Paper Products" },
  { value: "automotive_parts", label: "Automotive Parts" },
  { value: "pharmaceuticals", label: "Pharmaceuticals" },
  { value: "other", label: "Other" }
];

/**
 * Product type options for tanker
 */
export const PRODUCT_TYPES = [
  { value: "", label: "Select Product" },
  { value: "food_grade", label: "Food Grade" },
  { value: "chemical", label: "Chemical" },
  { value: "petroleum", label: "Petroleum" },
  { value: "water", label: "Water" },
  { value: "other", label: "Other" }
];

/**
 * Hazmat options
 */
export const HAZMAT_OPTIONS = [
  { value: "", label: "Select" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

/**
 * Tank wash options
 */
export const TANK_WASH_OPTIONS = [
  { value: "", label: "Select" },
  { value: "before", label: "Before Loading" },
  { value: "after", label: "After Delivery" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" }
];

/**
 * Driver required apps for inspections/payments
 */
export const DRIVER_APPS = [
  { 
    value: "", 
    label: "No App Required" 
  },
  { 
    value: "super_dispatch", 
    label: "Super Dispatch",
    iosUrl: "https://apps.apple.com/us/app/super-dispatch-bol-app-epod/id921598152",
    androidUrl: "https://play.google.com/store/apps/details?id=com.mysuperdispatch.android"
  },
  { 
    value: "carvana", 
    label: "Carvana",
    iosUrl: "https://apps.apple.com/us/app/load-manager-by-clearpath-tms/id1562398058",
    androidUrl: "https://play.google.com/store/apps/details?id=com.clearpathtms.loadmanager"
  },
  { 
    value: "runbuggy", 
    label: "Runbuggy",
    iosUrl: "https://apps.apple.com/us/app/runbuggy/id1170457407",
    androidUrl: "https://play.google.com/store/apps/details?id=com.runbuggy.app"
  },
  { 
    value: "carpool", 
    label: "Carpool",
    iosUrl: "https://apps.apple.com/us/app/carpool-logistics/id1631357531",
    androidUrl: "https://play.google.com/store/apps/details?id=com.carpoollogistics.driver"
  },
  { 
    value: "ship_cars", 
    label: "Ship.cars",
    iosUrl: "https://apps.apple.com/us/app/smarthaul-app-by-ship-cars/id1271063208",
    androidUrl: "https://play.google.com/store/apps/details?id=cars.ship.epod.mobile"
  },
  { 
    value: "acertus", 
    label: "Acertus",
    iosUrl: "https://apps.apple.com/us/app/vinlocity-carrier/id1486653323",
    androidUrl: "https://play.google.com/store/apps/details?id=com.backupparachute.vinlocity.carrier"
  },
  { 
    value: "central_dispatch", 
    label: "Central Dispatch",
    iosUrl: "https://apps.apple.com/us/app/centraldispatch-carrier-hub/id6469280412",
    androidUrl: "https://play.google.com/store/apps/details?id=com.coxauto.logistics.mobile.cd"
  },
  { 
    value: "haulex", 
    label: "Haulex",
    iosUrl: "https://apps.apple.com/app/haulex/id1466449120",
    androidUrl: "https://play.google.com/store/apps/details?id=app.dieseldispatch.DieselDispatch"
  },
  { 
    value: "carsarrive", 
    label: "CarsArrive",
    iosUrl: "https://apps.apple.com/app/carsarrive-plus/id1566419386",
    androidUrl: "https://play.google.com/store/apps/details?id=com.openlane.mobile.carsarriveplus"
  },
  { 
    value: "rpm", 
    label: "RPM",
    iosUrl: "https://apps.apple.com/app/rpm-drive/id1476279456",
    androidUrl: "https://play.google.com/store/apps/details?id=com.loadrpm.Ike"
  },
  { 
    value: "autosled", 
    label: "Autosled",
    iosUrl: "https://apps.apple.com/app/autosled/id1482801380",
    androidUrl: "https://play.google.com/store/apps/details?id=com.autosled"
  },
  { 
  value: "copart", 
  label: "Copart",
  iosUrl: "https://apps.apple.com/us/app/copart-transportation/id1502aborrar",
  androidUrl: "https://play.google.com/store/apps/details?id=com.copart.transportation"
},
];

/**
 * Commodity types
 */
export const COMMODITY_TYPES = {
  AUTOMOBILE_HAULING: 'automobile_hauling',
  DRY_VAN: 'dry_van',
  REEFER: 'reefer',
  FLATBED: 'flatbed',
  TANKER: 'tanker'
};

/**
 * Initial load form state
 */
export const getInitialLoadFormState = () => ({
  load_id: "",
  companyName: "",
  companyId: null,
  pickupDateTime: "",
  pickupLocation: "",
  pickupLocationName: "",
  deliveryDateTime: "",
  deliveryLocation: "",
  deliveryLocationName: "",
  amount: "",
  mileage: "",
  brokerId: "",
  brokerName: "",
  driverId: "",
  truckId: "",
  dispatcherId: "",
  status: "Booked",
  pickupInstructions: "",
  deliveryInstructions: "",
  adminNotes: "",
  actualPU: null,
  actualDEL: null,
  // Payment collection fields
  driverCollectionAmount: "",
  brokerFeeCollection: "",
  storageFee: "",
  collectionInstructions: "",
  paymentMethod: "",
  paymentTerms: "",
  // Vehicle fields (automobiles)
  vehicles: [{ make: "", model: "", year: "", vin: "", inop: false }],
  vehicleCount: 1,
  // Reefer fields
  reeferTemp: "",
  reeferTempRange: "",
  reeferInstructions: "",
  // Flatbed fields  
  weight: "",
  dimensions: "",
  tarpingRequired: "",
  securementType: "",
  // Tanker fields
  productType: "",
  hazmatRequired: "",
  tankWashRequired: "",
  // Dry van fields
  cargoWeight: "",
  palletCount: "",
  trailerType: "",
  loadingEquipment: "",
  cargoType: "",
  // Factoring fields
  factoringApplied: false,
  factoringPercentage: '',
  factoringAmount: '',
  factoringRuleId: '',
  factoringBrokerName: '',
  // Source tracking
  sourceType: "",
  // Required app for driver inspections
  requiredApp: "",
  // 🆕 PDF attachment metadata (populated when load is created from PDF import)
  // This will be used to auto-attach the PDF as a dispatch document
  attachedPdfMetadata: null
});

/**
 * Default filter state
 */
export const getDefaultFilters = () => ({
  driverId: 'all',
  truckId: 'all',
  status: 'all',
  brokerId: 'all',
  dispatcherId: 'all',
  searchLoadId: '',
  showCompleted: false, 
  showUnassignedOnly: false
});