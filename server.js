const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");

// Load environment variables
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Razorpay credentials from environment variables
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Validate required environment variables
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error("❌ Missing required environment variables: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
  console.error("Please check your .env file");
  process.exit(1);
}

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (your HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Create Razorpay order
app.post("/api/create-payment", async (req, res) => {
  try {
    console.log("📥 Received payment request:", req.body);
    
    const {
      amount,
      purpose,
      buyer_name,
      buyer_email,
      buyer_phone,
      registration_type,
      participant_details,
    } = req.body;

    // Input validation
    if (!amount || !purpose || !buyer_name || !buyer_email || !buyer_phone) {
      console.log("❌ Validation failed: Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount, purpose, buyer_name, buyer_email, buyer_phone"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyer_email)) {
      console.log("❌ Validation failed: Invalid email format");
      return res.status(400).json({
        success: false,
        error: "Invalid email format"
      });
    }

    // Validate phone number (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(buyer_phone)) {
      console.log("❌ Validation failed: Invalid phone number");
      return res.status(400).json({
        success: false,
        error: "Phone number must be 10 digits"
      });
    }

    // Use the amount sent from frontend (dynamic pricing)
    let finalAmount = parseFloat(amount);
    
    console.log("💰 Received amount from frontend:", amount, "→ Parsed:", finalAmount);
    console.log("📝 Received participant details:", participant_details);
    
    // Validate that the amount is reasonable
    if (isNaN(finalAmount) || finalAmount < 1 || finalAmount > 10000) {
      console.log("❌ Validation failed: Invalid amount");
      return res.status(400).json({
        success: false,
        error: "Amount must be between ₹1 and ₹10000"
      });
    }

    console.log("Creating Razorpay order:", {
      amount: finalAmount,
      purpose,
      buyer_name,
      buyer_email,
      buyer_phone,
      registration_type,
    });

    // Prepare comprehensive notes object for Razorpay (optimized for Razorpay limits)
    const razorpayNotes = {
      purpose: purpose,
      name: buyer_name,
      email: buyer_email,
      phone: buyer_phone,
      type: registration_type || "solo",
    };

    // Add participant details if available (with string length limits)
    if (participant_details) {
      // Basic participant info
      if (participant_details.full_name) razorpayNotes.full_name = String(participant_details.full_name).substring(0, 100);
      if (participant_details.class_sections) razorpayNotes.class = String(participant_details.class_sections).substring(0, 50);
      if (participant_details.school_organization) razorpayNotes.school = String(participant_details.school_organization).substring(0, 100);
      if (participant_details.age) razorpayNotes.age = String(participant_details.age);
      if (participant_details.address) razorpayNotes.address = String(participant_details.address).substring(0, 200);
      
      // Guru details - PRIORITY FIELDS
      if (participant_details.guru_name) razorpayNotes.guru_name = String(participant_details.guru_name).substring(0, 100);
      if (participant_details.guru_contact) razorpayNotes.guru_contact = String(participant_details.guru_contact).substring(0, 15);
      
      // Father/Parent details - PRIORITY FIELDS
      if (participant_details.parent_name) razorpayNotes.father_name = String(participant_details.parent_name).substring(0, 100);
      if (participant_details.parent_contact) razorpayNotes.father_contact = String(participant_details.parent_contact).substring(0, 15);
      if (participant_details.parent_occupation) razorpayNotes.father_occupation = String(participant_details.parent_occupation).substring(0, 100);
      
      // Event and group details
      if (participant_details.event) razorpayNotes.event = String(participant_details.event).substring(0, 100);
      if (participant_details.group_members) razorpayNotes.group_members = String(participant_details.group_members).substring(0, 300);
    }

    console.log("📝 Final Razorpay Notes:", razorpayNotes);

    // Create Razorpay order
    const options = {
      amount: finalAmount * 100, // Razorpay expects amount in paise (multiply by 100)
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: razorpayNotes,
    };

    console.log("🚀 Creating Razorpay order with options:", options);
    const order = await razorpay.orders.create(options);
    console.log("✅ Razorpay order created successfully:", order.id);

    res.json({
      success: true,
      order_id: order.id,
      amount: finalAmount,
      currency: order.currency,
      key_id: RAZORPAY_KEY_ID, // Send key_id to frontend
      buyer_name,
      buyer_email,
      buyer_phone,
      purpose,
    });

  } catch (error) {
    console.error("💥 Razorpay order creation failed:", error);
    console.error("💥 Error details:", {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      code: error.code
    });
    
    // Return appropriate error response
    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || "Failed to create payment order";
    
    res.status(statusCode).json({
      success: false,
      error: "Failed to create payment order",
      details: errorMessage,
      timestamp: new Date().toISOString()
    });
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
    `💳 Razorpay API endpoint: http://localhost:${PORT}/api/create-payment`
  );
  console.log("");
  console.log("🔥 Ready to accept payments!");
});