const axios = require("axios");
const qs = require("qs");

// Instamojo credentials
const INSTAMOJO_API_KEY = "59cb56bcf6bf603e353f0f308baca3a9";
const INSTAMOJO_AUTH_TOKEN = "4e72062478086ac50d848508c4f9aaa6";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      amount,
      purpose,
      buyer_name,
      buyer_email,
      buyer_phone,
      redirect_url,
    } = req.body;

    console.log("Creating payment request:", {
      amount,
      purpose,
      buyer_name,
      buyer_email,
      buyer_phone,
    });

    // Prepare data for Instamojo
    const paymentData = {
      purpose: purpose,
      amount: amount,
      buyer_name: buyer_name,
      email: buyer_email,
      phone: buyer_phone,
      redirect_url: redirect_url || "http://localhost:3000",
      send_email: "True",
      send_sms: "True",
      allow_repeated_payments: false,
    };

    const response = await axios.post(
      "https://www.instamojo.com/api/1.1/payment-requests/",
      qs.stringify(paymentData),
      {
        headers: {
          "X-Api-Key": INSTAMOJO_API_KEY,
          "X-Auth-Token": INSTAMOJO_AUTH_TOKEN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.success) {
      const paymentUrl = response.data.payment_request.longurl;
      return res.json({
        success: true,
        paymentUrl: paymentUrl,
        payment_request_id: response.data.payment_request.id,
      });
    } else {
      console.error("Instamojo API Error:", response.data);
      return res.status(400).json({
        success: false,
        error: "Instamojo API returned an error",
        details: response.data,
      });
    }
  } catch (error) {
    const errorCode = error.code;
    const errorResponseData = error.response ? error.response.data : null;
    const errorMessage = error.message;

    console.error(
      `Caught Error (${errorCode || "N/A"}):`,
      errorResponseData || errorMessage
    );

    // Fallback for specific network errors
    if (
      errorCode === "ECONNRESET" ||
      errorCode === "ENOTFOUND" ||
      errorCode === "ETIMEDOUT"
    ) {
      console.log(
        "Connection error detected, providing fallback payment link."
      );

      const { amount, purpose, buyer_name, buyer_email } = req.body;

      // Create a manual payment link
      const fallbackURL = `https://www.instamojo.com/@heritagefest2025/?data_name=${encodeURIComponent(
        buyer_name
      )}&data_email=${encodeURIComponent(buyer_email)}&data_amount=${amount}`;

      return res.json({
        success: true,
        paymentUrl: fallbackURL,
        fallback: true,
        message:
          "Using fallback payment method due to API connectivity issues.",
      });
    } else {
      // Handle other errors
      return res.status(500).json({
        success: false,
        error: "Server error while creating payment",
        details: errorResponseData || errorMessage,
      });
    }
  }
}
