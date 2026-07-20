// src/components/accounting/constants/accountingConstants.js

export const LOADS_PER_PAGE = 100;

// Updated to include "In Transit" status
export const LOAD_ACCOUNTING_STATUSES_DELIVERED = ["Delivered", "Cancelled"];
export const LOAD_ACCOUNTING_STATUSES_ALL = ["Delivered", "Cancelled", "In Transit"];

export const PAYMENT_TERMS = {
  cod: "COD (Cash on Delivery)",
  same_day_ach: "Same Day ACH",
  quickpay_2_day: "Quickpay (2 Day)",
  factoring: "Factoring",
  apex_factoring: "Apex Factoring",
  "5_business_day": "5 Business Day",
  "10_business_day": "10 Business Day",
  "15_business_day": "15 Business Day",
  "30_business_day": "30 Business Day",
  zelle_venmo: "Zelle/Venmo"
};

export const PAYMENT_TERMS_OPTIONS = [
  { value: "", label: "No Payment Terms Selected" },
  { value: "cod", label: "COD (Cash on Delivery)" },
  { value: "same_day_ach", label: "Same Day ACH" },
  { value: "quickpay_2_day", label: "Quickpay (2 Day)" },
  { value: "factoring", label: "Factoring" },
  { value: "5_business_day", label: "5 Business Day" },
  { value: "10_business_day", label: "10 Business Day" },
  { value: "15_business_day", label: "15 Business Day" },
  { value: "30_business_day", label: "30 Business Day" },
  { value: "zelle_venmo", label: "Zelle/Venmo" }
];

export const USER_ROLES = {
  SUPER_ADMIN: "Super Admin",
  MAIN_ADMIN: "Main Admin",
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  DISPATCHER: "Dispatcher",
  FLEET: "Fleet",
  HR: "HR"
};

export const ALLOWED_ACCOUNTING_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MAIN_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.ACCOUNTANT,
  USER_ROLES.DISPATCHER,
  USER_ROLES.FLEET,
  USER_ROLES.HR
];

export const CAN_AMEND_ACCOUNTING_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MAIN_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.ACCOUNTANT
];

export const CAN_HARD_DELETE_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MAIN_ADMIN,
  USER_ROLES.ADMIN
];

export const DATE_FORMATS = {
  DISPLAY: 'yyyy-MM-dd HH:mm:ss zzz',
  SHORT_DISPLAY: 'MM/dd/yyyy hh:mm a',
  DATE_ONLY: 'MM/dd/yyyy',
  DATETIME_LOCAL: "yyyy-MM-dd'T'HH:mm"
};

export const COMMODITY_TYPES = {
  AUTOMOBILE: 'automobile_hauling',
  REEFER: 'reefer',
  FLATBED: 'flatbed',
  TANKER: 'tanker',
  DRY_VAN: 'dry_van',
  GENERAL: 'general'
};

export const COMMODITY_DISPLAY_NAMES = {
  [COMMODITY_TYPES.AUTOMOBILE]: 'Vehicle Transport',
  [COMMODITY_TYPES.REEFER]: 'Refrigerated Freight',
  [COMMODITY_TYPES.FLATBED]: 'Flatbed Freight',
  [COMMODITY_TYPES.TANKER]: 'Tanker Freight',
  [COMMODITY_TYPES.DRY_VAN]: 'Dry Van Freight',
  [COMMODITY_TYPES.GENERAL]: 'General Freight'
};

export const BASE_BOL_URL = 'https://loadmemo.com';