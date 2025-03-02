import express from "express";
import lyricsRoutes from "./routes/lyrics.js";

const app = express();
const port = process.env.PORT || 3000;

// Apply routes
app.use(lyricsRoutes);

// Add a simple health check route
app.get("/", (req, res) => {
  res.json({ status: "Lyrics scraper API is running" });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
