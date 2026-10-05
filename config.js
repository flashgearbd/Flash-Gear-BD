/*
  FLASH GEAR BD — Frontend configuration
  FGBD V1.0.17

  Production architecture:
    Website -> Cloudflare Worker /api -> Google Apps Script -> Google Sheets

  Keep the API URL relative so no Google credentials are exposed in the browser.
*/
window.FLASH_GEAR_CONFIG = {
  shopName: "FLASH GEAR BD",
  tagline: "Mobile & Accessories Store",
  currency: "৳",
  apiBaseUrl: "/api",
  useMockData: true,
  tryLiveData: true,
  allowDemoOrders: false
};
