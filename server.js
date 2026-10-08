const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const handleLead = require("./api/lead");

const indexPath = path.join(__dirname, "index.html");
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

const server = http.createServer(async (req, res) => {
  const pathname =
    new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname.replace(
      /\/+$/,
      "",
    ) || "/";

  if (pathname === "/api/lead") {
    return handleLead(req, res).catch((error) => {
      console.error("Could not process lead request", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ error: "Could not process lead" }));
      }
      return res.end();
    });
  }

  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET" });
    return res.end("Method not allowed");
  }

  if (pathname !== "/" && pathname !== "/index.html") {
    res.writeHead(404);
    return res.end("Not found");
  }

  fs.createReadStream(indexPath)
    .on("error", (error) => {
      console.error("Could not serve index.html", error);
      if (!res.headersSent) res.writeHead(500);
      res.end("Could not serve page");
    })
    .pipe(res);
});

server.listen(port, host, () => {
  console.log(`Amadeo server listening on ${host}:${port}`);
});
