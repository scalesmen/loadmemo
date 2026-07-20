// src/components/accounting/utils/commodityDetection.js

import { COMMODITY_TYPES, COMMODITY_DISPLAY_NAMES } from '../constants/accountingConstants';

/**
 * Detect commodity type based on load data
 */
export const detectCommodityType = (load) => {
  if (load.vehicles && load.vehicles.length > 0) {
    return COMMODITY_TYPES.AUTOMOBILE;
  }
  if (load.reeferTemp || load.reeferTempRange || load.reeferInstructions) {
    return COMMODITY_TYPES.REEFER;
  }
  if (load.weight || load.dimensions || load.tarpingRequired || load.securementType) {
    return COMMODITY_TYPES.FLATBED;
  }
  if (load.productType || load.hazmatRequired || load.tankWashRequired) {
    return COMMODITY_TYPES.TANKER;
  }
  if (load.cargoWeight || load.palletCount || load.trailerType || load.loadingEquipment || load.cargoType) {
    return COMMODITY_TYPES.DRY_VAN;
  }
  return COMMODITY_TYPES.GENERAL;
};

/**
 * Get display name for commodity type
 */
export const getCommodityDisplayName = (commodityType) => {
  return COMMODITY_DISPLAY_NAMES[commodityType] || COMMODITY_DISPLAY_NAMES[COMMODITY_TYPES.GENERAL];
};

/**
 * Get commodity badge text for BOL
 */
export const getCommodityBadgeText = (commodityType) => {
  switch (commodityType) {
    case COMMODITY_TYPES.AUTOMOBILE:
      return 'Vehicle Transport Document';
    case COMMODITY_TYPES.REEFER:
      return '❄️ Refrigerated';
    case COMMODITY_TYPES.FLATBED:
      return '🏗️ Flatbed';
    case COMMODITY_TYPES.TANKER:
      return '🛢️ Tanker';
    case COMMODITY_TYPES.DRY_VAN:
      return '📦 Dry Van';
    default:
      return '📦 General Freight';
  }
};

/**
 * Check if load has COD (Cash on Delivery)
 */
export const hasCOD = (load) => {
  const commodityType = detectCommodityType(load);
  return commodityType === COMMODITY_TYPES.AUTOMOBILE && (
    (load.driverCollectionAmount && Number(load.driverCollectionAmount) > 0) ||
    (load.brokerFeeCollection && Number(load.brokerFeeCollection) > 0)
  );
};

/**
 * Get facility label based on commodity type
 */
export const getFacilityLabel = (commodityType) => {
  return commodityType === COMMODITY_TYPES.AUTOMOBILE ? 'Dealer:' : 'Facility:';
};