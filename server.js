const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const qs = require("qs");
const fs = require("fs");
const nodemailer = require("nodemailer");

// Load environment variables
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Instamojo credentials from environment variables
const INSTAMOJO_API_KEY = process.env.INSTAMOJO_API_KEY;
const INSTAMOJO_AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;
const INSTAMOJO_BASE_URL = process.env.INSTAMOJO_BASE_URL || "https://www.instamojo.com/api/1.1/";

// Validate required environment variables
if (!INSTAMOJO_API_KEY || !INSTAMOJO_AUTH_TOKEN) {
  console.error("❌ Missing required environment variables: INSTAMOJO_API_KEY or INSTAMOJO_AUTH_TOKEN");
  console.error("Please check your .env file");
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Create payment request
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

    // Input validation
    if (!amount || !purpose || !buyer_name || !buyer_email || !buyer_phone) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount, purpose, buyer_name, buyer_email, buyer_phone"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyer_email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format"
      });
    }

    // Validate phone number (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(buyer_phone)) {
      return res.status(400).json({
        success: false,
        error: "Phone number must be 10 digits"
      });
    }

    // Validate amount (minimum ₹1, maximum ₹10000)
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1 || numAmount > 10000) {
      return res.status(400).json({
        success: false,
        error: "Amount must be between ₹1 and ₹10000"
      });
    }

    console.log("Creating payment request:", {
      amount: numAmount,
      purpose,
      buyer_name,
      buyer_email,
      buyer_phone,
    });

    const paymentData = {
      purpose: purpose,
      amount: amount,
      buyer_name: buyer_name,
      email: buyer_email, // Instamojo API v1.1 uses 'email' not 'buyer_email'
      phone: buyer_phone, // Instamojo API v1.1 uses 'phone' not 'buyer_phone'
      redirect_url: redirect_url || `http://localhost:${PORT}/payment-success`,
      send_email: "True", // Must be a string 'True' or 'False'
      send_sms: "True", // Must be a string 'True' or 'False'
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
      res.json({ paymentUrl });
    } else {
      // Handle API-level errors (e.g., validation errors)
      console.error("Instamojo API Error:", response.data);
      res.status(400).json({
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

      res.json({
        paymentUrl: fallbackURL,
        fallback: true,
        message:
          "Using fallback payment method due to API connectivity issues.",
      });
    } else {
      // Handle other errors (including API errors that throw, e.g. 401 Unauthorized)
      res.status(500).json({
        success: false,
        error: "Server error while creating payment",
        details: errorResponseData || errorMessage,
      });
    }
  }
});

// Payment success page
app.get("/payment-success", (req, res) => {
  const payment_id = req.query.payment_id;
  const payment_request_id = req.query.payment_request_id;

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
                .payment-details {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
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
                
                <div class="payment-details">
                    <p><strong>Payment ID:</strong> ${
                      payment_id || "Processing..."
                    }</p>
                    <p><strong>Request ID:</strong> ${
                      payment_request_id || "Processing..."
                    }</p>
                    <p><strong>Status:</strong> Completed</p>
                </div>
                
                <p>You will receive confirmation details via email and SMS shortly.</p>
                
                <a href="/" class="btn">Back to Heritage Fest</a>
                
                <script>
                    // Notify parent window if opened in popup
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'payment_success',
                            payment_id: '${payment_id}',
                            payment_request_id: '${payment_request_id}'
                        }, '*');
                        setTimeout(() => window.close(), 3000);
                    }
                </script>
            </div>
        </body>
        </html>
    `);
});

// Payment failure page
app.get("/payment-failure", (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Failed - Heritage Fest 2025</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background: linear-gradient(135deg, #dc3545, #721c24);
                    color: white;
                }
                .failure-container {
                    background: white;
                    color: #333;
                    padding: 40px;
                    border-radius: 10px;
                    max-width: 500px;
                    margin: 0 auto;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
                .failure-icon {
                    font-size: 4rem;
                    color: #dc3545;
                    margin-bottom: 20px;
                }
                h1 { color: #dc3545; }
                .btn {
                    background: #FF6B35;
                    color: white;
                    padding: 15px 30px;
                    border: none;
                    border-radius: 5px;
                    text-decoration: none;
                    display: inline-block;
                    margin: 10px;
                    font-size: 1.1rem;
                }
            </style>
        </head>
        <body>
            <div class="failure-container">
                <div class="failure-icon">❌</div>
                <h1>Payment Failed</h1>
                <p>Sorry, your payment could not be processed.</p>
                <p>Please try again or contact us for assistance.</p>
                
                <a href="/" class="btn">Try Again</a>
                <a href="tel:+919755098618" class="btn">Call Support</a>
                
                <script>
                    // Notify parent window if opened in popup
                    if (window.opener) {
                        window.opener.postMessage({
                            type: 'payment_failure'
                        }, '*');
                        setTimeout(() => window.close(), 3000);
                    }
                </script>
            </div>
        </body>
        </html>
    `);
});

// Registration data storage endpoint
app.post("/api/save-registration", async (req, res) => {
  try {
    const registrationData = {
      ...req.body,
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    };

    // Create registrations directory if it doesn't exist
    const registrationsDir = path.join(__dirname, 'registrations');
    if (!fs.existsSync(registrationsDir)) {
      fs.mkdirSync(registrationsDir);
    }

    // Save individual registration file
    const filename = `registration_${registrationData.id}.json`;
    const filepath = path.join(registrationsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(registrationData, null, 2));

    // Also append to master registrations file
    const masterFile = path.join(registrationsDir, 'all_registrations.json');
    let allRegistrations = [];
    
    if (fs.existsSync(masterFile)) {
      const existingData = fs.readFileSync(masterFile, 'utf8');
      allRegistrations = JSON.parse(existingData);
    }
    
    allRegistrations.push(registrationData);
    fs.writeFileSync(masterFile, JSON.stringify(allRegistrations, null, 2));

    console.log(`✅ Registration saved: ${registrationData.name} - ${registrationData.eventType}`);
    
    res.json({ 
      success: true, 
      message: "Registration saved successfully",
      registrationId: registrationData.id
    });

  } catch (error) {
    console.error("Error saving registration:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to save registration data" 
    });
  }
});

// Get all registrations (admin endpoint)
app.get("/api/registrations", (req, res) => {
  try {
    const masterFile = path.join(__dirname, 'registrations', 'all_registrations.json');
    
    if (fs.existsSync(masterFile)) {
      const registrations = JSON.parse(fs.readFileSync(masterFile, 'utf8'));
      res.json({ success: true, registrations });
    } else {
      res.json({ success: true, registrations: [] });
    }
  } catch (error) {
    console.error("Error reading registrations:", error);
    res.status(500).json({ success: false, error: "Failed to read registrations" });
  }
});

// Webhook to handle payment notifications
app.post("/webhook", (req, res) => {
  console.log("Webhook received:", req.body);

  // Here you can:
  // 1. Verify the payment
  // 2. Update your database
  // 3. Send confirmation emails
  // 4. Log the transaction

  res.status(200).send("OK");
});

// Start server
app.listen(PORT, () => {
  console.log(
    `🚀 Heritage Fest Backend Server running on http://localhost:${PORT}`
  );
  console.log(`📱 Your website is available at: http://localhost:${PORT}`);
  console.log(
    `💳 Payment API endpoint: http://localhost:${PORT}/api/create-payment`
  );
  console.log("");
  console.log("🔥 Ready to accept payments!");
});
