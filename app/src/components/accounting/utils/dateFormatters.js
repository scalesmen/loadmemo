// src/components/accounting/utils/dateFormatters.js

import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { Timestamp } from 'firebase/firestore';
import { DATE_FORMATS } from '../constants/accountingConstants';

/**
 * Format a timestamp in the application timezone
 */
export const formatTimestampInAppZone = (
  timestamp, 
  appTimeZone, 
  formatString = DATE_FORMATS.DISPLAY
) => {
  if (!appTimeZone) {
    return timestamp && typeof timestamp.toDate === 'function' 
      ? timestamp.toDate().toLocaleString() 
      : 'N/A (Loading TZ)';
  }
  
  let dateToFormat;
  if (timestamp && typeof timestamp.toDate === 'function') {
    dateToFormat = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    dateToFormat = timestamp;
  } else if (typeof timestamp === 'string' && timestamp.length > 0) {
    return timestamp; // Already formatted or not a date object
  } else {
    return 'N/A';
  }

  try {
    return formatInTimeZone(dateToFormat, appTimeZone, formatString);
  } catch (e) {
    console.error("Error formatting date in app zone:", e, "Timestamp:", timestamp, "AppTimeZone:", appTimeZone);
    return dateToFormat.toLocaleString() + ` (TZ Error: ${appTimeZone})`;
  }
};

/**
 * Format a Firestore timestamp for datetime-local input
 */
export const formatForDateTimeLocal = (firestoreTimestamp, applicationTimeZone, isLoadingTimeZone) => {
  if (firestoreTimestamp && typeof firestoreTimestamp.toDate === 'function') {
    if (applicationTimeZone && !isLoadingTimeZone) {
      const dateInAppZone = firestoreTimestamp.toDate();
      return formatInTimeZone(dateInAppZone, applicationTimeZone, DATE_FORMATS.DATETIME_LOCAL);
    } else {
      const d = firestoreTimestamp.toDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }
  return '';
};

/**
 * Format timestamp for driver documents (BOL/Invoice)
 */
export const formatDriverTimestamp = (timestamp) => {
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleString([], {
      year: 'numeric', 
      month: 'numeric', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true
    });
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleString([], {
      year: 'numeric', 
      month: 'numeric', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true
    });
  }
  return 'N/A';
};

/**
 * Format timestamp for invoices (date only)
 */
export const formatInvoiceTimestamp = (timestamp) => {
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleDateString();
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString();
  }
  return 'N/A';
};

/**
 * Convert local date string to UTC timestamp for Firestore
 */
export const convertToUTCTimestamp = (dateTimeString, applicationTimeZone) => {
  if (!dateTimeString || !applicationTimeZone) return null;
  
  try {
    const utcDate = zonedTimeToUtc(dateTimeString, applicationTimeZone);
    return Timestamp.fromDate(utcDate);
  } catch (error) {
    console.error("Error converting to UTC timestamp:", error);
    throw error;
  }
};

/**
 * Get date range display strings
 */
export const getDateRangeDisplay = (startDate, endDate, applicationTimeZone, isLoadingTimeZone) => {
  const display = { start: '', end: '' };
  
  if (startDate && applicationTimeZone && !isLoadingTimeZone) {
    try {
      const startDisplay = formatInTimeZone(
        zonedTimeToUtc(`${startDate}T00:00:00`, applicationTimeZone), 
        applicationTimeZone, 
        DATE_FORMATS.DISPLAY
      );
      display.start = startDisplay;
    } catch (e) {
      console.error("Error setting filter start display", e);
      display.start = 'Invalid Start Date';
    }
  }

  if (endDate && applicationTimeZone && !isLoadingTimeZone) {
    try {
      const endDisplay = formatInTimeZone(
        zonedTimeToUtc(`${endDate}T23:59:59`, applicationTimeZone), 
        applicationTimeZone, 
        DATE_FORMATS.DISPLAY
      );
      display.end = endDisplay;
    } catch (e) {
      console.error("Error setting filter end display", e);
      display.end = 'Invalid End Date';
    }
  }
  
  return display;
};