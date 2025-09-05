const express = require("express");
const app = express();
const PORT = process.env.PORT || 5000;
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const cron = require("node-cron");

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5175",
    "https://nabard-visitor-frontend.vercel.app",
    "https://nabard-visitor-frontend-git-main-manas-chaturvedis-projects.vercel.app",
    "https://nabard-sigma.vercel.app/",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// In-memory (abhi bas demo k liye)
let receivedCoordinates = [];
let receivedData = [];

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

// Schedule a cron job to ping the server every 14 minutes
// This prevents free hosting platforms from putting the app to sleep
cron.schedule("*/14 * * * *", () => {
  console.log("Running keep-alive ping at:", new Date().toISOString());

  const https = require("https");
  const url = process.env.APP_URL || `http://localhost:${PORT}`;

  if (url.startsWith("http://")) {
    const http = require("http");
    http
      .get(`${url}/api/health`, (resp) => {
        console.log("Keep-alive ping successful, status:", resp.statusCode);
      })
      .on("error", (err) => {
        console.log("Keep-alive ping failed:", err.message);
      });
  }
  // For HTTPS URLs
  else if (url.startsWith("https://")) {
    https
      .get(`${url}/api/health`, (resp) => {
        console.log("Keep-alive ping successful, status:", resp.statusCode);
      })
      .on("error", (err) => {
        console.log("Keep-alive ping failed:", err.message);
      });
  }
});

// endpoint to receive coordinates and area
app.post("/api/receive-coordinates", async (req, res) => {
  try {
    const { farmerId, coordinates, area } = req.body;
    if (!farmerId || !coordinates || !area) {
      return res.status(400).json({
        error: "Missing required fields: farmerId, coordinates, or area",
      });
    }

    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      return res.status(400).json({
        error: "Coordinates must be an array with at least 3 points",
      });
    }
    const dataEntry = {
      farmerId,
      coordinates,
      area,
      receivedAt: new Date().toISOString(),
    };

    receivedData.push(dataEntry);
    receivedCoordinates = coordinates;
    console.log("Received coordinates and area:", dataEntry);
    res.status(200).json({
      message: "Coordinates and area received successfully",
      data: dataEntry,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

//to get the specific farmer coordinates
app.get("/api/get-coordinates/:farmerId", async (req, res) => {
  try {
    const { farmerId } = req.params;

    if (!farmerId) {
      return res.status(400).json({
        error: "Farmer ID is required",
      });
    }

    const farmerCoordinates = receivedData.filter(
      (entry) => entry.farmerId === farmerId
    );

    if (farmerCoordinates.length === 0) {
      return res.status(404).json({
        error: "No coordinates found for this farmer ID",
      });
    }

    res.json(farmerCoordinates);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// to get the latest coordinates
app.get("/api/get-coordinates", async (req, res) => {
  try {
    if (receivedData.length === 0) {
      return res.status(404).json({
        error: "No coordinates received yet",
      });
    }

    const latestData = receivedData[receivedData.length - 1];
    res.json(latestData);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// to recieve all coordinates until now
app.get("/api/get-all-coordinates", async (req, res) => {
  try {
    if (receivedData.length === 0) {
      return res.status(404).json({
        error: "No coordinates received yet",
      });
    }

    res.json(receivedData);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// endpoint to clear all coordinates
app.delete("/api/clear-coordinates", async (req, res) => {
  try {
    const previousCount = receivedData.length;
    receivedData = [];
    receivedCoordinates = [];

    res.json({
      message: `Cleared ${previousCount} coordinate entries`,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend server running",
    timestamp: new Date().toISOString(),
    receivedDataCount: receivedData.length,
  });
});

//-----------------------------------------------------------------------------------//
///------------Notifiaction wala started yahan  se---------//

// In-memory notifications
let notifications = [];
let connectedClients = [];

// ye endpoint to receive visit requests from farmers
app.post("/api/visit-request", async (req, res) => {
  try {
    const { farmerId, farmerName, village, locationDetails, preferredDate } =
      req.body;
    if (
      !farmerId ||
      !farmerName ||
      !village ||
      !locationDetails ||
      !preferredDate
    ) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    const notification = {
      id: Date.now().toString(),
      farmerId,
      farmerName,
      village,
      locationDetails,
      preferredDate: new Date(preferredDate),
      status: "pending",
      createdAt: new Date(),
      type: "visit_request",
    };
    notifications.push(notification);

    notifyClients(notification);
    console.log("New visit request received:", notification);
    res.status(201).json({
      message: "Visit request submitted successfully",
      requestId: notification.id,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// endpoint to get all notifications
app.get("/api/notifications", async (req, res) => {
  try {
    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// endpoint to update notification status
app.patch("/api/notifications/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const notification = notifications.find((n) => n.id === id);
    if (!notification) {
      return res.status(404).json({
        error: "Notification not found",
      });
    }

    notification.status = status;
    notification.updatedAt = new Date();

    notifyClients(notification);

    res.json({
      message: "Notification updated successfully",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/notifications/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const clientId = Date.now().toString();
  const newClient = {
    id: clientId,
    res,
  };

  connectedClients.push(newClient);

  req.on("close", () => {
    connectedClients = connectedClients.filter(
      (client) => client.id !== clientId
    );
  });
});

function notifyClients(notification) {
  connectedClients.forEach((client) => {
    client.res.write(`data: ${JSON.stringify(notification)}\n\n`);
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(
    `Receive coordinates: POST http://localhost:${PORT}/api/receive-coordinates`
  );
  console.log(
    `Get coordinates: GET http://localhost:${PORT}/api/get-coordinates`
  );
  console.log(
    `Visit request endpoint: POST http://localhost:${PORT}/api/visit-request`
  );
  console.log(
    `Notifications endpoint: GET http://localhost:${PORT}/api/notifications`
  );
  console.log(`Health check endpoint: GET http://localhost:${PORT}/api/health`);
});
