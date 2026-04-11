import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      const response = await axios.post('https://dev-online-gateway.ghn.vn/shipper-order/v1/status', {
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
      res.status(500).json({ 
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
