// ===============================
// EIS Middleware (middleware/eis.js)
// ===============================
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
async function getAuthToken() {
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken; // Reuse valid token
  }

  try {
    const response = await axios.post(`${EIS_BASE_URL}/authentication`, {
      accreditation_id: ACCREDITATION_ID,
      app_id: APP_ID,
      app_secret: APP_SECRET
    });

    authToken = response.data.token;
    tokenExpiry = Date.now() + 5 * 60 * 60 * 1000; // 5 hrs valid
    console.log("✅ EIS Auth Token acquired");
    return authToken;
  } catch (err) {
    console.error("❌ Failed to get Auth Token:", err.response?.data || err.message);
    throw new Error("Auth Error");
  }
}

// ------------------ 2. FORMAT INVOICE ------------------
function formatInvoiceForEIS(invoiceData) {
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
async function sendInvoiceToEIS(invoiceData) {
  const token = await getAuthToken();
  const eisInvoice = formatInvoiceForEIS(invoiceData);

  // Encryption/Signing should be added here (RSA, AES, JWS)
  // For now: send plain JSON (stub for dev/testing)
  try {
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
async function checkInvoiceStatus(submissionId) {
  const token = await getAuthToken();
  try {
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

module.exports = {
  getAuthToken,
  formatInvoiceForEIS,
  sendInvoiceToEIS,
  checkInvoiceStatus
};