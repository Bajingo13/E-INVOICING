// ===============================
// EIS Middleware (middleware/eis.js)
// ===============================

/**
 * This middleware handles authentication, invoice formatting,
 * sending invoices, and checking invoice status with the BIR EIS API.
 * Debug comments are added for easier tracing.
 */

const axios = require("axios");
const crypto = require("crypto");

// ------------------ CONFIG ------------------
const EIS_BASE_URL = "https://api.eis.gov.ph"; // <-- Replace with actual BIR EIS base URL
const ACCREDITATION_ID = "YOUR_ACCREDITATION_ID";
const APP_ID = "YOUR_APP_ID";
const APP_SECRET = "YOUR_APP_SECRET";

// Store token in memory (you may also save in DB/Redis)
let authToken = null;
let tokenExpiry = null;

// ------------------ 1. AUTHENTICATION ------------------
/**
 * Get or refresh the EIS authentication token.
 * @returns {Promise<string>} Auth token
 */
async function getAuthToken() {
  // Reuse valid token if not expired
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log("[DEBUG] Using cached EIS token");
    return authToken;
  }

  try {
    console.log("[DEBUG] Requesting new EIS token...");
    const response = await axios.post(`${EIS_BASE_URL}/authentication`, {
      accreditation_id: ACCREDITATION_ID,
      app_id: APP_ID,
      app_secret: APP_SECRET
    });

    authToken = response.data.token;
    tokenExpiry = Date.now() + 5 * 60 * 60 * 1000; // 5 hrs valid
    console.log("✅ EIS Auth Token acquired:", authToken);
    return authToken;
  } catch (err) {
    console.error("❌ Failed to get Auth Token:", err.response?.data || err.message);
    throw new Error("Auth Error");
  }
}

// ------------------ 2. FORMAT INVOICE ------------------
/**
 * Format invoice data to match BIR EIS JSON schema.
 * @param {Object} invoiceData
 * @returns {Object} Formatted invoice
 */
function formatInvoiceForEIS(invoiceData) {
  console.log("[DEBUG] Formatting invoice for EIS:", invoiceData.invoice_no);
  // This is a placeholder structure - must match BIR JSON schema!
  return {
    invoice_no: invoiceData.invoice_no,
    date: invoiceData.date,
    customer: {
      name: invoiceData.bill_to,
      address: invoiceData.address1,
      tin: invoiceData.tin
    },
    items: invoiceData.items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      amount: i.amount
    })),
    total: invoiceData.total_amount_due
  };
}

// ------------------ 3. SEND INVOICE ------------------
/**
 * Send formatted invoice to EIS.
 * @param {Object} invoiceData
 * @returns {Promise<Object>} EIS response
 */
async function sendInvoiceToEIS(invoiceData) {
  const token = await getAuthToken();
  const eisInvoice = formatInvoiceForEIS(invoiceData);

  // Encryption/Signing should be added here (RSA, AES, JWS)
  // For now: send plain JSON (stub for dev/testing)
  try {
    console.log("[DEBUG] Sending invoice to EIS:", eisInvoice.invoice_no);
    const response = await axios.post(
      `${EIS_BASE_URL}/invoices`,
      eisInvoice,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("✅ Invoice sent to EIS:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ Failed to send invoice:", err.response?.data || err.message);
    throw new Error("Send Error");
  }
}

// ------------------ 4. CHECK STATUS ------------------
/**
 * Check the status of a submitted invoice.
 * @param {string} submissionId
 * @returns {Promise<Object>} Status response
 */
async function checkInvoiceStatus(submissionId) {
  const token = await getAuthToken();
  try {
    console.log("[DEBUG] Checking invoice status for:", submissionId);
    const response = await axios.get(
      `${EIS_BASE_URL}/inquiry-result/${submissionId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("📌 Invoice status:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ Failed to check status:", err.response?.data || err.message);
    throw new Error("Inquiry Error");
  }
}

// ------------------ EXPORTS ------------------
module.exports = {
  getAuthToken,
  formatInvoiceForEIS,
  sendInvoiceToEIS,
  checkInvoiceStatus
};