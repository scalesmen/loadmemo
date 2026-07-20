// src/components/liveload/utils/liveLoadHelpers.js

import { PLATFORM_CONFIG, LIVELOAD_STATUS, BID_STATUS } from './liveLoadConstants';

/**
 * Calculate distance between two geopoints (Haversine formula)
 * @param {Object} point1 - {latitude, longitude}
 * @param {Object} point2 - {latitude, longitude}
 * @returns {number} Distance in miles
 */
export const calculateDistanceMiles = (point1, point2) => {
  if (!point1 || !point2) return null;
  
  const toRad = (value) => (value * Math.PI) / 180;
  
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(point2.latitude - point1.latitude);
  const dLon = toRad(point2.longitude - point1.longitude);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.latitude)) *
    Math.cos(toRad(point2.latitude)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance);
};

/**
 * Calculate platform fee
 * @param {number} amount - Bid amount
 * @returns {number} Platform fee
 */
export const calculatePlatformFee = (amount) => {
  return Math.round(amount * PLATFORM_CONFIG.PLATFORM_FEE_PERCENT * 100) / 100;
};

/**
 * Calculate total charge (bid + platform fee)
 * @param {number} bidAmount - Bid amount
 * @returns {Object} { bidAmount, platformFee, totalCharge }
 */
export const calculateTotalCharge = (bidAmount) => {
  const fee = calculatePlatformFee(bidAmount);
  return {
    bidAmount: parseFloat(bidAmount),
    platformFee: fee,
    totalCharge: parseFloat(bidAmount) + fee
  };
};

/**
 * Format currency
 * @param {number} amount 
 * @returns {string}
 */
export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Format time remaining until expiration
 * @param {Date|Timestamp} expiresAt 
 * @returns {Object} { text, isUrgent, isExpired }
 */
export const formatTimeRemaining = (expiresAt) => {
  if (!expiresAt) return { text: 'Unknown', isUrgent: false, isExpired: false };
  
  const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
  const now = new Date();
  const diff = expiry - now;
  
  if (diff <= 0) {
    return { text: 'Expired', isUrgent: true, isExpired: true };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return { 
      text: `${days}d ${hours % 24}h`, 
      isUrgent: false, 
      isExpired: false 
    };
  }
  
  if (hours > 0) {
    return { 
      text: `${hours}h ${minutes}m`, 
      isUrgent: hours <= 2, 
      isExpired: false 
    };
  }
  
  return { 
    text: `${minutes}m`, 
    isUrgent: true, 
    isExpired: false 
  };
};

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {Date|Timestamp} timestamp 
 * @returns {string}
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
};

/**
 * Format vehicle display string
 * @param {Object} vehicle - Vehicle object
 * @param {boolean} includeVin - Whether to include VIN
 * @returns {string}
 */
export const formatVehicleDisplay = (vehicle, includeVin = false) => {
  if (!vehicle) return 'Unknown Vehicle';
  
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  let display = parts.join(' ') || 'Unknown Vehicle';
  
  if (vehicle.color) {
    display += ` (${vehicle.color})`;
  }
  
  if (includeVin && vehicle.vin) {
    display += ` - VIN: ${vehicle.vin}`;
  }
  
  return display;
};

/**
 * Format location for display (city, state only)
 * @param {Object} location - Location object
 * @param {boolean} includeAddress - Whether to include full address
 * @returns {string}
 */
export const formatLocationDisplay = (location, includeAddress = false) => {
  if (!location) return 'Unknown';
  
  if (includeAddress && location.address) {
    return `${location.address}, ${location.city}, ${location.state} ${location.zip}`;
  }
  
  return `${location.city}, ${location.state}`;
};

/**
 * Format phone number
 * @param {string} phone 
 * @returns {string}
 */
export const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
};

/**
 * Get status display text
 * @param {string} status 
 * @returns {string}
 */
export const getStatusDisplayText = (status) => {
  const statusMap = {
    [LIVELOAD_STATUS.POSTED]: 'Live',
    [LIVELOAD_STATUS.BIDDING]: 'Receiving Bids',
    [LIVELOAD_STATUS.ACCEPTED]: 'Bid Accepted',
    [LIVELOAD_STATUS.IN_TRANSIT]: 'In Transit',
    [LIVELOAD_STATUS.DELIVERED]: 'Delivered',
    [LIVELOAD_STATUS.COMPLETED]: 'Completed',
    [LIVELOAD_STATUS.EXPIRED]: 'Expired',
    [LIVELOAD_STATUS.CANCELLED]: 'Cancelled'
  };
  
  return statusMap[status] || status;
};

/**
 * Get bid status display text
 * @param {string} status 
 * @returns {string}
 */
export const getBidStatusDisplayText = (status) => {
  const statusMap = {
    [BID_STATUS.PENDING]: 'Pending',
    [BID_STATUS.ACCEPTED]: 'Accepted',
    [BID_STATUS.DECLINED]: 'Declined',
    [BID_STATUS.EXPIRED]: 'Expired',
    [BID_STATUS.WITHDRAWN]: 'Withdrawn'
  };
  
  return statusMap[status] || status;
};

/**
 * Estimate transit days based on distance
 * @param {number} miles 
 * @returns {number}
 */
export const estimateTransitDays = (miles) => {
  if (!miles) return null;
  
  // Rough estimate: 500 miles per day for car haulers
  if (miles <= 250) return 1;
  if (miles <= 500) return 2;
  if (miles <= 1000) return 3;
  if (miles <= 1500) return 4;
  return Math.ceil(miles / 400);
};

/**
 * Validate VIN format
 * @param {string} vin 
 * @returns {boolean}
 */
export const isValidVin = (vin) => {
  if (!vin) return false;
  const cleaned = vin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.length === 17;
};

/**
 * Mask sensitive information for unauthorized viewers
 * @param {string} value 
 * @param {number} visibleChars - Number of characters to show at start
 * @returns {string}
 */
export const maskSensitiveInfo = (value, visibleChars = 4) => {
  if (!value) return '••••••••';
  if (value.length <= visibleChars) return '•'.repeat(value.length);
  return value.slice(0, visibleChars) + '•'.repeat(value.length - visibleChars);
};

/**
 * Check if a LiveLoad can receive bids
 * @param {Object} liveLoad 
 * @returns {boolean}
 */
export const canReceiveBids = (liveLoad) => {
  if (!liveLoad) return false;
  
  const validStatuses = [LIVELOAD_STATUS.POSTED, LIVELOAD_STATUS.BIDDING];
  if (!validStatuses.includes(liveLoad.status)) return false;
  
  // Check expiration
  const expiry = liveLoad.expiresAt?.toDate?.() || new Date(liveLoad.expiresAt);
  if (expiry <= new Date()) return false;
  
  return true;
};

/**
 * Get default expiration time (end of day)
 * @param {string} preset - 'eod' | '6h' | '12h' | 'tomorrow'
 * @returns {Date}
 */
export const getDefaultExpiration = (preset = 'eod') => {
  const now = new Date();
  
  switch (preset) {
    case '6h':
      return new Date(now.getTime() + 6 * 60 * 60 * 1000);
    case '12h':
      return new Date(now.getTime() + 12 * 60 * 60 * 1000);
    case 'tomorrow':
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(17, 0, 0, 0); // 5 PM tomorrow
      return tomorrow;
    case 'eod':
    default:
      const eod = new Date(now);
      eod.setHours(23, 59, 59, 999);
      return eod;
  }
};

/**
 * Sort bids by criteria
 * @param {Array} bids 
 * @param {string} sortBy - 'price_low' | 'price_high' | 'rating' | 'newest'
 * @returns {Array}
 */
export const sortBids = (bids, sortBy = 'price_low') => {
  if (!bids || !bids.length) return [];
  
  const sorted = [...bids];
  
  switch (sortBy) {
    case 'price_low':
      return sorted.sort((a, b) => a.bidAmount - b.bidAmount);
    case 'price_high':
      return sorted.sort((a, b) => b.bidAmount - a.bidAmount);
    case 'rating':
      return sorted.sort((a, b) => (b.carrierRating || 0) - (a.carrierRating || 0));
    case 'newest':
      return sorted.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
    default:
      return sorted;
  }
};

/**
 * Generate a short reference ID
 * @returns {string}
 */
export const generateReferenceId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'LL-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Parse date from various formats
 * @param {any} dateValue - Date, Timestamp, or string
 * @returns {Date|null}
 */
export const parseDate = (dateValue) => {
  if (!dateValue) return null;
  
  // Firebase Timestamp
  if (dateValue.toDate) {
    return dateValue.toDate();
  }
  
  // Already a Date
  if (dateValue instanceof Date) {
    return dateValue;
  }
  
  // String or number
  const parsed = new Date(dateValue);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Check if user is the dealer for a LiveLoad
 * @param {Object} liveLoad 
 * @param {string} userId 
 * @returns {boolean}
 */
export const isLiveLoadDealer = (liveLoad, userId) => {
  return liveLoad?.dealerId === userId;
};

/**
 * Check if user's tenant is the carrier for a LiveLoad
 * @param {Object} liveLoad 
 * @param {string} tenantId 
 * @returns {boolean}
 */
export const isLiveLoadCarrier = (liveLoad, tenantId) => {
  return liveLoad?.acceptedBid?.carrierId === tenantId;
};

export default {
  calculateDistanceMiles,
  calculatePlatformFee,
  calculateTotalCharge,
  formatCurrency,
  formatTimeRemaining,
  formatRelativeTime,
  formatVehicleDisplay,
  formatLocationDisplay,
  formatPhoneNumber,
  getStatusDisplayText,
  getBidStatusDisplayText,
  estimateTransitDays,
  isValidVin,
  maskSensitiveInfo,
  canReceiveBids,
  getDefaultExpiration,
  sortBids,
  generateReferenceId,
  parseDate,
  isLiveLoadDealer,
  isLiveLoadCarrier
};
