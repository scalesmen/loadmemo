// src/components/liveload/utils/liveLoadConstants.js

/**
 * LiveLoad Status Values
 */
export const LIVELOAD_STATUS = {
  POSTED: 'posted',           // Load is live, accepting bids
  BIDDING: 'bidding',         // Has bids, awaiting dealer decision
  ACCEPTED: 'accepted',       // Bid accepted, waiting for pickup
  IN_TRANSIT: 'in_transit',   // Vehicle picked up, in transit
  DELIVERED: 'delivered',     // Delivered, pending payment capture
  COMPLETED: 'completed',     // Payment captured, ratings done
  EXPIRED: 'expired',         // No bids accepted before expiration
  CANCELLED: 'cancelled'      // Cancelled by dealer
};

/**
 * Bid Status Values
 */
export const BID_STATUS = {
  PENDING: 'pending',         // Awaiting dealer response
  ACCEPTED: 'accepted',       // Dealer accepted this bid
  DECLINED: 'declined',       // Dealer declined
  EXPIRED: 'expired',         // LiveLoad expired before response
  WITHDRAWN: 'withdrawn'      // Carrier withdrew bid
};

/**
 * Document Types (from PDF parsing)
 */
export const DOCUMENT_TYPES = {
  GATE_PASS: 'gate_pass',
  BILL_OF_SALE: 'bill_of_sale',
  DISPATCH_SHEET: 'dispatch_sheet',
  VEHICLE_RELEASE: 'vehicle_release',
  TRANSPORTER_AUTH: 'transporter_auth'
};

/**
 * PDF Sources (auction houses/platforms)
 */
export const PDF_SOURCES = {
  MANHEIM: 'manheim',
  ADESA: 'adesa',
  OPENLANE: 'openlane',
  SMARTAUCTION: 'smartauction',
  BACKLOTCARS: 'backlotcars',
  COPART: 'copart',
  IAAI: 'iaai',
  OTHER: 'other'
};

/**
 * Vehicle Condition
 */
export const VEHICLE_CONDITION = {
  OPERABLE: 'operable',
  INOPERABLE: 'inoperable'
};

/**
 * Payment Status
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',         // No payment method yet
  AUTHORIZED: 'authorized',   // Hold placed on card
  CAPTURED: 'captured',       // Payment charged
  RELEASED: 'released',       // Authorization released (cancelled/expired)
  FAILED: 'failed'            // Payment failed
};

/**
 * Insurance Verification Status
 */
export const INSURANCE_STATUS = {
  NOT_VERIFIED: 'not_verified',
  PENDING: 'pending',
  VERIFIED: 'verified',
  EXPIRED: 'expired',
  REJECTED: 'rejected'
};

/**
 * LiveLoad Display Status Colors
 */
export const LIVELOAD_STATUS_COLORS = {
  posted: 'bg-green-100 text-green-800 border-green-200',
  bidding: 'bg-blue-100 text-blue-800 border-blue-200',
  accepted: 'bg-purple-100 text-purple-800 border-purple-200',
  in_transit: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  delivered: 'bg-teal-100 text-teal-800 border-teal-200',
  completed: 'bg-gray-100 text-gray-800 border-gray-200',
  expired: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200'
};

/**
 * Bid Status Colors
 */
export const BID_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-600',
  withdrawn: 'bg-gray-100 text-gray-500'
};

/**
 * Platform Configuration
 */
export const PLATFORM_CONFIG = {
  PLATFORM_FEE_PERCENT: 0.05,  // 5% platform fee
  DEFAULT_EXPIRATION_HOURS: 24,
  MAX_BIDS_PER_LOAD: 20,
  MIN_BID_AMOUNT: 50,
  MAX_BID_AMOUNT: 50000,
  PROXIMITY_RADIUS_MILES: 100, // Default search radius
  MAX_VEHICLES_PER_LOAD: 9
};

/**
 * Dealer Business Types
 */
export const DEALER_TYPES = {
  USED_CAR: 'used_car_dealer',
  NEW_CAR: 'new_car_dealer',
  FRANCHISE: 'franchise_dealer',
  INDEPENDENT: 'independent_dealer',
  AUCTION: 'auction',
  PRIVATE: 'private_seller'
};

/**
 * Sort Options for LiveLoad List
 */
export const SORT_OPTIONS = [
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'newest', label: 'Newest First' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'distance', label: 'Distance: Nearest' }
];

/**
 * Filter Options
 */
export const DISTANCE_FILTERS = [
  { value: 25, label: 'Within 25 miles' },
  { value: 50, label: 'Within 50 miles' },
  { value: 100, label: 'Within 100 miles' },
  { value: 250, label: 'Within 250 miles' },
  { value: 500, label: 'Within 500 miles' },
  { value: 'all', label: 'All Distances' }
];

/**
 * Time Filters
 */
export const EXPIRATION_FILTERS = [
  { value: '1h', label: 'Expires in 1 hour' },
  { value: '3h', label: 'Expires in 3 hours' },
  { value: '6h', label: 'Expires in 6 hours' },
  { value: 'today', label: 'Expires today' },
  { value: 'all', label: 'All' }
];

/**
 * Empty Initial Form State for LiveLoad
 */
export const getInitialLiveLoadForm = () => ({
  // Vehicle Info
  vehicles: [{
    vin: '',
    year: '',
    make: '',
    model: '',
    color: '',
    body: '',
    condition: VEHICLE_CONDITION.OPERABLE,
    lotLocation: ''
  }],
  vehicleCount: 1,
  
  // Pickup Info
  pickup: {
    facilityName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    instructions: '',
    releaseId: ''
  },
  
  // Delivery Info
  delivery: {
    facilityName: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    instructions: '',
    useMyLocation: false
  },
  
  // Pricing
  suggestedPrice: '',
  minAcceptablePrice: '',
  
  // Timing
  expiresAt: null,
  expirationPreset: 'eod',  // eod | 6h | 12h | custom
  
  // Documents
  documents: [],
  
  // Source
  sourceType: 'pdf_import',
  pdfSource: ''
});

/**
 * Initial Bid Form State
 */
export const getInitialBidForm = () => ({
  bidAmount: '',
  estimatedPickupDate: '',
  estimatedDeliveryDate: '',
  notes: '',
  trailerType: 'open',      // open | enclosed
  availableSpots: 1
});

/**
 * Notification Types for LiveLoad
 */
export const NOTIFICATION_TYPES = {
  NEW_BID: 'liveload_new_bid',
  BID_ACCEPTED: 'liveload_bid_accepted',
  BID_DECLINED: 'liveload_bid_declined',
  LOAD_EXPIRING: 'liveload_expiring',
  LOAD_EXPIRED: 'liveload_expired',
  PICKUP_CONFIRMED: 'liveload_pickup_confirmed',
  DELIVERY_CONFIRMED: 'liveload_delivery_confirmed',
  RATING_RECEIVED: 'liveload_rating_received'
};

/**
 * Action Permissions by Status
 */
export const LIVELOAD_ACTIONS = {
  [LIVELOAD_STATUS.POSTED]: {
    canEdit: true,
    canCancel: true,
    canBid: true,
    canAcceptBid: true
  },
  [LIVELOAD_STATUS.BIDDING]: {
    canEdit: false,
    canCancel: true,
    canBid: true,
    canAcceptBid: true
  },
  [LIVELOAD_STATUS.ACCEPTED]: {
    canEdit: false,
    canCancel: false,
    canBid: false,
    canAcceptBid: false,
    canMarkPickedUp: true
  },
  [LIVELOAD_STATUS.IN_TRANSIT]: {
    canEdit: false,
    canCancel: false,
    canBid: false,
    canMarkDelivered: true
  },
  [LIVELOAD_STATUS.DELIVERED]: {
    canEdit: false,
    canRate: true
  },
  [LIVELOAD_STATUS.COMPLETED]: {
    canEdit: false,
    canViewHistory: true
  },
  [LIVELOAD_STATUS.EXPIRED]: {
    canEdit: false,
    canRepost: true
  },
  [LIVELOAD_STATUS.CANCELLED]: {
    canEdit: false,
    canRepost: true
  }
};

export default {
  LIVELOAD_STATUS,
  BID_STATUS,
  DOCUMENT_TYPES,
  PDF_SOURCES,
  VEHICLE_CONDITION,
  PAYMENT_STATUS,
  INSURANCE_STATUS,
  LIVELOAD_STATUS_COLORS,
  BID_STATUS_COLORS,
  PLATFORM_CONFIG,
  DEALER_TYPES,
  SORT_OPTIONS,
  DISTANCE_FILTERS,
  EXPIRATION_FILTERS,
  getInitialLiveLoadForm,
  getInitialBidForm,
  NOTIFICATION_TYPES,
  LIVELOAD_ACTIONS
};
