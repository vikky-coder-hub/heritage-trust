const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const qs = require("qs");

const app = express();
const PORT = 3000;

// Instamojo credentials
const INSTAMOJO_API_KEY = "59cb56bcf6bf603e353f0f308baca3a9";
const INSTAMOJO_AUTH_TOKEN = "4e72062478086ac50d848508c4f9aaa6";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Create payment request API endpoint
app.post("/api/create-payment", async (req, res) => {
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
      redirect_url: redirect_url || `http://localhost:${PORT}`,
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
        timeout: 15000,
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

      // For localhost testing, use a general Instamojo link
      const fallbackURL = "https://www.instamojo.com/@heritagefest2025/";

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
});

// Payment success handling route (for redirects)
app.get("/payment-success", (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Success - Heritage Fest 2025</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background: linear-gradient(135deg, #FF6B35, #b6854d);
                    color: white;
                }
                .success-container {
                    background: white;
                    color: #333;
                    padding: 40px;
                    border-radius: 10px;
                    max-width: 500px;
                    margin: 0 auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
                .success-icon {
                    font-size: 4rem;
                    color: #28a745;
                    margin-bottom: 20px;
                }
                h1 { color: #28a745; }
                .btn {
                    background: #FF6B35;
                    color: white;
                    padding: 15px 30px;
                    border: none;
                    border-radius: 5px;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 20px;
                    font-size: 1.1rem;
                }
            </style>
        </head>
        <body>
            <div class="success-container">
                <div class="success-icon">🎉</div>
                <h1>Payment Successful!</h1>
                <p>Thank you for registering for Heritage Fest 2025!</p>
                <p>You will receive confirmation details via email and SMS shortly.</p>
                <a href="/" class="btn">Back to Heritage Fest</a>
            </div>
        </body>
        </html>
    `);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Heritage Fest Server running on http://localhost:${PORT}`);
  console.log(`📱 Your website is available at: http://localhost:${PORT}`);
  console.log(
    `💳 Payment API endpoint: http://localhost:${PORT}/api/create-payment`
  );
  console.log("");
  console.log("🔥 Ready to accept payments with Seamless Checkout!");
  console.log("");
  console.log("📋 Features:");
  console.log("   ✅ Instamojo Seamless Checkout integration");
  console.log("   ✅ Real-time payment success/failure handling");
  console.log("   ✅ Fallback payment link for network issues");
  console.log("   ✅ Registration data storage in localStorage");
  console.log("");
  console.log(
    '💡 Usage: Fill the registration form and click "Pay with Instamojo"'
  );
});
