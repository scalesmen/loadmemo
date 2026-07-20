// src/components/loads/utils/formatters.js
import { Timestamp } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Extract city, state, zip from full address
 * @param {string} fullAddress - Complete address string
 * @returns {string} Formatted city, state zip
 */
export const extractCityStateZip = (fullAddress) => {
  // Check if fullAddress exists and is a string
  if (!fullAddress || typeof fullAddress !== 'string') {
    return '';
  }
  
  const parts = fullAddress.split(',').map(part => part.trim());
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1];
    const city = parts[parts.length - 2];
    return `${city}, ${stateZip}`;
  } else if (parts.length === 2) {
    return parts[1];
  }
  return fullAddress;
};

/**
 * Format date without time
 * @param {Timestamp|Date|string} timestamp - Date to format
 * @param {string} appTimeZone - Application timezone
 * @returns {string} Formatted date string
 */
export const formatDateOnly = (timestamp, appTimeZone) => {
  if (!timestamp) return 'N/A';
  
  let dateToFormat;
  if (timestamp instanceof Timestamp) {
    dateToFormat = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateToFormat = timestamp;
  } else {
    return String(timestamp);
  }

  if (appTimeZone) {
    try {
      return formatInTimeZone(dateToFormat, appTimeZone, 'MM/dd/yyyy');
    } catch (e) {
      console.error("Error formatting date with appTimeZone", e);
      return dateToFormat.toLocaleDateString();
    }
  }
  return dateToFormat.toLocaleDateString();
};

/**
 * Format timestamp for display with time
 * @param {Timestamp|Date|string} timestamp - Date to format
 * @param {string} appTimeZone - Application timezone
 * @returns {string} Formatted date/time string
 */
export const formatTimestampForDisplay = (timestamp, appTimeZone) => {
  if (!timestamp) return 'N/A';
  
  let dateToFormat;
  if (timestamp instanceof Timestamp) {
    dateToFormat = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateToFormat = timestamp;
  } else {
    return String(timestamp);
  }

  if (appTimeZone) {
    try {
      return formatInTimeZone(dateToFormat, appTimeZone, 'MM/dd/yyyy hh:mm a zzz');
    } catch (e) {
      console.error("Error formatting date with appTimeZone", e);
      return dateToFormat.toLocaleString();
    }
  }
  return dateToFormat.toLocaleString();
};

/**
 * Format date for HTML input fields
 * @param {Timestamp|Date|string} timestamp - Date to format
 * @param {boolean} isDateOnly - Whether to format as date only
 * @returns {string} Formatted date string for input
 */
export const formatForInput = (timestamp, isDateOnly = false) => {
  if (!timestamp) return "";
  
  let dateToFormat;
  if (timestamp && typeof timestamp.toDate === 'function') {
    dateToFormat = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateToFormat = timestamp;
  } else if (typeof timestamp === 'string') {
    dateToFormat = new Date(timestamp);
    if (isNaN(dateToFormat.getTime())) return timestamp;
  } else {
    return timestamp || "";
  }

  if (isDateOnly) {
    // For date-only, return YYYY-MM-DD format
    return `${dateToFormat.getFullYear()}-${String(dateToFormat.getMonth() + 1).padStart(2, '0')}-${String(dateToFormat.getDate()).padStart(2, '0')}`;
  } else {
    // For datetime-local, return full format
    return `${dateToFormat.getFullYear()}-${String(dateToFormat.getMonth() + 1).padStart(2, '0')}-${String(dateToFormat.getDate()).padStart(2, '0')}T${String(dateToFormat.getHours()).padStart(2, '0')}:${String(dateToFormat.getMinutes()).padStart(2, '0')}`;
  }
};

/**
 * Format currency value
 * @param {number|string} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount) => {
  const numAmount = Number(amount) || 0;
  return numAmount.toLocaleString(undefined, { 
    style: 'currency', 
    currency: 'USD' 
  });
};

/**
 * Parse and clean numeric input
 * @param {string|number} value - Value to parse
 * @returns {number} Cleaned numeric value
 */
export const parseNumericInput = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  return Number(String(value).replace(/[^0-9.-]+/g, ""));
};

/**
 * Calculate per mile rate
 * @param {number|string} amount - Total amount
 * @param {number|string} mileage - Total mileage
 * @param {number} vehicleCount - Number of vehicles (for auto hauling)
 * @returns {string|null} Formatted per mile rate
 */
export const calculatePerMileRate = (amount, mileage, vehicleCount = null) => {
  const numAmount = Number(amount) || 0;
  const numMileage = Number(mileage) || 0;
  
  if (numAmount === 0 || numMileage === 0) return null;
  
  if (vehicleCount && vehicleCount > 0) {
    // Per vehicle per mile for auto hauling
    return `$${(numAmount / vehicleCount / numMileage).toFixed(2)}`;
  } else {
    // Standard per mile rate
    return `$${(numAmount / numMileage).toFixed(2)}`;
  }
};