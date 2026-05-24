import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeDealHunter } from "./agentLogic.js";
import { researchDeals } from "./researchSources.js";

// This gives us the current folder path in an ES module project.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5002;
const dataFolder = path.join(__dirname, "..", "data");
const resultsFile = path.join(dataFolder, "results.json");
const frontendDistFolder = path.join(__dirname, "..", "..", "frontend", "dist");
const frontendIndexFile = path.join(frontendDistFolder, "index.html");

app.use(cors());
app.use(express.json());

async function makeSureResultsFileExists() {
  await fs.mkdir(dataFolder, { recursive: true });

  try {
    await fs.access(resultsFile);
  } catch {
    await fs.writeFile(resultsFile, "[]", "utf-8");
  }
}

async function readResults() {
  await makeSureResultsFileExists();
  const fileText = await fs.readFile(resultsFile, "utf-8");

  try {
    return JSON.parse(fileText);
  } catch {
    // If someone edits the JSON file and breaks it, the app keeps running.
    return [];
  }
}

async function writeResults(results) {
  await makeSureResultsFileExists();
  await fs.writeFile(resultsFile, JSON.stringify(results, null, 2), "utf-8");
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "SUPERFINDERX Deal Hunter" });
});

app.get("/api/results", async (req, res) => {
  const results = await readResults();
  res.json(results);
});

app.get("/api/saved-results", async (req, res) => {
  const results = await readResults();
  res.json(results);
});

app.get("/api/research", async (req, res) => {
  const research = await researchDeals({
    item: cleanText(req.query.item),
    budget: cleanText(req.query.budget),
    location: cleanText(req.query.location),
    category: cleanText(req.query.category),
    q: cleanText(req.query.q)
  });

  res.json(research);
});

app.post("/api/analyze-listings", (req, res) => {
  const input = cleanText(req.body.input);
  const listingsText = cleanText(req.body.listingsText);

  if (!input || !listingsText) {
    return res.status(400).json({ error: "Input and listingsText are required." });
  }

  res.json(analyzeDealHunter(input, listingsText));
});

app.post("/api/agents/run", (req, res) => {
  const agentId = cleanText(req.body.agentId);
  const input = cleanText(req.body.input);
  const listingsText = cleanText(req.body.listingsText);

  if (!input) {
    return res.status(400).json({ error: "Input is required." });
  }

  if (agentId === "deal-hunter") {
    return res.json(analyzeDealHunter(input, listingsText));
  }

  return res.status(404).json({ error: "Only Deal Hunter is available in this app." });
});

app.post("/api/results", async (req, res) => {
  const results = await readResults();
  const title = cleanText(req.body.title, "Untitled result");
  const agentName = cleanText(req.body.agentName, "Unknown agent");
  const userInput = cleanText(req.body.userInput);
  const output = cleanText(req.body.output);

  if (!output) {
    return res.status(400).json({ error: "Output is required before saving." });
  }

  const newResult = {
    id: randomUUID(),
    title,
    agentName,
    userInput,
    output,
    createdAt: new Date().toISOString()
  };

  results.unshift(newResult);
  await writeResults(results);

  res.status(201).json(newResult);
});

app.post("/api/save-result", async (req, res) => {
  const results = await readResults();
  const title = cleanText(req.body.title, "Saved research result");
  const agentName = cleanText(req.body.agentName, "Deal Hunter");
  const userInput = cleanText(req.body.userInput);
  const output = cleanText(req.body.output || req.body.summary);
  const payload = req.body.payload && typeof req.body.payload === "object" ? req.body.payload : null;

  if (!output && !payload) {
    return res.status(400).json({ error: "Output or payload is required before saving." });
  }

  const newResult = {
    id: randomUUID(),
    title,
    agentName,
    userInput,
    output: output || JSON.stringify(payload, null, 2),
    payload,
    createdAt: new Date().toISOString()
  };

  results.unshift(newResult);
  await writeResults(results);

  res.status(201).json(newResult);
});

app.delete("/api/results/:id", async (req, res) => {
  const results = await readResults();
  const nextResults = results.filter((result) => result.id !== req.params.id);

  if (nextResults.length === results.length) {
    return res.status(404).json({ error: "Result not found." });
  }

  await writeResults(nextResults);
  res.status(204).send();
});

app.use(express.static(frontendDistFolder));

app.get(/^\/(?!api).*/, async (req, res, next) => {
  try {
    await fs.access(frontendIndexFile);
    res.sendFile(frontendIndexFile);
  } catch {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`SUPERFINDERX Deal Hunter backend is running at http://localhost:${PORT}`);
});
