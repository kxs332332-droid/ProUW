import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // --- API Routes ---
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Secure Proxy for Allowed Resources
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("URL is required");

    // Domain Restriction: Only allow Fannie Mae and Freddie Mac
    const allowedDomains = [
      'selling-guide.fanniemae.com',
      'guide.freddiemac.com'
    ];
    
    try {
      const urlObj = new URL(targetUrl);
      if (!allowedDomains.some(domain => urlObj.hostname.endsWith(domain))) {
        return res.status(403).send("Domain not allowed");
      }

      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        responseType: 'text'
      });

      // Set headers
      res.set('Content-Type', response.headers['content-type'] || 'text/html');
      
      // Strip security headers that prevent embedding
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('Content-Security-Policy-Report-Only');
      
      // Inject <base> tag and proxy script
      let html = response.data;
      const baseTag = `<base href="${urlObj.origin}${urlObj.pathname}">`;
      const proxyScript = `
        <script>
          document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
              const url = new URL(link.href);
              const allowedDomains = ['selling-guide.fanniemae.com', 'guide.freddiemac.com'];
              if (allowedDomains.some(domain => url.hostname.endsWith(domain))) {
                // If it's a relative-looking link that's actually absolute due to <base>, 
                // we still want to proxy it to keep it in the iframe
                e.preventDefault();
                window.location.href = '/api/proxy?url=' + encodeURIComponent(link.href);
              }
            }
          });
        </script>
      `;
      
      html = html.replace('<head>', `<head>${baseTag}`);
      html = html.replace('</body>', `${proxyScript}</body>`);

      res.send(html);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).send("Failed to fetch resource");
    }
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist"), { index: false }));
    app.get("*", (req, res) => {
      const indexPath = path.join(__dirname, "dist", "index.html");
      try {
        let html = fs.readFileSync(indexPath, "utf8");
        
        // Inject environment variables into the HTML
        const envKeys = [
          'VITE_GEMINI_API_KEY',
          'GEMINI_API_KEY',
          'VITE_GEMINI_APIKEY',
          'GEMINI_APIKEY',
          'Vite_Gemini_API_Key',
          'Gemini_API_Key',
          'VITE_Gemini_API_Key'
        ];
        
        let apiKey = "";
        for (const key of envKeys) {
          if (process.env[key]) {
            apiKey = process.env[key]!;
            break;
          }
        }

        const env = { VITE_GEMINI_API_KEY: apiKey };
        const script = `<script>window.ENV = ${JSON.stringify(env)};</script>`;
        html = html.replace("<head>", `<head>${script}`);
        res.send(html);
      } catch (e) {
        console.error("Error serving index.html:", e);
        res.status(500).send("Internal Server Error");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
