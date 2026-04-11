import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to proxy SPX Tracking (New Free Endpoint)
  app.get("/api/tracking/spx-free", async (req, res) => {
    const { tracking_number } = req.query;
    
    if (!tracking_number) {
      return res.status(400).json({ error: "Missing tracking_number" });
    }
 
    try {
      console.log(`Proxying SPX Free tracking for: ${tracking_number}`);
      const response = await axios.get(`https://spx.vn/api/v2/fleet_order/tracking_search?object=${tracking_number}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://spx.vn/',
          'Origin': 'https://spx.vn',
          'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 15000
      });
      
      // Log full response for debugging (truncated if too large but enough to see structure)
      const responseStr = JSON.stringify(response.data);
      console.log(`SPX Free Response for ${tracking_number}:`, responseStr.substring(0, 2000));
      
      // If the response is empty or has an error message, log it
      if (!response.data || (response.data.error && response.data.error !== 0)) {
        console.warn(`SPX API returned error for ${tracking_number}:`, response.data);
      }

      res.json(response.data);
    } catch (error: any) {
      console.error('SPX Free Proxy Error:', error.message);
      res.status(500).json({ 
        error: "Failed to fetch from SPX Free", 
        details: error.response?.data || error.message 
      });
    }
  });

  // API Route to proxy SPX Tracking
  app.get("/api/tracking/spx", async (req, res) => {
    const { tracking_number } = req.query;
    
    if (!tracking_number) {
      return res.status(400).json({ error: "Missing tracking_number" });
    }

    try {
      console.log(`Proxying SPX tracking for: ${tracking_number}`);
      const response = await axios.get(`https://spx.vn/api/v2/fleet/order/tracking?sls_tracking_number=${tracking_number}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://spx.vn/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000 // 10s timeout
      });
      
      console.log(`SPX Response for ${tracking_number}:`, JSON.stringify(response.data).substring(0, 200) + '...');
      res.json(response.data);
    } catch (error: any) {
      console.error('SPX Proxy Error:', error.message);
      res.status(500).json({ 
        error: "Failed to fetch from SPX", 
        details: error.response?.data || error.message 
      });
    }
  });

  // API Route to proxy GHN Tracking
  app.post("/api/tracking/ghn", async (req, res) => {
    const { tracking_number, token } = req.body;
    
    if (!tracking_number) {
      return res.status(400).json({ error: "Missing tracking_number" });
    }

    const ghnToken = token || process.env.VITE_GHN_TOKEN;

    if (!ghnToken) {
      return res.status(400).json({ error: "Missing GHN Token" });
    }

    try {
      const response = await axios.post('https://online-gateway.ghn.vn/shipper-order/v1/status', {
        order_code: tracking_number
      }, {
        headers: {
          'Token': ghnToken,
          'Content-Type': 'application/json'
        }
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error('GHN Proxy Error:', error.message);
      // If production fails, try dev as a fallback
      if (error.response?.status === 401 || error.response?.status === 400) {
        try {
          const devResponse = await axios.post('https://dev-online-gateway.ghn.vn/shipper-order/v1/status', {
            order_code: tracking_number
          }, {
            headers: {
              'Token': ghnToken,
              'Content-Type': 'application/json'
            }
          });
          return res.json(devResponse.data);
        } catch (devError) {
          // Fall through to original error
        }
      }
      
      res.status(error.response?.status || 500).json({ 
        error: "Failed to fetch from GHN", 
        details: error.response?.data || error.message 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
