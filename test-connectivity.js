const axios = require("axios");

async function testConnectivity() {
  console.log("Testing network connectivity...\n");

  const urls = [
    "https://www.instamojo.com",
    "https://test.instamojo.com",
    "https://google.com",
  ];

  for (const url of urls) {
    try {
      console.log(`Testing ${url}...`);
      const response = await axios.get(url, { timeout: 5000 });
      console.log(`✅ ${url} - CONNECTED (Status: ${response.status})\n`);
    } catch (error) {
      console.log(`❌ ${url} - FAILED: ${error.code || error.message}\n`);
    }
  }

  // Test Instamojo API endpoint specifically
  try {
    console.log("Testing Instamojo API endpoint...");
    const response = await axios.get("https://www.instamojo.com/api/1.1/", {
      timeout: 5000,
    });
    console.log("✅ Instamojo API - REACHABLE\n");
  } catch (error) {
    console.log(`❌ Instamojo API - FAILED: ${error.code || error.message}\n`);
  }
}

testConnectivity();
