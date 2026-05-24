import cors from "cors";
import express from "express";
import { createHash, randomUUID } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 5001;

// These lines help us build paths that work on any computer.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFolder = path.join(__dirname, "..", "data");
const dealsFile = path.join(dataFolder, "deals.json");
const usersFile = path.join(dataFolder, "users.json");
const aiConversationsFile = path.join(dataFolder, "aiConversations.json");
const rootEnvFile = path.join(__dirname, "..", "..", ".env");
const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const AGENT_SEARCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SuperFinderX/1.0";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const OPEN_METEO_GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const WTTR_WEATHER_ENDPOINT = "https://wttr.in";
const LIVE_DATA_RETRY_TEXT = "I couldn’t get live data right now. Please try again in a moment.";
const LIVE_SEARCH_UNAVAILABLE_TEXT = LIVE_DATA_RETRY_TEXT;
const RANKING_SEARCH_FAILURE_TEXT = "Live search is currently unavailable. Please try again later.";
const NO_GOOGLE_MAPS_BUSINESS_RESULTS_TEXT = "No live Google Maps business listings were found.";
const AI_FAILURE_TEXT =
  "I had trouble reaching the AI service, but I will still answer every message. Please send that again with one extra detail if you want a sharper response.";

loadEnvFile(rootEnvFile);

const conditionScores = {
  New: 100,
  "Like new": 92,
  Excellent: 84,
  Good: 72,
  Fair: 56
};

const listingProfiles = [
  {
    modelSuffix: "Pro verified bundle",
    priceFactor: 0.92,
    condition: "Excellent",
    area: "Downtown",
    distanceRatio: 0.22,
    sellerRating: 4.9,
    reviewCount: 126,
    completedSales: 44,
    accountAgeYears: 6,
    verified: true,
    sentiment: "Responsive seller, clear photos, pickup details match the listing.",
    description:
      "iPhone 14 Pro 128GB Space Black, unlocked. Battery health 91%. Excellent condition with minor case wear only. Includes original box, USB-C to Lightning cable, clear case, and receipt. AppleCare coverage until September. No cracks, no iCloud lock, everything works.",
    latitude: 31,
    longitude: 64
  },
  {
    modelSuffix: "open-box pickup",
    priceFactor: 0.86,
    condition: "Like new",
    area: "North End",
    distanceRatio: 0.45,
    sellerRating: 4.7,
    reviewCount: 58,
    completedSales: 19,
    accountAgeYears: 4,
    verified: true,
    sentiment: "Good recent reviews and flexible local pickup window.",
    description:
      "Open-box iPhone 14 Pro 256GB Deep Purple. Unlocked for all carriers. Battery health 88%. Comes with box and charging cable. Clean screen, tiny mark near the camera ring. No repairs and no account lock.",
    latitude: 24,
    longitude: 38
  },
  {
    modelSuffix: "budget local",
    priceFactor: 0.7,
    condition: "Good",
    area: "West Side",
    distanceRatio: 0.62,
    sellerRating: 4.4,
    reviewCount: 23,
    completedSales: 8,
    accountAgeYears: 2,
    verified: false,
    sentiment: "Acceptable profile, but fewer completed sales than top listings.",
    description:
      "iPhone 14 Pro 128GB Silver. Works well and is unlocked. Battery health not listed. Includes phone and case only. Some light scratches on the frame. No charger. Pickup near transit.",
    latitude: 58,
    longitude: 28
  },
  {
    modelSuffix: "mint condition",
    priceFactor: 1.06,
    condition: "Like new",
    area: "Midtown",
    distanceRatio: 0.18,
    sellerRating: 5,
    reviewCount: 82,
    completedSales: 31,
    accountAgeYears: 5,
    verified: true,
    sentiment: "Very strong review history and consistent seller details.",
    description:
      "Mint iPhone 14 Pro 256GB Gold. Factory unlocked. Battery health 94%. Includes original box, cable, two cases, screen protector installed, and AppleCare+. No damage, no scratches, no issues.",
    latitude: 46,
    longitude: 55
  },
  {
    modelSuffix: "fast sale",
    priceFactor: 0.62,
    condition: "Fair",
    area: "East Market",
    distanceRatio: 0.82,
    sellerRating: 3.9,
    reviewCount: 11,
    completedSales: 3,
    accountAgeYears: 1,
    verified: false,
    sentiment: "Low price, but sparse reviews and vague condition notes.",
    description:
      "iPhone 14 Pro, storage not listed. Locked to Rogers. Battery life is okay but battery health not listed. Back glass has cracks and the screen has scratches. Phone only, no box or charger. Sold as is.",
    latitude: 72,
    longitude: 72
  },
  {
    modelSuffix: "suburban deal",
    priceFactor: 0.78,
    condition: "Good",
    area: "Outer Suburb",
    distanceRatio: 1.2,
    sellerRating: 4.6,
    reviewCount: 40,
    completedSales: 14,
    accountAgeYears: 3,
    verified: true,
    sentiment: "Solid seller, but pickup is outside the preferred range.",
    description:
      "iPhone 14 Pro 128GB Blue. Unlocked. Battery health 86%. Good condition with normal wear. Includes charger and black case. No warranty remaining. Small dent on bottom corner.",
    latitude: 83,
    longitude: 41
  },
  {
    modelSuffix: "sealed box",
    priceFactor: 1.18,
    condition: "New",
    area: "Uptown",
    distanceRatio: 0.36,
    sellerRating: 4.8,
    reviewCount: 65,
    completedSales: 22,
    accountAgeYears: 4,
    verified: true,
    sentiment: "Trusted profile, but price premium reduces value score.",
    description:
      "Sealed iPhone 14 Pro 512GB Space Black. Factory unlocked. Battery health not listed because box is sealed. Includes all original sealed accessories. Apple limited warranty starts after activation. No damage.",
    latitude: 36,
    longitude: 79
  }
];

app.use(cors());
app.use(express.json());

function loadEnvFile(filePath) {
  try {
    const envText = fsSync.readFileSync(filePath, "utf-8");

    envText.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#") || !trimmedLine.includes("=")) {
        return;
      }

      const [rawKey, ...rawValueParts] = trimmedLine.split("=");
      const key = rawKey.trim();
      const value = rawValueParts.join("=").trim().replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch {
    // The app still starts; the ranking endpoint reports a clear SerpApi key error.
  }
}

// Make sure the JSON database exists before we try to read it.
async function ensureDealsFile() {
  await fs.mkdir(dataFolder, { recursive: true });

  try {
    await fs.access(dealsFile);
  } catch {
    await fs.writeFile(dealsFile, "[]", "utf-8");
  }
}

async function ensureUsersFile() {
  await fs.mkdir(dataFolder, { recursive: true });

  try {
    await fs.access(usersFile);
  } catch {
    await fs.writeFile(usersFile, "[]", "utf-8");
  }
}

async function ensureAiConversationsFile() {
  await fs.mkdir(dataFolder, { recursive: true });

  try {
    await fs.access(aiConversationsFile);
  } catch {
    await fs.writeFile(aiConversationsFile, "[]", "utf-8");
  }
}

async function readDeals() {
  await ensureDealsFile();
  const fileText = await fs.readFile(dealsFile, "utf-8");

  try {
    return JSON.parse(fileText);
  } catch {
    // If the file gets edited by hand and breaks, start with a safe empty list.
    return [];
  }
}

async function writeDeals(deals) {
  await ensureDealsFile();
  await fs.writeFile(dealsFile, JSON.stringify(deals, null, 2), "utf-8");
}

async function readUsers() {
  await ensureUsersFile();
  const fileText = await fs.readFile(usersFile, "utf-8");

  try {
    return JSON.parse(fileText);
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await ensureUsersFile();
  await fs.writeFile(usersFile, JSON.stringify(users, null, 2), "utf-8");
}

async function readAiConversations() {
  await ensureAiConversationsFile();
  const fileText = await fs.readFile(aiConversationsFile, "utf-8");

  try {
    return JSON.parse(fileText).map(normalizeAiConversation).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeAiConversations(conversations) {
  await ensureAiConversationsFile();
  await fs.writeFile(
    aiConversationsFile,
    JSON.stringify(conversations.map(normalizeAiConversation).filter(Boolean), null, 2),
    "utf-8"
  );
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function cleanNumber(value, fallback = 0) {
  const number =
    typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanCoordinate(value, min, max) {
  const number = typeof value === "string" ? Number(value) : Number(value);

  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }

  return Number(number.toFixed(3));
}

function cleanUrl(value) {
  const url = cleanText(value);

  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "";
    }

    const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();

    if (host.includes("google.")) {
      const redirectTarget =
        parsedUrl.searchParams.get("url") ||
        parsedUrl.searchParams.get("adurl") ||
        parsedUrl.searchParams.get("q") ||
        parsedUrl.searchParams.get("target");

      if (/^https?:\/\//i.test(cleanText(redirectTarget))) {
        return cleanUrl(redirectTarget);
      }
    }

    if (host.includes("google.") || host.includes("serpapi.com")) {
      return "";
    }

    if ((path === "/" || path === "") && !parsedUrl.search) {
      return "";
    }

    if (host.includes("facebook.com") && !path.includes("/marketplace/item/")) {
      return "";
    }

    if (host.includes("ebay.") && !path.includes("/itm/")) {
      return "";
    }

    if (host.includes("kijiji.") && !path.includes("/v-")) {
      return "";
    }

    if (host.includes("bestbuy.") && path.includes("/search")) {
      return "";
    }

    return parsedUrl.toString();
  } catch {
    return "";
  }
}

function extractFirstUrl(text) {
  const match = cleanText(text).match(/https?:\/\/[^\s)]+/i);
  return match ? cleanUrl(match[0]) : "";
}

function cleanChatText(value) {
  return cleanText(value).replace(/\s+/g, " ").slice(0, 1000);
}

function cleanAiMessageText(value) {
  return cleanText(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 8000);
}

function normalizeAiMessage(message) {
  if (!message || typeof message !== "object" || !message.id) {
    return null;
  }

  return {
    id: cleanText(message.id),
    role: message.role === "assistant" ? "assistant" : "user",
    status: message.status === "thinking" ? "thinking" : "sent",
    text: cleanAiMessageText(message.text),
    createdAt: cleanText(message.createdAt) || new Date().toISOString()
  };
}

function normalizeAiConversation(conversation) {
  if (!conversation || typeof conversation !== "object" || !conversation.id || !conversation.userId) {
    return null;
  }

  const messages = Array.isArray(conversation.messages)
    ? conversation.messages.map(normalizeAiMessage).filter(Boolean).slice(-80)
    : [];
  const createdAt = cleanText(conversation.createdAt) || new Date().toISOString();
  const updatedAt = cleanText(conversation.updatedAt) || messages.at(-1)?.createdAt || createdAt;

  return {
    id: cleanText(conversation.id),
    userId: cleanText(conversation.userId),
    title: cleanText(conversation.title, "New chat").slice(0, 80) || "New chat",
    messages,
    createdAt,
    updatedAt
  };
}

function publicAiConversationSummary(conversation) {
  const normalizedConversation = normalizeAiConversation(conversation);

  if (!normalizedConversation) {
    return null;
  }

  return {
    id: normalizedConversation.id,
    title: normalizedConversation.title,
    createdAt: normalizedConversation.createdAt,
    updatedAt: normalizedConversation.updatedAt,
    messageCount: normalizedConversation.messages.length,
    lastMessage: normalizedConversation.messages.at(-1)?.text || ""
  };
}

function publicAiConversation(conversation) {
  const normalizedConversation = normalizeAiConversation(conversation);

  if (!normalizedConversation) {
    return null;
  }

  return {
    ...publicAiConversationSummary(normalizedConversation),
    messages: normalizedConversation.messages
  };
}

function getUserAiConversations(conversations, userId) {
  return conversations
    .filter((conversation) => conversation.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function buildAiConversationTitle(text) {
  const words = cleanAiMessageText(text)
    .replace(/[^\w\s$.-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  const title = words.join(" ");

  if (!title) {
    return "New chat";
  }

  return title.length > 54 ? `${title.slice(0, 51)}...` : title;
}

function getOpenAiApiKey() {
  return cleanApiKey(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY);
}

function cleanApiKey(value) {
  return cleanText(value).split(/\s+/)[0] || "";
}

function sanitizeDealContext(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const details = value.details && typeof value.details === "object" ? value.details : {};
  const specs = details.specs && typeof details.specs === "object" ? details.specs : {};
  const context = {
    product: cleanText(value.product || value.title).slice(0, 120),
    price: cleanNumber(value.price),
    condition: cleanText(value.condition).slice(0, 60),
    score: cleanNumber(value.score),
    valueScore: cleanNumber(value.valueScore),
    trustScore: cleanNumber(value.trustScore),
    offerPrice: cleanNumber(value.offerPrice),
    distanceKm: cleanNumber(value.distanceKm),
    area: cleanText(value.area || value.location).slice(0, 120),
    listingUrl: cleanUrl(value.listingUrl),
    source: cleanText(value.source || details.source || specs.source).slice(0, 80),
    datePosted: cleanText(value.datePosted || details.datePosted || specs.datePosted).slice(0, 80),
    reason: cleanText(value.reason || value.recommendation).slice(0, 300),
    riskFlags: Array.isArray(value.riskFlags || value.redFlags)
      ? (value.riskFlags || value.redFlags).map((flag) => cleanText(flag)).filter(Boolean).slice(0, 8)
      : [],
    specs: {
      storage: cleanText(specs.storage).slice(0, 60),
      colour: cleanText(specs.colour).slice(0, 60),
      batteryHealth: cleanText(specs.batteryHealth).slice(0, 80),
      carrier: cleanText(specs.carrier).slice(0, 80),
      accessories: cleanText(specs.accessories).slice(0, 120),
      warranty: cleanText(specs.warranty).slice(0, 80),
      damageIssues: cleanText(specs.damageIssues).slice(0, 120)
    },
    description: cleanChatText(details.description).slice(0, 700),
    pros: Array.isArray(details.pros) ? details.pros.map((item) => cleanText(item)).filter(Boolean).slice(0, 5) : [],
    cons: Array.isArray(details.cons) ? details.cons.map((item) => cleanText(item)).filter(Boolean).slice(0, 5) : []
  };

  if (
    !context.product &&
    !context.price &&
    !context.listingUrl &&
    !context.description &&
    !context.reason &&
    !context.specs.batteryHealth
  ) {
    return null;
  }

  return context;
}

function sanitizeAssistantContext(value) {
  if (!value || typeof value !== "object") {
    return {
      locationLabel: "",
      latitude: null,
      longitude: null,
      product: "",
      minPrice: 0,
      maxPrice: 0,
      maxDistanceKm: 0
    };
  }

  return {
    locationLabel: cleanText(value.locationLabel || value.location).slice(0, 140),
    latitude: cleanCoordinate(value.latitude, -90, 90),
    longitude: cleanCoordinate(value.longitude, -180, 180),
    product: cleanText(value.product).slice(0, 140),
    minPrice: cleanNumber(value.minPrice),
    maxPrice: cleanNumber(value.maxPrice),
    maxDistanceKm: cleanNumber(value.maxDistanceKm)
  };
}

function buildAssistantContextLines(context = {}) {
  const lines = [];

  if (context.locationLabel) {
    lines.push(`Selected location: ${context.locationLabel}`);
  }

  if (context.latitude !== null && context.longitude !== null) {
    lines.push(`Approximate coordinates: ${context.latitude}, ${context.longitude}`);
  }

  if (context.product) {
    lines.push(`Selected product/search item: ${context.product}`);
  }

  if (context.minPrice || context.maxPrice) {
    lines.push(
      `Selected budget filter: ${context.minPrice ? formatAiMoney(context.minPrice) : "no minimum"} to ${
        context.maxPrice ? formatAiMoney(context.maxPrice) : "no maximum"
      }`
    );
  }

  if (context.maxDistanceKm) {
    lines.push(`Selected search radius: ${context.maxDistanceKm} km`);
  }

  return lines.length ? lines.join("\n") : "No extra app context was attached.";
}

function sanitizeLogDetails(details = {}) {
  if (!details || typeof details !== "object") {
    return {};
  }

  return Object.entries(details).reduce((safeDetails, [key, value]) => {
    if (/api[_-]?key|token|authorization|password|secret/i.test(key)) {
      return safeDetails;
    }

    if (value && typeof value === "object") {
      safeDetails[key] = sanitizeLogDetails(value);
    } else {
      safeDetails[key] = cleanText(String(value)).slice(0, 500);
    }

    return safeDetails;
  }, {});
}

function logLiveSearchFailure(reason, details = {}) {
  console.warn(`[live-search] ${reason}`, sanitizeLogDetails(details));
}

function createLiveSearchError(reason, details = {}, message = LIVE_SEARCH_UNAVAILABLE_TEXT) {
  logLiveSearchFailure(reason, details);
  const error = new Error(message);
  error.liveSearchReason = reason;
  error.liveSearchDetails = details;
  error.liveSearchLogged = true;
  return error;
}

function isRateLimitMessage(value) {
  return /\b(rate limit|quota|too many requests|429|exceeded searches|run out of searches)\b/i.test(cleanText(value));
}

function isNoSerpApiResultsMessage(value) {
  return /\b(no results|hasn't returned any results|did not return any results|empty result)\b/i.test(cleanText(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function getLiveSearchFailureReason(error, fallback = "API request failed") {
  if (error?.liveSearchReason) {
    return error.liveSearchReason;
  }

  return isRateLimitMessage(error?.message) ? "Rate limit" : fallback;
}

function shouldRetryLiveSearchError(error) {
  return !["API key missing", "Invalid location/query", "No results found", "Rate limit"].includes(error?.liveSearchReason);
}

function formatAiMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }

  return `$${Math.round(number).toLocaleString("en-US")}`;
}

function formatAiDistance(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${number} km` : "";
}

function getBatteryHealthFromText(text) {
  const value = cleanText(text);
  const match =
    value.match(/\b(?:battery health|battery|bh|capacity)\D{0,18}(\d{2,3})\s?%/i) ||
    value.match(/\b(\d{2,3})\s?%\s*(?:battery|bh|capacity)/i);
  return match ? `${match[1]}%` : "";
}

function getLocalUsedPriceRange(product) {
  const model = normalizeModelForCompare(product);
  const ranges = [
    { key: "iphone15promax", fairMin: 850, fairMax: 1100, strongMax: 900, highMin: 1150 },
    { key: "iphone15pro", fairMin: 700, fairMax: 950, strongMax: 780, highMin: 1000 },
    { key: "iphone15plus", fairMin: 560, fairMax: 780, strongMax: 620, highMin: 830 },
    { key: "iphone15", fairMin: 500, fairMax: 700, strongMax: 550, highMin: 760 },
    { key: "iphone14promax", fairMin: 650, fairMax: 850, strongMax: 700, highMin: 920 },
    { key: "iphone14pro", fairMin: 520, fairMax: 720, strongMax: 580, highMin: 780 },
    { key: "iphone14", fairMin: 380, fairMax: 560, strongMax: 430, highMin: 620 },
    { key: "iphone13", fairMin: 260, fairMax: 430, strongMax: 310, highMin: 500 },
    { key: "samsunggalaxys24ultra", fairMin: 720, fairMax: 1000, strongMax: 800, highMin: 1080 },
    { key: "samsunggalaxys24", fairMin: 480, fairMax: 700, strongMax: 540, highMin: 760 },
    { key: "samsunggalaxys23", fairMin: 330, fairMax: 540, strongMax: 390, highMin: 610 }
  ];

  return ranges.find((range) => model.includes(range.key)) || null;
}

function describePriceRange(product, price, batteryHealth) {
  const range = getLocalUsedPriceRange(product);

  if (!range) {
    return "";
  }

  const fairRange = `${formatAiMoney(range.fairMin)}-${formatAiMoney(range.fairMax)}`;
  const batteryLine = batteryHealth
    ? ` With ${batteryHealth} battery, it can sit near the top of that range if condition, storage, and warranty are strong.`
    : "";

  if (price) {
    if (price <= range.strongMax) {
      return `${formatAiMoney(price)} is a strong price for ${product}; typical used range is roughly ${fairRange}.${batteryLine}`;
    }

    if (price <= range.fairMax) {
      return `${formatAiMoney(price)} is fair for ${product}; typical used range is roughly ${fairRange}.${batteryLine}`;
    }

    if (price >= range.highMin) {
      return `${formatAiMoney(price)} is high for ${product}; typical used range is roughly ${fairRange}, so negotiate hard unless storage/warranty are excellent.${batteryLine}`;
    }
  }

  return `A good target for ${product} is around ${fairRange}, with anything under ${formatAiMoney(range.strongMax)} looking strong if it is unlocked, clean, and from a trusted seller.${batteryLine}`;
}

function buildDealContextLines(dealContext) {
  if (!dealContext) {
    return "No structured listing details were attached.";
  }

  return [
    `Product: ${dealContext.product || "not listed"}`,
    `Price: ${formatAiMoney(dealContext.price) || "not listed"}`,
    `Condition: ${dealContext.condition || "not listed"}`,
    `Score: ${dealContext.score || "not listed"}`,
    `Value score: ${dealContext.valueScore || "not listed"}`,
    `Trust score: ${dealContext.trustScore || "not listed"}`,
    `Suggested offer: ${formatAiMoney(dealContext.offerPrice) || "not listed"}`,
    `Distance: ${formatAiDistance(dealContext.distanceKm) || "not listed"}`,
    `Area: ${dealContext.area || "not listed"}`,
    `Source: ${dealContext.source || "not listed"}`,
    `Date posted: ${dealContext.datePosted || "not listed"}`,
    `Battery: ${dealContext.specs?.batteryHealth || "not listed"}`,
    `Carrier: ${dealContext.specs?.carrier || "not listed"}`,
    `Storage: ${dealContext.specs?.storage || "not listed"}`,
    `Damage/issues: ${dealContext.specs?.damageIssues || "not listed"}`,
    `Accessories: ${dealContext.specs?.accessories || "not listed"}`,
    `Warranty: ${dealContext.specs?.warranty || "not listed"}`,
    `Risk flags: ${dealContext.riskFlags?.join(", ") || "none listed"}`,
    `Pros: ${dealContext.pros?.join(", ") || "none listed"}`,
    `Cons: ${dealContext.cons?.join(", ") || "none listed"}`,
    `Reason: ${dealContext.reason || "not listed"}`,
    `Description: ${dealContext.description || "not listed"}`,
    `Listing URL: ${dealContext.listingUrl || "not attached"}`
  ].join("\n");
}

function isSimpleGreeting(text) {
  const value = cleanText(text).toLowerCase().replace(/[.!?]+$/g, "").trim();

  return /^(hi|hello|hey|heyy|yo|sup|what's up|whats up|good morning|good afternoon|good evening|thanks|thank you|ok|okay|cool|nice)$/i.test(value);
}

function isDealContextFollowUp(text) {
  const value = cleanText(text).toLowerCase();

  if (!value || isSimpleGreeting(value)) {
    return false;
  }

  const asksAboutPriorThing =
    /\b(this|that|it|one|listing|seller|deal|phone|price|offer|buy|worth|safe|scam|negotiate|battery|storage|condition|carrier|imei|icloud|marketplace)\b/i.test(value);
  const hasQuestionOrCommand =
    /[?]|\b(should|would|could|can|is|are|was|were|do|does|did|what|how|why|compare|check|analyze|rank|tell me|explain)\b/i.test(value);

  return asksAboutPriorThing && hasQuestionOrCommand;
}

function shouldUseDealContextForMessage(userMessage, dealContext) {
  if (!dealContext) {
    return false;
  }

  const text = `${userMessage.text || ""} ${userMessage.listingUrl || ""}`;

  if (/^https?:\/\//i.test(cleanText(text))) {
    return true;
  }

  return isDealContextFollowUp(text);
}

function shouldUseAssistantProductContextForMessage(userMessage, route) {
  const text = cleanText(userMessage.text || userMessage.listingUrl);

  if (route === "deal") {
    return true;
  }

  return Boolean(detectPhoneModel(text)) || /\b(deal|deals|listing|listings|product|products|marketplace|kijiji|facebook marketplace|ebay|best buy|buy|worth|price|prices|budget|cheap|cheapest|phone|iphone|samsung|galaxy|pixel|laptop|macbook|console|ps5|xbox)\b/i.test(text);
}

function getContextForCurrentMessage(userMessage, route, assistantContext = {}) {
  const keepProductContext = shouldUseAssistantProductContextForMessage(userMessage, route);
  const keepLocationContext = route === "local" || route === "deal";

  return {
    ...assistantContext,
    product: keepProductContext ? assistantContext.product : "",
    minPrice: keepProductContext ? assistantContext.minPrice : 0,
    maxPrice: keepProductContext ? assistantContext.maxPrice : 0,
    maxDistanceKm: keepProductContext ? assistantContext.maxDistanceKm : 0,
    locationLabel: keepLocationContext ? assistantContext.locationLabel : "",
    latitude: keepLocationContext ? assistantContext.latitude : null,
    longitude: keepLocationContext ? assistantContext.longitude : null
  };
}

function shouldResetChatContextForMessage(userMessage, route) {
  const text = cleanText(userMessage.text || userMessage.listingUrl);

  return isSimpleGreeting(text) || (route === "general" && !/\b(this|that|it|continue|above|previous|earlier|same|again)\b/i.test(text));
}

function buildRecentChatLines(messages, options = {}) {
  if (options.resetContext) {
    return "Recent chat intentionally not attached because the current message starts a new or unrelated topic.";
  }

  const recentMessages = messages
    .filter((message) => message.status !== "thinking")
    .filter((message) => message.text || message.listingUrl)
    .slice(options.route === "general" ? -6 : -16);

  if (!recentMessages.length) {
    return "No previous messages.";
  }

  return recentMessages
    .map((message) => {
      const speaker = message.role === "assistant" ? "SuperFinderX AI" : message.username;
      return `${speaker}: ${message.text || message.listingUrl || "(no text)"}`;
    })
    .join("\n");
}

function buildLocalDealReply(userMessage, dealContext) {
  const text = userMessage.text || "";
  const lowerText = text.toLowerCase();
  const product = dealContext?.product || detectPhoneModel(text) || "that phone";
  const price = dealContext?.price || extractPriceFromText(text);
  const batteryHealth = dealContext?.specs?.batteryHealth || getBatteryHealthFromText(text);
  const priceRangeAdvice = describePriceRange(product, price, batteryHealth);
  const riskFlags = dealContext?.riskFlags || [];
  const score = cleanNumber(dealContext?.score);
  const offerPrice = dealContext?.offerPrice;
  const problems = [];

  if (/crack|scratch|dent|as is|for parts|icloud|locked|no receipt|cash only|ship|deposit|e-transfer|wire|too good/i.test(text)) {
    problems.push("the wording has scam or condition signals");
  }

  if (riskFlags.length) {
    problems.push(`risk flags: ${riskFlags.join(", ")}`);
  }

  if (/locked/i.test(dealContext?.specs?.carrier || text) && !/unlocked/i.test(dealContext?.specs?.carrier || text)) {
    problems.push("carrier lock needs verification");
  }

  if (/^\d{2,3}%$/.test(batteryHealth) && Number.parseInt(batteryHealth, 10) < 85) {
    problems.push(`battery is low at ${batteryHealth}`);
  }

  if (dealContext) {
    const verdict = score >= 82 ? "worth considering" : score >= 65 ? "worth negotiating, not an instant yes" : "probably a pass unless the price drops";
    const priceLine = price ? `${product} at ${formatAiMoney(price)}` : product;
    const offerLine = offerPrice ? `I would start around ${formatAiMoney(offerPrice)}.` : "Ask for the lowest pickup price before meeting.";
    const riskLine = problems.length ? `Watch out for ${problems.join("; ")}.` : "No major red flags jump out from the attached details.";

    return `Short take: ${verdict}. ${priceLine}${dealContext.condition ? ` in ${dealContext.condition} condition` : ""}${batteryHealth ? ` with battery at ${batteryHealth}` : ""} looks ${score ? `like a ${score}/100 deal` : "reasonable only if the seller checks out"}. ${offerLine} ${riskLine} Before paying, verify IMEI/iCloud lock, Face ID, cameras, battery health in Settings, and meet in a public place.`;
  }

  if (lowerText.includes("scam") || lowerText.includes("safe")) {
    return `I would treat it as risky until verified. Ask for a live photo, IMEI/serial check, proof it is not iCloud locked, battery health screenshot, and a public meetup. Avoid deposits, shipping pressure, e-transfer-only sellers, and prices far below normal market.`;
  }

  if (price || batteryHealth) {
    const batteryLine = batteryHealth ? ` Battery at ${batteryHealth} is ${Number.parseInt(batteryHealth, 10) >= 88 ? "solid" : "a negotiation point"}.` : "";
    return `${priceRangeAdvice || "It could be worth it, but I need the storage, condition, carrier status, and seller history to be confident."} ${price ? `Compare against similar local sold listings and negotiate if accessories, warranty, or battery health are missing.` : ""}${batteryLine} Verify IMEI/iCloud lock and test Face ID, cameras, speakers, charging, and cellular before paying.`;
  }

  if (priceRangeAdvice) {
    return `${priceRangeAdvice} I still need the exact asking price, storage, condition, carrier lock status, seller rating, and listing link before calling it a definite yes. Red flags are no IMEI check, iCloud lock excuses, deposits, shipping pressure, or a vague seller profile.`;
  }

  return `Useful answer: maybe, but not enough details yet. For ${product}, share the price, storage, battery health, condition, carrier lock status, seller rating, and listing link. As a quick rule: strong deal if battery is 88%+, unlocked, no repairs/damage, seller has real reviews, and price is clearly below similar local listings. Red flags are no IMEI check, iCloud lock excuses, deposits, shipping pressure, or a vague seller profile.`;
}

function isWeatherQuestion(text) {
  return /\b(weather|forecast|temperature|temp|rain|snow|wind|humid|humidity|umbrella)\b/i.test(cleanText(text));
}

function isMathQuestion(text) {
  const value = cleanText(text);
  return (
    /^\s*(what(?:'s| is)?|calculate|solve|answer)?\s*-?\d+(?:\.\d+)?\s*(?:[+\-*/x×]|divided by|times|plus|minus)\s*-?\d+(?:\.\d+)?\s*\??\s*$/i.test(value) ||
    /\b(calculate|solve|what(?:'s| is) the answer|math|equation|percent|percentage)\b/i.test(value) ||
    /-?\d+(?:\.\d+)?\s*%\s+of\s+-?\d+(?:\.\d+)?/i.test(value)
  );
}

function isPlacesQuestion(text) {
  return /\b(restaurants?|resturants?|restraunts?|food|places? to eat|dining|coffee|cafe|cafes|brunch|dinner|lunch|breakfast|bars?|stores?|shops?|business(?:es)?|business listings?|services?|repair|phone repair|places?|things to do|activities|attractions?|parks?|movies?|events?|google maps?|google local|maps urls?|maps links?|go|near me|nearby|open now|closest)\b/i.test(
    cleanText(text)
  );
}

function isRestaurantQuestion(text) {
  return /\b(restaurants?|resturants?|restraunts?|food|places? to eat|dining|eats?|brunch|dinner|lunch|breakfast|takeout|sushi|pizza|steak|noodles?|ramen|shawarma|burger|cuisine)\b/i.test(
    cleanText(text)
  );
}

function isStoreQuestion(text) {
  return /\b(stores?|shops?|mall|retail|grocery|supermarket|electronics|pharmacy|hardware|repair|phone repair|business(?:es)?|services?|open now|closest)\b/i.test(
    cleanText(text)
  );
}

function isActivityQuestion(text) {
  return /\b(places?|things to do|activities|attractions?|parks?|movies?|events?|somewhere|go)\b/i.test(cleanText(text));
}

function isLocalQuestion(text) {
  const value = cleanText(text);
  return (
    isWeatherQuestion(value) ||
    isPlacesQuestion(value) ||
    /\b(near me|nearby|in my area|around me|local|open now|closest)\b/i.test(value) ||
    (Boolean(extractCityFromText(value)) && /\b(best|top|near|nearby|restaurant|food|store|shop|repair|business|service|price|prices|cost|things to do|go)\b/i.test(value))
  );
}

function isDealQuestion(text, dealContext) {
  const value = cleanText(text).toLowerCase();

  if (isSimpleGreeting(value)) {
    return false;
  }

  if (/^https?:\/\//i.test(value) || (dealContext && isDealContextFollowUp(value))) {
    return true;
  }

  return (
    Boolean(detectPhoneModel(value)) ||
    /\b(deal|listing|seller|buy|worth|price|budget|under|below|max|cheapest|best value|compare|vs|versus|scam|fake|safe|negotiate|offer|marketplace|ebay|kijiji|facebook|phone|iphone|samsung|galaxy|pixel|laptop|gaming laptop|macbook|headphones|tv|monitor|console|ps5|xbox|product)\b/i.test(
      value
    )
  );
}

function getChatRoute(userMessage, dealContext) {
  const text = `${userMessage.text || ""} ${userMessage.listingUrl || ""}`;

  if (isMathQuestion(text)) {
    return "math";
  }

  if (isLocalQuestion(text)) {
    return "local";
  }

  if (isDealQuestion(text, dealContext)) {
    return "deal";
  }

  if (extractCityFromText(text)) {
    return "local";
  }

  return "general";
}

function getAssistantSystemPrompt(route) {
  const basePrompt = [
    "You are SuperFinderX AI, a universal assistant inside a deal-finder and product-search app.",
    "Reply to the user's actual current message first. Use recent chat as memory only when it is directly relevant.",
    "Keep the deal-finder identity: when the user asks about buying, prices, listings, products, scams, comparisons, or negotiations, switch into practical deal-analysis mode.",
    "For general questions, answer like a normal helpful AI assistant. Do not force every topic back to phones or deals.",
    "If the current user message is a greeting, thanks, or a clear topic change, do not mention previous phones, listings, products, or marketplace searches unless the user asks.",
    `For local questions, answer only from live lookup context supplied by the backend. If live lookup context is missing, say exactly: ${LIVE_DATA_RETRY_TEXT}`,
    "Do not claim you opened a URL or verified a live page unless live context is explicitly provided below.",
    "Be clear, natural, and concise. Use bullets only when they make the answer easier to scan."
  ].join(" ");

  const routePrompt = {
    deal:
      "Current route: deal analysis mode. Lead with a verdict or best choice, then explain price/value, risks, alternatives, and next steps. For phone listings, check battery health, carrier lock, iCloud/IMEI, repairs, condition, seller trust, and negotiation. For non-phone products, compare specs, reliability, value, and what to avoid.",
    local:
      "Current route: location-aware assistant mode. Prioritize weather, nearby places, local businesses, stores, repairs, prices, and things to do. Do not invent local results.",
    math:
      "Current route: math-in-chat mode. Answer calculations directly inside the assistant chat. Do not mention or expose a separate calculator tool.",
    general:
      "Current route: general assistant mode. Explain, write, brainstorm, plan, tutor, or draft normally. Keep continuity with the recent chat."
  };

  return `${basePrompt} ${routePrompt[route] || routePrompt.general}`;
}

function extractLocationHint(text, assistantContext = {}) {
  const value = cleanText(text);
  const city = extractCityFromText(value);

  if (city) {
    return city;
  }

  const locationMatch = value.match(/\b(?:in|near|around|close to|by|for)\s+([A-Za-z][A-Za-z .'-]{2,80})(?:[?.,!]|$)/i);

  if (locationMatch) {
    const location = cleanText(locationMatch[1]).replace(/\b(today|tomorrow|this week|right now|now|please)\b.*$/i, "").trim();

    if (location && !/^(me|my area|here|this area)$/i.test(location)) {
      return titleCase(location);
    }
  }

  if (/\b(near me|nearby|around me|my area|here|current location)\b/i.test(value) && assistantContext.locationLabel) {
    return assistantContext.locationLabel;
  }

  return assistantContext.locationLabel || "";
}

function hasUsableCoordinates(assistantContext = {}) {
  return assistantContext.latitude !== null && assistantContext.longitude !== null;
}

function shouldUseContextCoordinates(text, assistantContext = {}) {
  const location = cleanText(assistantContext.locationLabel).toLowerCase();
  return (
    hasUsableCoordinates(assistantContext) &&
    (!location ||
      /\b(near me|nearby|around me|my area|here|current location)\b/i.test(text) ||
      /^(current location|dropped pin|selected area)/i.test(location))
  );
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    throw new Error(`${label} failed.`);
  }

  return data;
}

function getKnownWeatherLocation(location) {
  const value = expandLocalSearchLocation(location).toLowerCase();
  const knownLocations = new Map([
    ["richmond hill", { name: "Richmond Hill, Ontario, Canada", latitude: 43.8828, longitude: -79.4403 }],
    ["richmond hill, ontario, canada", { name: "Richmond Hill, Ontario, Canada", latitude: 43.8828, longitude: -79.4403 }],
    ["markham", { name: "Markham, Ontario, Canada", latitude: 43.8561, longitude: -79.337 }],
    ["markham, ontario, canada", { name: "Markham, Ontario, Canada", latitude: 43.8561, longitude: -79.337 }],
    ["vaughan", { name: "Vaughan, Ontario, Canada", latitude: 43.8372, longitude: -79.5083 }],
    ["vaughan, ontario, canada", { name: "Vaughan, Ontario, Canada", latitude: 43.8372, longitude: -79.5083 }],
    ["toronto", { name: "Toronto, Ontario, Canada", latitude: 43.6532, longitude: -79.3832 }],
    ["toronto, ontario, canada", { name: "Toronto, Ontario, Canada", latitude: 43.6532, longitude: -79.3832 }],
    ["mississauga", { name: "Mississauga, Ontario, Canada", latitude: 43.589, longitude: -79.6441 }],
    ["mississauga, ontario, canada", { name: "Mississauga, Ontario, Canada", latitude: 43.589, longitude: -79.6441 }]
  ]);

  return knownLocations.get(value) || null;
}

async function geocodeLocation(location) {
  const knownLocation = getKnownWeatherLocation(location);

  if (knownLocation) {
    return knownLocation;
  }

  const url = new URL(OPEN_METEO_GEOCODING_ENDPOINT);
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const data = await fetchJson(url, "Weather location lookup");
  const result = Array.isArray(data.results) ? data.results[0] : null;

  if (!result) {
    throw new Error("Location was not found.");
  }

  return {
    name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
    latitude: result.latitude,
    longitude: result.longitude
  };
}

function describeWeatherCode(code) {
  const weatherCodes = new Map([
    [0, "clear"],
    [1, "mainly clear"],
    [2, "partly cloudy"],
    [3, "overcast"],
    [45, "foggy"],
    [48, "foggy with rime"],
    [51, "light drizzle"],
    [53, "drizzle"],
    [55, "heavy drizzle"],
    [56, "freezing drizzle"],
    [57, "heavy freezing drizzle"],
    [61, "light rain"],
    [63, "rain"],
    [65, "heavy rain"],
    [66, "freezing rain"],
    [67, "heavy freezing rain"],
    [71, "light snow"],
    [73, "snow"],
    [75, "heavy snow"],
    [77, "snow grains"],
    [80, "light showers"],
    [81, "showers"],
    [82, "heavy showers"],
    [85, "light snow showers"],
    [86, "heavy snow showers"],
    [95, "thunderstorms"],
    [96, "thunderstorms with hail"],
    [99, "severe thunderstorms with hail"]
  ]);

  return weatherCodes.get(Number(code)) || "mixed conditions";
}

function formatTemperature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}°C` : "not listed";
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "";
}

function formatWeatherMeasurement(value, unit = "") {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "";
  }

  const rounded = Math.round(number);
  return unit ? `${rounded} ${unit}` : String(rounded);
}

function formatMathNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "";
  }

  if (Number.isInteger(number)) {
    return number.toLocaleString("en-US");
  }

  return Number(number.toFixed(6)).toLocaleString("en-US");
}

function solveMathQuestion(text) {
  const value = cleanText(text)
    .replace(/[?=]/g, "")
    .replace(/\bwhat(?:'s| is)?\b/i, "")
    .replace(/\b(calculate|solve|answer)\b/gi, "")
    .trim();
  const percentOfMatch = value.match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?\d+(?:\.\d+)?)/i);

  if (percentOfMatch) {
    const percent = Number(percentOfMatch[1]);
    const base = Number(percentOfMatch[2]);
    const result = (percent / 100) * base;
    return `${formatMathNumber(percent)}% of ${formatMathNumber(base)} = ${formatMathNumber(result)}.`;
  }

  const binaryMatch = value.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|×|\*|divided by|\/)\s*(-?\d+(?:\.\d+)?)\s*$/i
  );

  if (!binaryMatch) {
    return "";
  }

  const left = Number(binaryMatch[1]);
  const operator = binaryMatch[2].toLowerCase();
  const right = Number(binaryMatch[3]);
  let result = null;
  let displayOperator = operator;

  if (operator === "plus" || operator === "+") {
    result = left + right;
    displayOperator = "+";
  } else if (operator === "minus" || operator === "-") {
    result = left - right;
    displayOperator = "-";
  } else if (operator === "times" || operator === "x" || operator === "×" || operator === "*") {
    result = left * right;
    displayOperator = "x";
  } else if (operator === "divided by" || operator === "/") {
    if (right === 0) {
      return "You can’t divide by zero.";
    }

    result = left / right;
    displayOperator = "/";
  }

  return Number.isFinite(result)
    ? `${formatMathNumber(left)} ${displayOperator} ${formatMathNumber(right)} = ${formatMathNumber(result)}.`
    : "";
}

function formatWeatherTimeLabel(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return cleanText(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric"
  }).format(date);
}

function formatWeatherDayLabel(value) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return cleanText(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function getNextHourlyForecasts(hourly = {}, currentTime = "") {
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const temperatures = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const rainChances = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
  const weatherCodes = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
  const currentDate = currentTime ? new Date(currentTime) : new Date();
  const currentMs = currentDate.getTime();
  const startIndex = times.findIndex((time) => {
    const date = new Date(time);
    return !Number.isNaN(date.getTime()) && date.getTime() >= currentMs;
  });

  return times
    .slice(startIndex > -1 ? startIndex : 0)
    .map((time, offset) => {
      const index = (startIndex > -1 ? startIndex : 0) + offset;
      const temp = formatTemperature(temperatures[index]);
      const condition = describeWeatherCode(weatherCodes[index]);
      const rain = formatPercent(rainChances[index]);
      return `${formatWeatherTimeLabel(time)}: ${temp}, ${condition}${rain ? `, ${rain} rain` : ""}`;
    })
    .slice(0, 6);
}

function getDailyForecasts(daily = {}) {
  const times = Array.isArray(daily.time) ? daily.time : [];
  const highTemps = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const lowTemps = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const rainChances = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : [];
  const weatherCodes = Array.isArray(daily.weather_code) ? daily.weather_code : [];

  return times
    .map((time, index) => {
      const high = formatTemperature(highTemps[index]);
      const low = formatTemperature(lowTemps[index]);
      const rain = formatPercent(rainChances[index]);
      return `${formatWeatherDayLabel(time)}: ${high} / ${low}, ${describeWeatherCode(weatherCodes[index])}${
        rain ? `, ${rain} rain` : ""
      }`;
    })
    .slice(0, 3);
}

function cleanExternalUrl(value) {
  const url = cleanText(value);

  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return "";
    }

    parsedUrl.searchParams.delete("api_key");
    parsedUrl.searchParams.delete("apikey");
    return parsedUrl.toString();
  } catch {
    return "";
  }
}

function buildGoogleSearchSourceUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(cleanText(query))}`;
}

function escapeRegExp(value) {
  return cleanText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLiveSearchLocation(userMessage, assistantContext = {}) {
  const text = userMessage.text || "";
  const locationHint = extractLocationHint(text, assistantContext);
  const contextLabel = cleanText(assistantContext.locationLabel);
  const normalizedLocationHint = expandLocalSearchLocation(locationHint);
  const normalizedContextLabel = expandLocalSearchLocation(contextLabel);
  const locationMatchesContext =
    locationHint &&
    contextLabel &&
    (contextLabel.toLowerCase().includes(locationHint.toLowerCase()) ||
      normalizedContextLabel.toLowerCase().includes(normalizedLocationHint.toLowerCase()));
  const coordinateSearch =
    hasUsableCoordinates(assistantContext) &&
    (!locationHint ||
      /\b(near me|nearby|around me|my area|here|current location)\b/i.test(text) ||
      locationMatchesContext ||
      /^(current location|dropped pin|selected area)$/i.test(locationHint));

  if (coordinateSearch) {
    const label = normalizedContextLabel || normalizedLocationHint || "your selected area";
    return {
      label,
      serpLocation: getSerpApiLocation(label),
      ll: `@${assistantContext.latitude},${assistantContext.longitude},14z`
    };
  }

  if (locationHint) {
    return {
      label: normalizedLocationHint,
      serpLocation: getSerpApiLocation(normalizedLocationHint),
      ll: ""
    };
  }

  return null;
}

function expandLocalSearchLocation(location) {
  const value = cleanText(location);

  if (!value || /\b(canada|ontario|quebec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|pei|united states|usa|new york|california|texas|florida|washington|illinois|massachusetts)\b/i.test(value)) {
    return value;
  }

  const canadianCityMap = new Map([
    ["richmond hill", "Richmond Hill, Ontario, Canada"],
    ["markham", "Markham, Ontario, Canada"],
    ["vaughan", "Vaughan, Ontario, Canada"],
    ["mississauga", "Mississauga, Ontario, Canada"],
    ["brampton", "Brampton, Ontario, Canada"],
    ["scarborough", "Scarborough, Ontario, Canada"],
    ["north york", "North York, Ontario, Canada"],
    ["etobicoke", "Etobicoke, Ontario, Canada"],
    ["oakville", "Oakville, Ontario, Canada"],
    ["barrie", "Barrie, Ontario, Canada"],
    ["hamilton", "Hamilton, Ontario, Canada"],
    ["ottawa", "Ottawa, Ontario, Canada"],
    ["kitchener", "Kitchener, Ontario, Canada"],
    ["waterloo", "Waterloo, Ontario, Canada"],
    ["toronto", "Toronto, Ontario, Canada"],
    ["montreal", "Montreal, Quebec, Canada"],
    ["dorval", "Dorval, Quebec, Canada"],
    ["calgary", "Calgary, Alberta, Canada"],
    ["edmonton", "Edmonton, Alberta, Canada"],
    ["vancouver", "Vancouver, British Columbia, Canada"]
  ]);
  const normalizedValue = value.toLowerCase();

  return canadianCityMap.get(normalizedValue) || value;
}

function formatSerpWeatherTemperature(value, unit) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  if (/[°CF]/i.test(text)) {
    return text;
  }

  if (/celsius|metric/i.test(cleanText(unit))) {
    return `${text}°C`;
  }

  if (/fahrenheit|imperial/i.test(cleanText(unit))) {
    return `${text}°F`;
  }

  return unit ? `${text} ${unit}` : text;
}

function formatWeatherAnswer({ locationName, currentTemperature, condition, high, low, rainChance, humidity, wind, precipitation, hourlyForecast, dailyForecast, source }) {
  return cleanAiMessageText(
    [
      `Live weather for ${locationName}:`,
      currentTemperature ? `Current temperature: ${currentTemperature}` : "",
      condition ? `Condition: ${condition}` : "",
      high || low ? `High/low: ${high || "not listed"} / ${low || "not listed"}` : "",
      rainChance ? `Chance of rain: ${rainChance}` : "",
      humidity ? `Humidity: ${humidity}` : "",
      wind ? `Wind: ${wind}` : "",
      precipitation ? `Precipitation: ${precipitation}` : "",
      hourlyForecast?.length ? "Hourly forecast:" : "",
      ...(hourlyForecast || []).map((forecast) => `- ${forecast}`),
      dailyForecast?.length ? "Daily forecast:" : "",
      ...(dailyForecast || []).map((forecast) => `- ${forecast}`),
      source ? `Source: ${source}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  );
}

async function fetchOpenMeteoWeatherAnswer(location, assistantContext) {
  const weatherLocation =
    location.ll && hasUsableCoordinates(assistantContext)
      ? {
          name: location.label,
          latitude: assistantContext.latitude,
          longitude: assistantContext.longitude
        }
      : await geocodeLocation(location.label);
  const forecastUrl = new URL(OPEN_METEO_FORECAST_ENDPOINT);
  forecastUrl.searchParams.set("latitude", weatherLocation.latitude);
  forecastUrl.searchParams.set("longitude", weatherLocation.longitude);
  forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m");
  forecastUrl.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  forecastUrl.searchParams.set("temperature_unit", "celsius");
  forecastUrl.searchParams.set("wind_speed_unit", "kmh");
  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("forecast_days", "3");

  const data = await fetchJson(forecastUrl, "Weather forecast lookup");
  const current = data.current || {};
  const currentUnits = data.current_units || {};
  const daily = data.daily || {};
  const currentTemperature = formatTemperature(current.temperature_2m);
  const condition = describeWeatherCode(current.weather_code);
  const high = formatTemperature(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : undefined);
  const low = formatTemperature(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : undefined);
  const rainChance = formatPercent(Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] : undefined);
  const humidity = formatPercent(current.relative_humidity_2m);
  const wind = formatWeatherMeasurement(current.wind_speed_10m, currentUnits.wind_speed_10m || "km/h");
  const precipitation = formatWeatherMeasurement(current.precipitation ?? current.rain, currentUnits.precipitation || "mm");
  const hourlyForecast = getNextHourlyForecasts(data.hourly, current.time);
  const dailyForecast = getDailyForecasts(daily);

  if (!Number.isFinite(Number(current.temperature_2m)) && !dailyForecast.length && !hourlyForecast.length) {
    throw new Error("Open-Meteo returned no usable weather data.");
  }

  return formatWeatherAnswer({
    locationName: weatherLocation.name,
    currentTemperature,
    condition,
    high: high !== "not listed" ? high : "",
    low: low !== "not listed" ? low : "",
    rainChance,
    humidity,
    wind,
    precipitation,
    hourlyForecast,
    dailyForecast,
    source: "Open-Meteo"
  });
}

async function fetchWttrWeatherAnswer(location) {
  const weatherUrl = new URL(`${WTTR_WEATHER_ENDPOINT}/${encodeURIComponent(location.label)}`);
  weatherUrl.searchParams.set("format", "j1");
  const data = await fetchJson(weatherUrl, "Backup weather lookup");
  const current = Array.isArray(data.current_condition) ? data.current_condition[0] || {} : {};
  const today = Array.isArray(data.weather) ? data.weather[0] || {} : {};
  const weatherDays = Array.isArray(data.weather) ? data.weather : [];
  const hourlyItems = Array.isArray(today.hourly) ? today.hourly : [];
  const condition = cleanText(Array.isArray(current.weatherDesc) ? current.weatherDesc[0]?.value : current.weatherDesc);
  const hourlyForecast = hourlyItems
    .slice(0, 6)
    .map((hour) => {
      const time = cleanText(hour.time).padStart(4, "0");
      const label = time ? `${Number(time.slice(0, -2) || 0)}:00` : "Later";
      const temp = formatTemperature(hour.tempC);
      const hourCondition = cleanText(Array.isArray(hour.weatherDesc) ? hour.weatherDesc[0]?.value : hour.weatherDesc);
      const rain = formatPercent(hour.chanceofrain);
      return `${label}: ${temp}${hourCondition ? `, ${hourCondition}` : ""}${rain ? `, ${rain} rain` : ""}`;
    })
    .filter(Boolean);
  const dailyForecast = weatherDays
    .slice(0, 3)
    .map((day) => {
      const rain = Array.isArray(day.hourly)
        ? formatPercent(Math.max(...day.hourly.map((hour) => Number(hour.chanceofrain)).filter(Number.isFinite)))
        : "";
      return `${formatWeatherDayLabel(day.date)}: ${formatTemperature(day.maxtempC)} / ${formatTemperature(day.mintempC)}${
        rain ? `, ${rain} rain` : ""
      }`;
    });

  if (!current.temp_C && !dailyForecast.length && !hourlyForecast.length) {
    throw new Error("Backup weather source returned no usable data.");
  }

  return formatWeatherAnswer({
    locationName: location.label,
    currentTemperature: formatTemperature(current.temp_C),
    condition,
    high: formatTemperature(today.maxtempC),
    low: formatTemperature(today.mintempC),
    rainChance: Array.isArray(today.hourly)
      ? formatPercent(Math.max(...today.hourly.map((hour) => Number(hour.chanceofrain)).filter(Number.isFinite)))
      : "",
    humidity: formatPercent(current.humidity),
    wind: formatWeatherMeasurement(current.windspeedKmph, "km/h"),
    precipitation: formatWeatherMeasurement(current.precipMM, "mm"),
    hourlyForecast,
    dailyForecast,
    source: "wttr.in"
  });
}

async function fetchWeatherAnswer(userMessage, assistantContext) {
  const location = getLiveSearchLocation(userMessage, assistantContext);

  if (!location) {
    throw createLiveSearchError("Invalid location/query", {
      provider: "Open-Meteo",
      feature: "weather",
      query: userMessage.text || ""
    }, LIVE_DATA_RETRY_TEXT);
  }

  try {
    return await fetchOpenMeteoWeatherAnswer(location, assistantContext);
  } catch (primaryError) {
    logLiveSearchFailure("Primary weather source failed", {
      provider: "Open-Meteo",
      feature: "weather",
      location: location.label,
      message: primaryError.message
    });
  }

  try {
    return await fetchWttrWeatherAnswer(location);
  } catch (backupError) {
    throw createLiveSearchError("Backup weather source failed", {
      provider: "wttr.in",
      feature: "weather",
      location: location.label,
      message: backupError.message
    }, LIVE_DATA_RETRY_TEXT);
  }
}

function getLocalResultItems(data = {}) {
  const localResults = data.local_results;
  const places = [];

  if (Array.isArray(localResults?.places)) {
    places.push(...localResults.places);
  }

  if (Array.isArray(localResults)) {
    places.push(...localResults);
  }

  if (localResults && typeof localResults === "object" && !Array.isArray(localResults)) {
    Object.values(localResults).forEach((value) => {
      if (Array.isArray(value)) {
        places.push(...value);
      }
    });
  }

  if (data.place_results && typeof data.place_results === "object") {
    places.push(data.place_results);
  }

  return places;
}

function extractDealProductQuery(text, assistantContext = {}) {
  const value = cleanText(text);
  const detectedModel = detectPhoneModel(value);

  if (detectedModel) {
    return detectedModel;
  }

  if (assistantContext.product) {
    return assistantContext.product;
  }

  return value
    .replace(/^https?:\/\/\S+/i, "")
    .replace(/\b(find|send|show|get|search|look for|looking for|best|cheap|cheapest|deal|deals|listing|listings|price|prices|worth|buy|under|below|max|near|around|in)\b/gi, " ")
    .replace(/\$?\d[\d,]*(?:\.\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function formatDealProductAnswer({ query, location, listings }) {
  return cleanAiMessageText(
    [
      `Live Deal Hunter listings for "${query}"${location ? ` near ${location}` : ""}:`,
      ...listings.slice(0, 5).map((listing, index) =>
        [
          `${index + 1}. Product: ${listing.product}`,
          `Price: ${listing.price ? formatAiMoney(listing.price) : "Not listed"}`,
          `Condition: ${listing.condition || "Not listed"}`,
          `Location: ${listing.area || "Not listed"}`,
          `Description: ${cleanText(listing.details?.description || listing.reason || "No description provided").slice(0, 260)}`,
          `Source: ${listing.source || "SerpApi"}`,
          `Source link: ${listing.listingUrl}`,
          `Score: ${listing.score}/100`
        ]
          .filter(Boolean)
          .join("\n")
      )
    ].join("\n\n")
  );
}

async function fetchDealProductAnswer(userMessage, assistantContext) {
  const text = cleanText(userMessage.text || userMessage.listingUrl);
  const query = extractDealProductQuery(text, assistantContext);
  const location =
    expandLocalSearchLocation(extractCityFromText(text) || assistantContext.locationLabel) ||
    cleanText(assistantContext.locationLabel);
  const maxDistance = cleanNumber(assistantContext.maxDistanceKm, 25) || 25;

  if (!query || query.length < 2) {
    throw createLiveSearchError("Invalid product query", {
      provider: "SerpApi",
      feature: "deal-product",
      query: text
    }, LIVE_DATA_RETRY_TEXT);
  }

  const result = await rankListingsFromSerpApi(query, location, maxDistance, {
    exactMatch: false
  });

  if (!result.listings?.length) {
    throw createLiveSearchError("No results found", {
      provider: "SerpApi",
      feature: "deal-product",
      query,
      location
    }, LIVE_DATA_RETRY_TEXT);
  }

  return formatDealProductAnswer({
    query,
    location,
    listings: result.listings
  });
}

function cleanLocalValue(value, fallback = "") {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "string") {
    return cleanText(value, fallback);
  }

  return fallback;
}

function flattenExtensionValues(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenExtensionValues);
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap(flattenExtensionValues);
  }

  return [cleanLocalValue(value)].filter(Boolean);
}

function getLocalResultType(place = {}) {
  const typeCandidates = [
    place.type,
    place.category,
    flattenExtensionValues(place.service_options)[0],
    Array.isArray(place.types) ? place.types[0] : "",
    flattenExtensionValues(place.extensions).find((item) => !/\d|stars?|reviews?|open|closed/i.test(item))
  ];

  return cleanText(typeCandidates.find(Boolean), "Local business");
}

function getLocalBusinessSearchTerm(text) {
  const value = cleanText(text);

  if (/\b(phone\s+repair|cell\s+phone\s+repair|mobile\s+repair)\b/i.test(value)) {
    return "phone repair shops";
  }

  if (/\b(coffee|cafes?|espresso)\b/i.test(value)) {
    return "coffee shops";
  }

  const cuisineMatch = value.match(
    /\b(sushi|pizza|ramen|shawarma|burgers?|steak|thai|chinese|indian|korean|italian|mexican|vietnamese|noodles?|bbq|barbecue|seafood|vegetarian|vegan)\b/i
  );

  if (cuisineMatch) {
    return `${cuisineMatch[1].toLowerCase()} restaurants`;
  }

  if (isRestaurantQuestion(value)) {
    return "restaurants";
  }

  if (/\b(grocery|supermarket|pharmacy|hardware|electronics|retail|stores?|shops?)\b/i.test(value)) {
    return "stores";
  }

  return "local businesses";
}

function buildLocalBusinessMapsQuery(text, searchLocation) {
  const term = getLocalBusinessSearchTerm(text);
  const location = cleanText(searchLocation);

  return location ? `${term} in ${location}` : term;
}

function isGoogleMapsBusinessUrl(value) {
  const url = cleanExternalUrl(value);

  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();
    const isMapsHost = /^maps\.google\./.test(host);

    if (!isMapsHost && (!host.includes("google.") || !path.includes("/maps"))) {
      return false;
    }

    return (
      parsedUrl.searchParams.has("query_place_id") ||
      parsedUrl.searchParams.has("cid") ||
      /^place_id:/i.test(parsedUrl.searchParams.get("q") || "") ||
      path.includes("/maps/place/")
    );
  } catch {
    return false;
  }
}

function getGoogleMapsUrl(place = {}, name = "", address = "") {
  const query = [name, address].filter(Boolean).join(" ");
  const directUrlCandidates = [
    place.google_maps_url,
    place.google_maps_link,
    place.maps_url,
    place.maps_link,
    place.place_link,
    place.link,
    place.url
  ];

  for (const candidate of directUrlCandidates) {
    const directUrl = cleanExternalUrl(candidate);
    if (isGoogleMapsBusinessUrl(directUrl)) {
      return directUrl;
    }
  }

  if (place.place_id && query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(place.place_id)}`;
  }

  if (place.data_cid || place.cid) {
    return `https://www.google.com/maps?cid=${encodeURIComponent(place.data_cid || place.cid)}`;
  }

  return "";
}

function getLocalResultSource(place = {}, name = "", address = "") {
  const sourceCandidates = [
    place.website,
    place.link,
    place.directions,
    place.serpapi_link,
    getGoogleMapsUrl(place, name, address)
  ];

  for (const candidate of sourceCandidates) {
    const source = cleanExternalUrl(candidate);
    if (source) return source;
  }

  return buildGoogleSearchSourceUrl([name, address].filter(Boolean).join(" "));
}

function isLikelyLocalAddress(value) {
  const text = cleanText(value);

  return (
    /\d/.test(text) &&
    (/\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|hwy|highway|ln|lane|ct|court|plaza|centre|center|way|circle|crescent|parkway)\b/i.test(text) ||
      /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(text) ||
      /\b(ON|Ontario|QC|Quebec|AB|Alberta|BC|British Columbia|NY|CA|TX|FL|WA|IL|MA)\b/i.test(text))
  );
}

function getLocalAddress(place = {}) {
  const extensionAddress = flattenExtensionValues(place.extensions).find(isLikelyLocalAddress);
  const addressCandidates = [
    place.address,
    place.formatted_address,
    place.full_address,
    place.street_address,
    place.location,
    Array.isArray(place.address_lines) ? place.address_lines.join(", ") : "",
    extensionAddress
  ];

  return cleanText(addressCandidates.find((candidate) => cleanText(candidate))).slice(0, 180);
}

function getLocalOpenStatus(place = {}) {
  const candidates = [
    place.open_state,
    place.open_status,
    place.status,
    place.current_status,
    typeof place.open_now === "boolean" ? (place.open_now ? "Open now" : "Closed") : "",
    typeof place.currently_open === "boolean" ? (place.currently_open ? "Open now" : "Closed") : "",
    typeof place.hours === "string" ? place.hours : "",
    typeof place.opening_hours === "string" ? place.opening_hours : ""
  ];

  return cleanLocalValue(candidates.find(Boolean));
}

function getLocalReviewCount(place = {}) {
  return cleanLocalValue(place.reviews || place.reviews_original || place.review_count || place.user_ratings_total);
}

function isBlockedLocalResultUrl(value) {
  const url = cleanExternalUrl(value);

  if (!url || isGoogleMapsBusinessUrl(url)) {
    return false;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return /\b(tripadvisor|yelp|ubereats|doordash|skipthedishes|skiptheddishes|opentable|reddit|blogto|narcity|timeout|yellowpages|foursquare|mapquest|restaurantji|restaurantguru|sirved|zomato)\b/i.test(
      host
    );
  } catch {
    return false;
  }
}

function isDirectoryOrArticleLocalResult(place = {}, name = "") {
  const text = [
    name,
    place.type,
    place.category,
    place.source,
    place.title,
    place.snippet,
    place.description
  ]
    .map((value) => cleanLocalValue(value))
    .join(" ");
  const blockedTextPattern =
    /\b(tripadvisor|yelp|uber eats|ubereats|doordash|skiptheddishes|skip the dishes|opentable|reddit|forum|blog|article|directory|yellow pages|foursquare|mapquest|restaurantji|restaurantguru|sirved|zomato|top\s+\d+|best\s+\d+|things to know|guide to)\b/i;
  const genericNamePattern = /\b(restaurants?\s+near\s+me|restaurants?\s+in\s+.+\s+-\s+google search|search results|top\s+\d+|best\s+\d+)\b/i;

  return (
    blockedTextPattern.test(text) ||
    genericNamePattern.test(cleanText(name)) ||
    [place.link, place.url, place.source_link].some(isBlockedLocalResultUrl)
  );
}

function isRestaurantBusinessResult(place = {}, type = "", name = "") {
  const text = [
    type,
    name,
    place.category,
    Array.isArray(place.types) ? place.types.join(" ") : "",
    flattenExtensionValues(place.extensions).join(" ")
  ].join(" ");

  return /\b(restaurant|food|cafe|coffee|bar|pub|grill|bistro|bakery|diner|takeout|sushi|pizza|ramen|shawarma|burger|steak|thai|chinese|indian|korean|italian|mexican|vietnamese|noodles?|bbq|barbecue|seafood|vegetarian|vegan)\b/i.test(
    text
  );
}

function isProperGoogleMapsBusinessListing(place = {}, business = {}, options = {}) {
  if (!business.name || !business.googleMapsUrl || !isGoogleMapsBusinessUrl(business.googleMapsUrl)) {
    return false;
  }

  if (!business.address) {
    return false;
  }

  if (isDirectoryOrArticleLocalResult(place, business.name)) {
    return false;
  }

  if (options.restaurantOnly && !isRestaurantBusinessResult(place, business.type, business.name)) {
    return false;
  }

  return true;
}

function normalizeReviewSnippet(value) {
  const text = cleanLocalValue(value)
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text ? (text.length > 180 ? `${text.slice(0, 177)}...` : text) : "";
}

function getLocalReviewHighlights(place = {}) {
  const candidates = [
    place.user_review,
    place.review,
    place.review_snippet,
    place.snippet,
    ...(Array.isArray(place.review_snippets) ? place.review_snippets : []),
    ...(Array.isArray(place.reviews_data) ? place.reviews_data.map((review) => review.snippet || review.text || review.comment) : [])
  ];

  return [...new Set(candidates.map(normalizeReviewSnippet).filter(Boolean))]
    .filter((snippet) => !/^reviews?$/i.test(snippet))
    .slice(0, 3);
}

function normalizeLocalResultsFromData(data, query, searchLocation, options = {}) {
  const seenMapUrls = new Set();

  return getLocalResultItems(data)
    .map((place) => normalizeLocalResult(place, query, searchLocation, options))
    .filter(Boolean)
    .filter((result) => {
      if (seenMapUrls.has(result.googleMapsUrl)) {
        return false;
      }

      seenMapUrls.add(result.googleMapsUrl);
      return true;
    })
    .slice(0, 6);
}

async function fetchGoogleLocalFallbackResults(query, searchLocation, region, options = {}) {
  try {
    const data = await fetchSerpApi(
      {
        engine: "google",
        q: query,
        location: getSerpApiLocation(searchLocation) || region.fallbackLocation,
        google_domain: region.googleDomain,
        gl: region.gl,
        hl: "en",
        num: "10",
        device: "desktop"
      },
      "Google Local assistant search"
    );

    return normalizeLocalResultsFromData(data, query, searchLocation, options);
  } catch (error) {
    if (!error.liveSearchLogged) {
      logLiveSearchFailure(getLiveSearchFailureReason(error), {
        provider: "SerpApi",
        feature: "local",
        query,
        location: searchLocation,
        message: error.message
      });
    }

    return [];
  }
}

function normalizeLocalResult(place = {}, query = "", fallbackLocation = "", options = {}) {
  const name = cleanText(place.title || place.name || place.place);

  if (!name) {
    return null;
  }

  const rating = cleanLocalValue(place.rating || place.rating_text);
  const reviewCount = getLocalReviewCount(place);
  const address = getLocalAddress(place);
  const phone = cleanLocalValue(place.phone || place.phone_number || place.telephone);
  const openStatus = getLocalOpenStatus(place);
  const type = getLocalResultType(place);
  const googleMapsUrl = cleanExternalUrl(getGoogleMapsUrl(place, name, address || fallbackLocation));
  const reviewHighlights = getLocalReviewHighlights(place);
  const whyParts = [];
  const business = {
    name,
    address,
    googleMapsUrl,
    type
  };

  if (!isProperGoogleMapsBusinessListing(place, business, options)) {
    return null;
  }

  if (rating) {
    whyParts.push(`rated ${rating}${/star/i.test(rating) ? "" : " stars"}`);
  }

  if (reviewCount) {
    whyParts.push(`${reviewCount} reviews`);
  }

  if (openStatus) {
    whyParts.push(openStatus);
  }

  if (!whyParts.length) {
    whyParts.push(`appears in live SerpApi results for "${query}"`);
  }

  return {
    name,
    rating: rating ? `${rating}${/star/i.test(rating) ? "" : " stars"}` : "Not available",
    reviewCount: reviewCount || "Not available",
    reviewHighlights,
    address,
    phone: phone || "Not available",
    googleMapsUrl,
    openStatus: openStatus || "Not available",
    type,
    why: `Listed because it ${whyParts.join(", ")}.`
  };
}

function formatLocalResultsAnswer({ query, location, results, restaurantOnly = false }) {
  const nameLabel = restaurantOnly ? "Restaurant name" : "Business name";

  return cleanAiMessageText(
    [
      `Live Google Maps business listings for "${query}"${location ? ` near ${location}` : ""}:`,
      ...results.slice(0, 6).map((result, index) =>
        [
          `${index + 1}. ${nameLabel}: ${result.name}`,
          `Google Maps URL: ${result.googleMapsUrl}`,
          `Rating: ${result.rating}`,
          `Review count: ${result.reviewCount}`,
          `Address: ${result.address}`,
          `Phone: ${result.phone}`,
          `Open/closed status: ${result.openStatus}`,
          "Review highlights:",
          ...(result.reviewHighlights.length
            ? result.reviewHighlights.map((snippet) => `- ${snippet}`)
            : ["- Reviews not available from live search."]),
          `Business category/type: ${result.type}`,
          `Why listed: ${result.why}`
        ]
          .filter(Boolean)
          .join("\n")
      )
    ].join("\n\n")
  );
}

async function fetchLocalPlacesAnswer(userMessage, assistantContext) {
  const location = getLiveSearchLocation(userMessage, assistantContext);
  const text = cleanText(userMessage.text || "");

  if (!text || text.length < 3) {
    throw createLiveSearchError("Invalid location/query", {
      provider: "SerpApi",
      feature: "local",
      query: text
    });
  }

  if (!location && /\b(near me|nearby|around me|my area|here|closest)\b/i.test(text)) {
    throw createLiveSearchError("Invalid location/query", {
      provider: "SerpApi",
      feature: "local",
      query: text,
      message: "A selected location or coordinates are required for near-me searches."
    });
  }

  const searchLocation = location?.label || expandLocalSearchLocation(extractCityFromText(text) || assistantContext.locationLabel) || "";
  const restaurantOnly = isRestaurantQuestion(text);
  const query = buildLocalBusinessMapsQuery(text, searchLocation);

  const region = getSerpApiRegion(searchLocation);
  const data = await fetchSerpApi(
    {
      engine: "google_maps",
      q: query,
      type: "search",
      ...(location?.ll ? { ll: location.ll } : {}),
      hl: "en",
      gl: region.gl,
      google_domain: region.googleDomain
    },
    "Google Maps local assistant search"
  );
  let results = normalizeLocalResultsFromData(data, query, searchLocation, { restaurantOnly });

  if (!results.length) {
    results = await fetchGoogleLocalFallbackResults(query, searchLocation, region, { restaurantOnly });
  }

  if (!results.length) {
    logLiveSearchFailure("No results found", {
      provider: "SerpApi",
      feature: "local",
      query,
      location: searchLocation
    });
    return NO_GOOGLE_MAPS_BUSINESS_RESULTS_TEXT;
  }

  return formatLocalResultsAnswer({
    query,
    location: searchLocation,
    results,
    restaurantOnly
  });
}

async function retryLookup(operation, retries = 1, delayMs = 450) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!shouldRetryLiveSearchError(error)) {
        break;
      }

      if (attempt < retries) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error("Lookup failed.");
}

async function fetchProductSearchContext(userMessage, assistantContext) {
  if (!getSerpApiKey()) {
    return "";
  }

  const query = cleanText(userMessage.text || assistantContext.product).slice(0, 180);

  if (!query || query.length < 4) {
    return "";
  }

  const region = getSerpApiRegion(assistantContext.locationLabel);
  const data = await fetchSerpApi(
    {
      engine: "google_shopping",
      q: query,
      location: getSerpApiLocation(assistantContext.locationLabel) || region.fallbackLocation,
      google_domain: region.googleDomain,
      gl: region.gl,
      hl: "en",
      device: "desktop"
    },
    "Product assistant search"
  );
  const items = Array.isArray(data.shopping_results) ? data.shopping_results.slice(0, 6) : [];

  if (!items.length) {
    return "";
  }

  return [
    "Live product search snippets:",
    ...items.map((item, index) => {
      const title = cleanText(item.title || item.name).slice(0, 120);
      const price = cleanText(item.price || (item.extracted_price ? formatAiMoney(item.extracted_price) : ""));
      const source = cleanText(item.source || getSourceName(getSerpApiUrl(item))).slice(0, 60);
      const rating = cleanText(item.rating ? `${item.rating} stars` : "");
      return `${index + 1}. ${[title, price, source, rating].filter(Boolean).join(" - ")}`;
    })
  ].join("\n");
}

async function buildAssistantSupportContext(userMessage, route, dealContext, assistantContext) {
  const text = userMessage.text || "";
  const support = [];

  if (route === "math") {
    const mathAnswer = solveMathQuestion(text);

    if (mathAnswer) {
      return {
        directAnswer: mathAnswer,
        researchText: "",
        liveLookupUnavailable: false
      };
    }
  }

  if (route === "local" && isWeatherQuestion(text)) {
    try {
      return {
        directAnswer: await retryLookup(() => fetchWeatherAnswer(userMessage, assistantContext)),
        researchText: "",
        liveLookupUnavailable: false
      };
    } catch (error) {
      if (!error.liveSearchLogged) {
        logLiveSearchFailure(getLiveSearchFailureReason(error), {
          provider: "Open-Meteo",
          feature: "weather",
          message: error.message
        });
      }

      return {
        directAnswer: LIVE_DATA_RETRY_TEXT,
        researchText: "",
        liveLookupUnavailable: true
      };
    }
  }

  if (route === "local") {
    try {
      return {
        directAnswer: await retryLookup(() => fetchLocalPlacesAnswer(userMessage, assistantContext)),
        researchText: "",
        liveLookupUnavailable: false
      };
    } catch (error) {
      if (!error.liveSearchLogged) {
        logLiveSearchFailure(getLiveSearchFailureReason(error), {
          provider: "SerpApi",
          feature: "local",
          message: error.message
        });
      }

      return {
        directAnswer: LIVE_DATA_RETRY_TEXT,
        researchText: "",
        liveLookupUnavailable: true
      };
    }
  }

  if (route === "deal" && !dealContext) {
    try {
      return {
        directAnswer: await retryLookup(() => fetchDealProductAnswer(userMessage, assistantContext)),
        researchText: "",
        liveLookupUnavailable: false
      };
    } catch (error) {
      if (!error.liveSearchLogged) {
        logLiveSearchFailure(getLiveSearchFailureReason(error), {
          provider: "SerpApi",
          feature: "deal-product",
          message: error.message
        });
      }

      return {
        directAnswer: LIVE_DATA_RETRY_TEXT,
        researchText: "",
        liveLookupUnavailable: true
      };
    }
  }

  return {
    directAnswer: "",
    researchText: support.join("\n\n"),
    liveLookupUnavailable: false
  };
}

function buildLocalGeneralReply(userMessage, route, dealContext, assistantContext, supportContext = {}) {
  const text = cleanText(userMessage.text || userMessage.listingUrl);
  const lowerText = text.toLowerCase();

  if (isSimpleGreeting(text)) {
    return "Hey, how can I help?";
  }

  if (/^(how are you|how's it going|hows it going)\??$/i.test(lowerText)) {
    return "I’m doing well and ready to help. What are we working on?";
  }

  if (route === "deal") {
    if (/gaming laptop/i.test(text)) {
      return "For a gaming laptop under $1000, prioritize an RTX 4050 or discounted RTX 4060, 16GB RAM, a current Ryzen 5/7 or Intel i5/i7 H-series chip, 512GB+ SSD, and a 144Hz display. Good value lines to compare are Lenovo LOQ, ASUS TUF A15/F15, Acer Nitro V, HP Victus, and Dell G15. Avoid 8GB RAM-only models unless upgradeable, weak GTX/RTX 2050 listings, and vague marketplace posts with no battery or warranty details.";
    }

    return buildLocalDealReply(userMessage, dealContext);
  }

  if (route === "local") {
    if (supportContext.researchText) {
      return `Here are local results to check: ${supportContext.researchText.replace(/\s+/g, " ").slice(0, 850)} Reminder: check current hours, recent reviews, and distance before you go.`;
    }

    return LIVE_DATA_RETRY_TEXT;
  }

  if (route === "math") {
    return solveMathQuestion(text) || "I can help with that math question. Send it as a simple expression, like 42 / 6 or 15% of 80.";
  }

  if (/black holes?/i.test(text)) {
    return "Black holes are regions where gravity is so strong that, past a boundary called the event horizon, nothing can escape. They form when huge stars collapse, and we detect them by how they affect nearby gas, stars, and light. They are not cosmic vacuum cleaners; you only get pulled in if you get extremely close.";
  }

  if (/\b(gym|workout|exercise|fitness)\b/i.test(text)) {
    return "Here is a simple 3-day gym plan: Day 1 push with bench press, shoulder press, incline dumbbell press, triceps pushdowns, and planks. Day 2 pull with rows, lat pulldowns, face pulls, curls, and back extensions. Day 3 legs with squats or leg press, Romanian deadlifts, lunges, hamstring curls, calves, and core. Do 3 sets of 8-12 reps, warm up first, and add weight gradually.";
  }

  return AI_FAILURE_TEXT;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestOpenAiAssistantReply(userMessage, dealContext, messages, assistantContext, route, supportContext) {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    return buildLocalGeneralReply(userMessage, route, dealContext, assistantContext, supportContext);
  }

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: cleanText(process.env.OPENAI_MODEL, "gpt-4o-mini"),
      input: [
        {
          role: "system",
          content: getAssistantSystemPrompt(route)
        },
        {
          role: "user",
          content: [
            `Current date: ${new Date().toISOString().slice(0, 10)}`,
            `Route: ${route}`,
            `User message: ${userMessage.text || userMessage.listingUrl}`,
            "",
            "App/user context:",
            buildAssistantContextLines(assistantContext),
            "",
            "Attached deal/listing context:",
            buildDealContextLines(dealContext),
            "",
            "Live lookup context:",
            supportContext.researchText || "No live lookup context attached.",
            "",
            "Recent chat (use only if directly relevant to the current message):",
            buildRecentChatLines(messages, {
              route,
              resetContext: shouldResetChatContextForMessage(userMessage, route)
            })
          ].join("\n")
        }
      ],
      max_output_tokens: route === "general" ? 520 : 420,
      temperature: route === "deal" ? 0.35 : 0.55
    })
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data) {
    throw new Error(data?.error?.message || "OpenAI request failed.");
  }

  const outputText =
    cleanText(data.output_text) ||
    cleanText(
      data.output
        ?.flatMap((item) => item.content || [])
        .map((content) => content.text || "")
        .join(" ")
    );

  if (!outputText) {
    throw new Error("OpenAI returned an empty reply.");
  }

  return cleanAiMessageText(outputText);
}

async function generateAssistantReplyText(userMessage, dealContext, contextMessages, assistantContext = {}) {
  const currentText = cleanText(userMessage.text || userMessage.listingUrl);

  if (isSimpleGreeting(currentText)) {
    return "Hey, how can I help?";
  }

  if (/^(how are you|how's it going|hows it going)\??$/i.test(currentText.toLowerCase())) {
    return "I’m doing well and ready to help. What are we working on?";
  }

  const effectiveDealContext = shouldUseDealContextForMessage(userMessage, dealContext) ? dealContext : null;
  const route = getChatRoute(userMessage, effectiveDealContext);
  const effectiveAssistantContext = getContextForCurrentMessage(userMessage, route, assistantContext);
  const supportContext = await buildAssistantSupportContext(userMessage, route, effectiveDealContext, effectiveAssistantContext);

  if (supportContext.directAnswer) {
    return supportContext.directAnswer;
  }

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const replyText = await requestOpenAiAssistantReply(
        userMessage,
        effectiveDealContext,
        contextMessages,
        effectiveAssistantContext,
        route,
        supportContext
      );
      return replyText;
    } catch (error) {
      lastError = error;

      if (attempt === 0) {
        await sleep(650);
      }
    }
  }

  const fallbackText = buildLocalGeneralReply(userMessage, route, effectiveDealContext, effectiveAssistantContext, supportContext);
  return fallbackText || lastError?.message || AI_FAILURE_TEXT;
}

function extractPriceFromText(text) {
  const prices = getPriceMatches(text);
  return prices[0]?.value || 0;
}

function getPriceMatches(text) {
  const value = cleanText(text);
  const prices = [];
  const beforeNumberPattern = /(?:ca\$|us\$|(?<![A-Za-z])\$|cad|usd)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  const afterNumberPattern = /\b([\d,]+(?:\.\d{1,2})?)\s*(?:ca\$|us\$|(?<![A-Za-z])\$|cad|usd)\b/gi;

  for (const match of value.matchAll(beforeNumberPattern)) {
    prices.push({
      value: cleanNumber(match[1]),
      index: match.index || 0
    });
  }

  for (const match of value.matchAll(afterNumberPattern)) {
    prices.push({
      value: cleanNumber(match[1]),
      index: match.index || 0
    });
  }

  return prices
    .filter((price) => price.value > 0)
    .sort((a, b) => a.index - b.index);
}

function extractPriceNearProduct(text, product) {
  const value = cleanText(text);
  const prices = getPriceMatches(value);
  const requestedModel = detectPhoneModel(product);

  if (!prices.length || !requestedModel) {
    return prices[0]?.value || 0;
  }

  const modelPattern = new RegExp(requestedModel.replace(/\s+/g, "\\s*"), "gi");
  const productPositions = [...value.matchAll(modelPattern)].map((match) => match.index || 0);

  if (!productPositions.length) {
    return prices[0]?.value || 0;
  }

  const closestPrice = prices
    .map((price) => ({
      ...price,
      distance: Math.min(...productPositions.map((position) => Math.abs(price.index - position)))
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return closestPrice?.distance <= 180 ? closestPrice.value : prices[0].value;
}

function detectPhoneModel(text) {
  const value = cleanText(text);
  const iphoneMatch = value.match(/\biphone\s*(1[1-6]|[6-9])\s*(pro\s*max|pro|plus|mini)?\b/i);

  if (iphoneMatch) {
    const suffix = cleanText(iphoneMatch[2]).replace(/\s+/g, " ");
    return `iPhone ${iphoneMatch[1]}${suffix ? ` ${titleCase(suffix.toLowerCase())}` : ""}`;
  }

  const galaxySMatch = value.match(/\b(?:samsung\s*)?(?:galaxy\s*)?s(1[0-9]|2[0-5])\s*(ultra|plus|fe)?\b/i);

  if (galaxySMatch) {
    const suffix = cleanText(galaxySMatch[2]);
    return `Samsung Galaxy S${galaxySMatch[1]}${suffix ? ` ${titleCase(suffix.toLowerCase())}` : ""}`;
  }

  const galaxyZMatch = value.match(/\b(?:samsung\s*)?galaxy\s*z\s*(fold|flip)\s*(\d+)\b/i);

  if (galaxyZMatch) {
    return `Samsung Galaxy Z ${titleCase(galaxyZMatch[1])} ${galaxyZMatch[2]}`;
  }

  const galaxyAMatch = value.match(/\b(?:samsung\s*)?(?:galaxy\s*)?a(\d{2})\s*(5g)?\b/i);

  if (galaxyAMatch) {
    return `Samsung Galaxy A${galaxyAMatch[1]}${galaxyAMatch[2] ? " 5G" : ""}`;
  }

  const pixelMatch = value.match(/\b(?:google\s*)?pixel\s*(\d{1,2})\s*(pro\s*xl|pro|xl|a|fold)?\b/i);

  if (pixelMatch) {
    const suffix = cleanText(pixelMatch[2]).replace(/\s+/g, " ");
    return `Google Pixel ${pixelMatch[1]}${suffix ? ` ${titleCase(suffix.toLowerCase())}` : ""}`;
  }

  return "";
}

function normalizeModelForCompare(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(apple|samsung|galaxy)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function matchesRequestedProduct(sourceListing, requestedProduct, exactMatch) {
  const requestedModel = detectPhoneModel(requestedProduct) || requestedProduct;
  const listingText = [
    sourceListing.product,
    sourceListing.title,
    sourceListing.name,
    sourceListing.rawText,
    sourceListing.description,
    sourceListing.text
  ]
    .filter(Boolean)
    .join(" ");
  const detectedListingModel = detectPhoneModel(listingText);

  if (!exactMatch) {
    return normalizeModelForCompare(listingText).includes(normalizeModelForCompare(requestedModel));
  }

  if (!detectedListingModel) {
    const requestedWasDetected = Boolean(detectPhoneModel(requestedProduct));
    return !requestedWasDetected && normalizeModelForCompare(listingText).includes(normalizeModelForCompare(requestedModel));
  }

  const normalizedDetectedModel = normalizeModelForCompare(detectedListingModel);
  const normalizedRequestedModel = normalizeModelForCompare(requestedModel);

  return (
    normalizedDetectedModel === normalizedRequestedModel ||
    normalizedDetectedModel.startsWith(normalizedRequestedModel) ||
    normalizedRequestedModel.startsWith(normalizedDetectedModel)
  );
}

function extractCityFromText(text) {
  const cityNames =
    "Toronto|Markham|Vaughan|Mississauga|Brampton|Richmond Hill|Scarborough|North York|Etobicoke|Oakville|Barrie|Hamilton|Ottawa|Kitchener|Waterloo|Calgary|Edmonton|Vancouver|Montreal|Dorval|Niagara Falls|New York|Los Angeles|Chicago|Houston|Dallas|Miami|Seattle|Boston";
  const normalizedText = cleanText(text).replace(new RegExp(`\\bin(?=(${cityNames})\\b)`, "gi"), "in ");
  const cityMatch = normalizedText.match(new RegExp(`\\b(${cityNames})\\b`, "i"));

  return cityMatch ? titleCase(cityMatch[1]) : "";
}

function isVerifiedSourceListing(sourceListing) {
  const badges = Array.isArray(sourceListing.badges) ? sourceListing.badges.join(" ") : cleanText(sourceListing.badges);
  const text = `${sourceListing.verified || ""} ${sourceListing.isVerified || ""} ${badges}`.toLowerCase();
  return sourceListing.verified === true || sourceListing.isVerified === true || text.includes("verified");
}

function normalizeSourceListing(sourceListing = {}) {
  const rawText = cleanText(sourceListing.rawText || sourceListing.text || sourceListing.description);
  const combinedText = [
    sourceListing.product,
    sourceListing.title,
    sourceListing.name,
    rawText
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...sourceListing,
    listingUrl: getSourceListingUrl(sourceListing),
    product: cleanText(sourceListing.product || sourceListing.title || sourceListing.name) || detectPhoneModel(combinedText),
    price: cleanNumber(sourceListing.price, 0) || extractPriceFromText(combinedText),
    city: cleanText(sourceListing.city || sourceListing.location) || extractCityFromText(combinedText),
    rawText
  };
}

function parseListingLine(line) {
  const rawText = cleanText(line);
  const parts = rawText.split(/\s+\|\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const url = extractFirstUrl(rawText);
  const nonUrlText = rawText.replace(url, " ");

  return normalizeSourceListing({
    rawText,
    listingUrl: url,
    title: detectPhoneModel(nonUrlText),
    price: extractPriceFromText(nonUrlText),
    city: extractCityFromText(nonUrlText)
  });
}

function getSourceListingUrl(sourceListing = {}) {
  const urlFields = [
    "listingUrl",
    "originalListingUrl",
    "url",
    "link",
    "href",
    "itemUrl",
    "item_url",
    "productUrl",
    "product_url",
    "product_link",
    "sourceUrl",
    "source_url",
    "canonicalUrl",
    "canonical_url",
    "webUrl",
    "web_url"
  ];

  for (const field of urlFields) {
    const url = cleanUrl(sourceListing[field]);
    if (url) return url;
  }

  return extractFirstUrl(sourceListing.rawText || sourceListing.description || sourceListing.text);
}

function parseSourceListings(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(normalizeSourceListing);
  }

  if (typeof value === "object") {
    return [normalizeSourceListing(value)];
  }

  const text = cleanText(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(normalizeSourceListing) : [normalizeSourceListing(parsed)];
  } catch {
    return text
      .split(/\n+/)
      .map(parseListingLine)
      .filter((listing) => listing.rawText || listing.listingUrl);
  }
}

function normalizeUsername(value) {
  return cleanText(value).toLowerCase();
}

function hashPassword(password, salt) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username
  };
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return "";
  }

  return token;
}

async function findUserByToken(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  return findUserBySessionToken(token);
}

async function findUserBySessionToken(token) {
  if (!token) return null;

  const users = await readUsers();
  return users.find((user) => user.sessionToken === token) || null;
}

async function requireSignedInUser(req, res) {
  const user = await findUserByToken(req);

  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }

  return user;
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function roundToFive(value) {
  return Math.max(5, Math.round(value / 5) * 5);
}

function estimateBasePrice(product) {
  const text = product.toLowerCase();

  if (text.includes("car") || text.includes("honda") || text.includes("toyota")) return 14500;
  if (text.includes("macbook") || text.includes("laptop")) return 1050;
  if (text.includes("iphone") || text.includes("phone") || text.includes("samsung")) return 720;
  if (text.includes("ps5") || text.includes("xbox") || text.includes("gaming")) return 420;
  if (text.includes("bike") || text.includes("bicycle")) return 380;
  if (text.includes("sofa") || text.includes("couch")) return 640;
  return 500;
}

function calculateTrustScore(profile) {
  const ratingScore = (profile.sellerRating / 5) * 38;
  const reviewScore = Math.min(profile.reviewCount / 100, 1) * 22;
  const salesScore = Math.min(profile.completedSales / 35, 1) * 18;
  const ageScore = Math.min(profile.accountAgeYears / 5, 1) * 14;
  const verifiedScore = profile.verified ? 8 : 0;
  return clampScore(ratingScore + reviewScore + salesScore + ageScore + verifiedScore);
}

function calculateValueScore(price, basePrice, condition) {
  const expectedConditionLift = {
    New: 1.16,
    "Like new": 1.04,
    Excellent: 0.96,
    Good: 0.82,
    Fair: 0.68
  };
  const expectedPrice = basePrice * (expectedConditionLift[condition] || 0.82);
  const ratio = price / expectedPrice;

  if (ratio <= 0.72) return 100;
  if (ratio <= 0.86) return 90;
  if (ratio <= 1) return 78;
  if (ratio <= 1.12) return 62;
  return 48;
}

function calculateDistanceScore(distanceKm, maxDistance, insideRange) {
  if (!insideRange) {
    return Math.max(24, 44 - (distanceKm - maxDistance) * 1.4);
  }

  const ratio = distanceKm / maxDistance;
  if (ratio <= 0.25) return 100;
  if (ratio <= 0.5) return 88;
  if (ratio <= 0.75) return 72;
  return 58;
}

function buildArea(area, location) {
  const trimmedLocation = location.trim();
  if (!trimmedLocation) return area;
  return `${area}, ${trimmedLocation}`;
}

function buildReason(score, insideRange, profile) {
  if (!insideRange) {
    return "Strong enough to compare, but ranked lower because pickup is outside the preferred range.";
  }

  if (score >= 86) {
    return "Best mix of fair price, strong condition, close pickup, and trusted seller signals.";
  }

  if (profile.priceFactor <= 0.72) {
    return "Low price for the condition, with trust checks keeping it in the acceptable range.";
  }

  if (profile.sellerRating >= 4.8 && profile.verified) {
    return "Trusted seller profile and practical distance make the higher price easier to justify.";
  }

  return "Good overall value after balancing price, condition, distance, and seller reputation.";
}

function getRiskFlags(profile, insideRange) {
  const flags = [];

  if (profile.reviewCount < 15) flags.push("few reviews");
  if (profile.completedSales < 5) flags.push("limited completed sales");
  if (!profile.verified) flags.push("not verified");
  if (!insideRange) flags.push("outside preferred range");
  if (profile.condition === "Fair") flags.push("inspect condition carefully");

  return flags;
}

function getOfferFactor(score) {
  if (score >= 86) return 0.93;
  if (score >= 75) return 0.88;
  if (score >= 62) return 0.82;
  return 0.74;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function findStorage(description) {
  const match = description.match(/\b(\d{2,4}\s?(?:gb|tb))\b/i);
  return match ? match[1].replace(/\s+/g, " ").toUpperCase() : "Not listed";
}

function findColour(description) {
  const colours = [
    "space black",
    "deep purple",
    "natural titanium",
    "black",
    "white",
    "silver",
    "gold",
    "blue",
    "green",
    "red",
    "purple"
  ];
  const found = colours.find((colour) => description.toLowerCase().includes(colour));
  return found ? titleCase(found) : "Not listed";
}

function findBattery(description) {
  const parsedBatteryHealth = getBatteryHealthFromText(description);

  if (parsedBatteryHealth) {
    return parsedBatteryHealth;
  }

  const batteryHealthMatch = description.match(/(?:battery health|battery|bh|b h)(?:\s+is)?\s*[:\-]?\s*(\d{2,3}%)/i);

  if (batteryHealthMatch) {
    return batteryHealthMatch[1];
  }

  const batteryLifeMatch = description.match(/battery life(?:\s+is)?\s*[:\-]?\s*([^.!?]+)/i);

  if (batteryLifeMatch) {
    return batteryLifeMatch[1].trim();
  }

  return "Battery health not provided";
}

function findDatePosted(description) {
  const postedMatch = cleanText(description).match(
    /\b(?:listed|posted)\s+(?:over\s+)?(?:a\s+)?(?:few\s+)?(?:\d+\s+)?(?:minute|hour|day|week|month|year)s?\s+ago\b/i
  );

  if (postedMatch) {
    return titleCase(postedMatch[0]);
  }

  const weekdayMatch = cleanText(description).match(/\b(?:listed|posted)\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  return weekdayMatch ? titleCase(weekdayMatch[0]) : "Not listed";
}

function findCarrier(description) {
  const lowerDescription = description.toLowerCase();
  const lockedMatch = description.match(/locked to ([A-Za-z0-9 +]+)/i);

  if (lowerDescription.includes("factory unlocked") || lowerDescription.includes("unlocked")) {
    return "Unlocked";
  }

  if (lockedMatch) {
    return `Locked to ${lockedMatch[1].trim()}`;
  }

  if (lowerDescription.includes("locked")) {
    return "Locked";
  }

  return "Not listed";
}

function findAccessories(description) {
  const lowerDescription = description.toLowerCase();

  if (lowerDescription.includes("phone only") || lowerDescription.includes("no box or charger")) {
    return "No accessories";
  }

  const accessories = [];
  if (lowerDescription.includes("box")) accessories.push("box");
  if (lowerDescription.includes("charger")) accessories.push("charger");
  if (lowerDescription.includes("cable")) accessories.push("cable");
  if (lowerDescription.includes("case")) accessories.push("case");
  if (lowerDescription.includes("receipt")) accessories.push("receipt");
  if (lowerDescription.includes("screen protector")) accessories.push("screen protector");

  return accessories.length ? accessories.map(titleCase).join(", ") : "Not listed";
}

function findWarranty(description) {
  const lowerDescription = description.toLowerCase();

  if (lowerDescription.includes("applecare+")) return "AppleCare+";
  if (lowerDescription.includes("applecare")) return "AppleCare";
  if (lowerDescription.includes("limited warranty")) return "Apple limited warranty";
  if (lowerDescription.includes("warranty remaining")) return "No warranty remaining";

  return "Not listed";
}

function findDamage(description) {
  const lowerDescription = description.toLowerCase();
  const issues = [];
  const cleanDamagePhrases =
    lowerDescription.includes("no damage") ||
    lowerDescription.includes("no scratches") ||
    lowerDescription.includes("no cracks") ||
    lowerDescription.includes("no issues");

  if (lowerDescription.includes("crack") && !lowerDescription.includes("no cracks")) issues.push("cracks mentioned");
  if (lowerDescription.includes("scratch") && !lowerDescription.includes("no scratches")) issues.push("scratches mentioned");
  if (lowerDescription.includes("dent")) issues.push("dent mentioned");
  if (lowerDescription.includes("sold as is")) issues.push("sold as is");
  if (lowerDescription.includes("tiny mark")) issues.push("tiny mark mentioned");

  if (issues.length) {
    return titleCase(issues.join(", "));
  }

  if (cleanDamagePhrases) {
    return "No damage mentioned";
  }

  return "Not listed";
}

function buildListingDetails(product, profile, listing) {
  const description = cleanText(profile.description, "No description provided");
  const batteryHealth = findBattery(description);
  const carrier = findCarrier(description);
  const accessories = findAccessories(description);
  const damageIssues = findDamage(description);
  const specs = {
    model: product,
    storage: findStorage(description),
    colour: findColour(description),
    batteryHealth,
    condition: profile.condition || "Not listed",
    carrier,
    accessories,
    warranty: findWarranty(description),
    damageIssues,
    datePosted: cleanText(profile.datePosted) || findDatePosted(description),
    source: cleanText(profile.source) || cleanText(listing.source),
    mainImage: cleanText(profile.mainImage || listing.mainImage)
  };
  const pros = [];
  const cons = [];

  if (listing.valueScore >= 78) pros.push("Good price for the condition");
  else cons.push("Price is high for the condition");

  if (listing.insideRange && listing.distanceKm <= listing.maxDistance * 0.5) pros.push("Nearby location");
  else if (!listing.insideRange || listing.distanceKm > listing.maxDistance * 0.75) cons.push("Far location");

  if (listing.trustScore >= 75) pros.push("Strong seller reviews");
  else cons.push("Low or limited seller reviews");

  if (/^\d{2,3}%$/.test(batteryHealth) && Number.parseInt(batteryHealth, 10) >= 85) {
    pros.push("Good battery health");
  } else if (batteryHealth === "Battery health not provided") {
    cons.push("Battery health not provided");
  }

  if (carrier === "Unlocked") pros.push("Unlocked phone");
  else if (carrier !== "Not listed") cons.push(carrier);
  else cons.push("Carrier status not listed");

  if (accessories !== "Not listed" && accessories !== "No accessories") pros.push("Includes box/accessories");
  else cons.push(accessories === "No accessories" ? "No accessories" : "Accessories not listed");

  if (damageIssues.includes("No damage")) pros.push("Clean condition");
  else if (damageIssues !== "Not listed") cons.push("Damage or issues mentioned");

  if (description.length < 80) cons.push("Description is too vague");

  if (!pros.length) {
    pros.push("Basic listing information is available");
  }

  if (!cons.length) {
    cons.push("No major cons found from listing details");
  }

  return {
    description,
    mainImage: specs.mainImage,
    datePosted: specs.datePosted,
    source: specs.source,
    specs,
    pros: pros.slice(0, 4),
    cons: cons.slice(0, 4)
  };
}

function getSerpApiKey() {
  const token = cleanApiKey(process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY);
  const keyMatch = token.match(/[A-Za-z0-9]{64}/);
  return keyMatch ? keyMatch[0] : token;
}

function getSerpApiLocation(location, region = null) {
  const resolvedRegion = region || getSerpApiRegion(location);
  const value = cleanText(location).replace(/\s+pin$/i, "").trim();

  if (!value || /^(current location|dropped pin)$/i.test(value)) {
    return resolvedRegion.fallbackLocation;
  }

  const lowerValue = value.toLowerCase();
  const knownLocations = [
    [/richmond hill/, "Richmond Hill, Ontario, Canada"],
    [/markham/, "Markham, Ontario, Canada"],
    [/vaughan/, "Vaughan, Ontario, Canada"],
    [/toronto/, "Toronto, Ontario, Canada"],
    [/north york/, "North York, Ontario, Canada"],
    [/scarborough/, "Scarborough, Ontario, Canada"],
    [/mississauga/, "Mississauga, Ontario, Canada"],
    [/brampton/, "Brampton, Ontario, Canada"],
    [/oakville/, "Oakville, Ontario, Canada"],
    [/barrie/, "Barrie, Ontario, Canada"],
    [/hamilton/, "Hamilton, Ontario, Canada"],
    [/ottawa/, "Ottawa, Ontario, Canada"],
    [/kitchener/, "Kitchener, Ontario, Canada"],
    [/waterloo/, "Waterloo, Ontario, Canada"],
    [/vancouver/, "Vancouver, British Columbia, Canada"],
    [/montreal|montréal/, "Montreal, Quebec, Canada"],
    [/dorval/, "Dorval, Quebec, Canada"],
    [/calgary/, "Calgary, Alberta, Canada"],
    [/edmonton/, "Edmonton, Alberta, Canada"]
  ];
  const knownMatch = knownLocations.find(([pattern]) => pattern.test(lowerValue));

  return knownMatch ? knownMatch[1] : resolvedRegion.fallbackLocation;
}

function getSerpApiQueryLocation(location) {
  const value = cleanText(location).replace(/\s+pin$/i, "").trim();

  if (!value || /^(current location|dropped pin)$/i.test(value)) {
    return "";
  }

  return value;
}

function getSerpApiRegion(location) {
  const value = cleanText(location).toLowerCase();
  const canadianLocation =
    !value ||
    /^(current location|dropped pin)$/.test(value) ||
    /\spin$/.test(value) ||
    /\b(toronto|markham|vaughan|mississauga|brampton|richmond hill|scarborough|north york|etobicoke|oakville|barrie|hamilton|ottawa|kitchener|waterloo|calgary|edmonton|vancouver|montreal|dorval|ontario|quebec|alberta|british columbia|canada|on|qc|ab|bc)\b/.test(value) ||
    /\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i.test(value);

  return canadianLocation
    ? { gl: "ca", googleDomain: "google.ca", fallbackLocation: "Canada", currencyHint: "CA$" }
    : { gl: "us", googleDomain: "google.com", fallbackLocation: "United States", currencyHint: "$" };
}

function getDisplayLocation(location, text, sourceName) {
  const locationMatch = cleanText(text).match(
    /\b([A-Z][A-Za-z .']{2,32}),\s*(ON|Ontario|QC|Quebec|AB|Alberta|BC|British Columbia|MB|Manitoba|SK|Saskatchewan|NS|Nova Scotia|NB|New Brunswick|NL|Newfoundland|PE|PEI|NY|CA|TX|FL|WA|IL|MA)\b/
  );

  if (locationMatch) {
    return `${cleanListingArea(locationMatch[1])}, ${locationMatch[2]}`;
  }

  return extractCityFromText(text) || cleanText(location) || cleanText(sourceName, "Location not listed");
}

function cleanListingArea(value) {
  return cleanText(value)
    .replace(/^.*\s-\s/, "")
    .replace(/^.*\.\s*/, "")
    .replace(/^(Cell Phones|Phones|Marketplace)\s+/i, "")
    .trim();
}

function getSourceName(url, fallback = "SerpApi result") {
  const fallbackText = cleanText(fallback, "SerpApi result");

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const lowerHost = host.toLowerCase();

    if (lowerHost.includes("facebook.com")) return "Facebook Marketplace";
    if (lowerHost.includes("ebay.")) return "eBay";
    if (lowerHost.includes("kijiji.")) return "Kijiji";
    if (lowerHost.includes("bestbuy.")) return "Best Buy";

    return titleCase(host.split(".")[0].replace(/-/g, " ")) || fallbackText;
  } catch {
    return fallbackText;
  }
}

function isAccessoryOnlyListing(text) {
  const lowerText = cleanText(text).toLowerCase();
  const accessoryWords = /\b(cases?|covers?|skins?|screen protectors?|protectors?|chargers?|charging cables?|usb-c cables?|lightning cables?|adapters?)\b/;
  const phoneSaleSignals = /\b(unlocked|locked|carrier|gb|tb|battery health|applecare|imei|factory|smartphone|phone only)\b/;

  return accessoryWords.test(lowerText) && !phoneSaleSignals.test(lowerText);
}

function isAccessoryTitle(text) {
  return /\b(cases?|covers?|skins?|screen protectors?|protectors?|chargers?|charging cables?|usb-c cables?|lightning cables?|adapters?)\b/i.test(cleanText(text));
}

function isFinancingOnlyListing(text) {
  return /\b(monthly[\s-]financing|monthly[\s-]tab|tab[\s-]payment|device[\s-]financing|with[\s-]plan|carrier[\s-]plan)\b/i.test(cleanText(text));
}

function inferCondition(text, fallback = "Not listed") {
  const lowerText = cleanText(text).toLowerCase();

  if (/\b(new|sealed|brand new)\b/.test(lowerText)) return "New";
  if (/\b(open box|open-box|like new|mint)\b/.test(lowerText)) return "Like new";
  if (/\b(excellent)\b/.test(lowerText)) return "Excellent";
  if (/\b(fair|cracked|as is|for parts)\b/.test(lowerText)) return "Fair";
  if (/\b(used|pre-owned|preowned|good)\b/.test(lowerText)) return "Good";

  return fallback;
}

function getSerpApiUrl(item = {}) {
  const urlFields = [
    "direct_link",
    "link",
    "product_link",
    "seller_link",
    "source_link",
    "merchant_link",
    "redirect_link",
    "url",
    "itemUrl",
    "item_url"
  ];

  for (const field of urlFields) {
    const url = cleanUrl(item[field]);
    if (url) return url;
  }

  const nestedCandidates = [
    item.seller?.link,
    item.seller?.url,
    item.merchant?.link,
    item.merchant?.url,
    item.source_info?.link,
    item.source_info?.url,
    item.offer?.link,
    item.offer?.url,
    Array.isArray(item.offers) ? item.offers[0]?.link || item.offers[0]?.url : "",
    Array.isArray(item.sellers) ? item.sellers[0]?.link || item.sellers[0]?.url : "",
    Array.isArray(item.online_sellers) ? item.online_sellers[0]?.link || item.online_sellers[0]?.url : "",
    Array.isArray(item.sellers_results?.online_sellers)
      ? item.sellers_results.online_sellers[0]?.link || item.sellers_results.online_sellers[0]?.url
      : ""
  ];

  for (const candidate of nestedCandidates) {
    const url = cleanUrl(candidate);
    if (url) return url;
  }

  return "";
}

function getMainImage(item = {}) {
  const imageCandidates = [
    item.thumbnail,
    item.serpapi_thumbnail,
    item.image,
    item.image_url,
    item.rich_snippet?.top?.thumbnail,
    item.rich_snippet?.bottom?.thumbnail,
    Array.isArray(item.thumbnails) ? item.thumbnails[0] : "",
    Array.isArray(item.images) ? item.images[0] : ""
  ];

  for (const candidate of imageCandidates) {
    const imageUrl = cleanText(candidate);
    if (/^https?:\/\//i.test(imageUrl)) {
      return imageUrl;
    }
  }

  return "";
}

function getItemText(item = {}) {
  const richExtensions = item.rich_snippet?.bottom?.extensions;

  return [
    item.title,
    item.name,
    item.snippet,
    item.description,
    item.extracted_description,
    item.product_description,
    item.shipping,
    item.price,
    item.second_hand_condition,
    item.source,
    Array.isArray(item.extensions) ? item.extensions.join(" ") : "",
    Array.isArray(richExtensions) ? richExtensions.join(" ") : "",
    Array.isArray(item.badges) ? item.badges.join(" ") : item.badge
  ]
    .filter(Boolean)
    .join(" ");
}

function getItemPrice(item = {}, product = "") {
  const itemText = getItemText(item);
  const nearProductPrice = extractPriceNearProduct(itemText, product);
  const isFacebookResult = getSerpApiUrl(item).includes("facebook.com/marketplace/item/");

  if (isFacebookResult && nearProductPrice) {
    return nearProductPrice;
  }

  return (
    cleanNumber(item.extracted_price, 0) ||
    cleanPriceField(item.price) ||
    cleanNumber(item.rich_snippet?.bottom?.detected_extensions?.price, 0) ||
    nearProductPrice ||
    extractPriceFromText(itemText)
  );
}

function cleanPriceField(value) {
  if (typeof value === "number") {
    return cleanNumber(value, 0);
  }

  const text = cleanText(value);

  if (!text) {
    return 0;
  }

  if (/^[A-Z]{1,3}\$/i.test(text) && !/^(CA|US)\$/i.test(text)) {
    return 0;
  }

  return cleanNumber(text, 0);
}

function getItemDatePosted(item = {}) {
  return cleanText(item.date || item.displayed_date || item.posted_date) || findDatePosted(getItemText(item));
}

function getItemRating(item = {}) {
  return (
    cleanNumber(item.rating, 0) ||
    cleanNumber(item.seller_rating, 0) ||
    cleanNumber(item.rich_snippet?.bottom?.detected_extensions?.rating, 0)
  );
}

function getItemReviews(item = {}) {
  return (
    cleanNumber(item.reviews, 0) ||
    cleanNumber(item.seller_reviews, 0) ||
    cleanNumber(item.rich_snippet?.bottom?.detected_extensions?.reviews, 0)
  );
}

function getListingDescriptionFromItem(item = {}) {
  const description =
    cleanText(item.description) ||
    cleanText(item.snippet) ||
    cleanText(item.extracted_description) ||
    cleanText(item.product_description) ||
    cleanText(item.title);

  return description || "No description provided by the source.";
}

function isVerifiedSerpApiListing(item = {}, url = "") {
  const source = `${item.source || ""} ${getSourceName(url)}`.toLowerCase();
  const text = getItemText(item).toLowerCase();

  if (text.includes("verified") || text.includes("top rated") || text.includes("trusted store")) {
    return true;
  }

  return source.includes("best buy") || source.includes("apple") || source.includes("samsung");
}

function calculateSerpTrustScore(item = {}, url = "") {
  const rating = getItemRating(item);
  const reviews = getItemReviews(item);
  const verified = isVerifiedSerpApiListing(item, url);
  const directLinkScore = url ? 25 : 0;
  const ratingScore = rating > 0 ? (Math.min(rating, 5) / 5) * 32 : 10;
  const reviewScore = Math.min(reviews / 100, 1) * 25;
  const verifiedScore = verified ? 18 : 0;

  return clampScore(directLinkScore + ratingScore + reviewScore + verifiedScore);
}

function getSerpApiRiskFlags(item, url, listing) {
  const flags = [];
  const text = getItemText(item).toLowerCase();

  if (!url) flags.push("missing direct listing link");
  if (!listing.price) flags.push("price not listed");
  if (!getItemRating(item)) flags.push("seller rating not listed");
  if (listing.details?.specs?.batteryHealth === "Battery health not provided") flags.push("battery health not provided");
  if (/crack|scratch|dent|for parts|as is/.test(text)) flags.push("inspect condition carefully");

  return flags;
}

function buildSerpApiReason(listing, exactMatch) {
  if (!listing.listingUrl) {
    return "SerpApi found the item, but no direct product page was included.";
  }

  const sourceLabel = listing.source ? `${listing.source} result` : "SerpApi result";

  if (exactMatch) {
    return `Exact model match from ${sourceLabel} with a direct listing page${listing.price ? " and price available" : ""}.`;
  }

  return `Relevant ${sourceLabel} with a direct listing page${listing.price ? " and price available" : ""}.`;
}

function getSerpApiDebugParams(params = {}) {
  return {
    engine: cleanText(params.engine),
    q: cleanText(params.q),
    location: cleanText(params.location),
    googleDomain: cleanText(params.google_domain),
    gl: cleanText(params.gl),
    hl: cleanText(params.hl),
    num: cleanText(params.num),
    device: cleanText(params.device),
    forcedFresh: params.no_cache === "true"
  };
}

function createSearchDebug(product, location, searches = [], mode = "primary") {
  return {
    mode,
    requestId: "",
    product: cleanText(product),
    location: cleanText(location),
    serpApiQueries: searches.map((search) => ({
      label: search.label,
      resultKey: search.resultKey,
      ...getSerpApiDebugParams(search.params)
    })),
    apiResponses: [],
    rawResultsReturned: 0,
    filteredOutCount: 0,
    filterReasons: [],
    finalListingsShown: 0,
    filterMode: "loose emergency phone-results mode",
    fallbackUsed: mode === "fallback"
  };
}

function mergeSearchDebug(...debugs) {
  const validDebugs = debugs.filter(Boolean);
  const baseDebug = validDebugs[0] || createSearchDebug("", "", []);

  return {
    ...baseDebug,
    mode: validDebugs.some((debug) => debug.mode === "fallback") ? "primary + fallback" : baseDebug.mode,
    serpApiQueries: validDebugs.flatMap((debug) => debug.serpApiQueries || []),
    apiResponses: validDebugs.flatMap((debug) => debug.apiResponses || []),
    rawResultsReturned: validDebugs.reduce((total, debug) => total + cleanNumber(debug.rawResultsReturned), 0),
    filteredOutCount: validDebugs.reduce((total, debug) => total + cleanNumber(debug.filteredOutCount), 0),
    filterReasons: validDebugs.flatMap((debug) => debug.filterReasons || []),
    finalListingsShown: validDebugs.reduce((total, debug) => Math.max(total, cleanNumber(debug.finalListingsShown)), 0),
    fallbackUsed: validDebugs.some((debug) => debug.fallbackUsed)
  };
}

function isLikelyRequestedPhoneListing(text, requestedProduct) {
  const normalizedText = cleanText(text).toLowerCase();
  const normalizedProduct = cleanText(requestedProduct).toLowerCase();

  if (!normalizedText || !normalizedProduct) {
    return false;
  }

  if (detectPhoneModel(normalizedText)) {
    return true;
  }

  const productTerms = normalizedProduct
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .filter((term) => !["phone", "for", "sale", "near", "used", "marketplace"].includes(term));

  const matchingTerms = productTerms.filter((term) => normalizedText.includes(term));
  const hasPhoneSignal = /\b(iphone|samsung|galaxy|pixel|smartphone|cell phone|mobile phone)\b/i.test(normalizedText);

  return hasPhoneSignal && matchingTerms.length >= Math.min(2, productTerms.length || 2);
}

async function fetchSerpApi(params, label) {
  const apiKey = getSerpApiKey();

  if (!apiKey) {
    throw createLiveSearchError("API key missing", {
      provider: "SerpApi",
      label,
      expectedEnv: "SERPAPI_API_KEY or SERP_API_KEY"
    });
  }

  const url = new URL(SERPAPI_ENDPOINT);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  url.searchParams.set("api_key", apiKey);

  let response;
  let data;

  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" }
    });
    data = await response.json().catch(() => null);
  } catch (error) {
    throw createLiveSearchError("API request failed", {
      provider: "SerpApi",
      label,
      message: error.message,
      params
    });
  }

  if (data?.error && isNoSerpApiResultsMessage(data.error)) {
    return {
      ...data,
      organic_results: [],
      shopping_results: [],
      local_results: [],
      places_results: [],
      _emptyResult: true,
      _serpApiStatus: response?.status || 200,
      _serpApiOk: true
    };
  }

  if (!response.ok || !data) {
    throw createLiveSearchError(response?.status === 429 ? "Rate limit" : "API request failed", {
      provider: "SerpApi",
      label,
      status: response?.status,
      statusText: response?.statusText,
      params
    });
  }

  if (data.error) {
    throw createLiveSearchError(isRateLimitMessage(data.error) ? "Rate limit" : "API request failed", {
      provider: "SerpApi",
      label,
      message: data.error,
      params
    });
  }

  return {
    ...data,
    _serpApiStatus: response.status,
    _serpApiOk: response.ok
  };
}

async function fetchSerpApiWithRetry(params, label, retries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const retryWithoutForcedFresh =
      attempt > 0 && params.no_cache && getLiveSearchFailureReason(lastError, "API request failed") === "Rate limit";
    const attemptParams = retryWithoutForcedFresh
      ? Object.fromEntries(Object.entries(params).filter(([key]) => key !== "no_cache"))
      : params;

    try {
      return await fetchSerpApi(attemptParams, attempt === 0 ? label : `${label} retry`);
    } catch (error) {
      lastError = error;

      if (attempt >= retries || error?.liveSearchReason === "API key missing") {
        throw error;
      }

      logLiveSearchFailure("Retrying SerpApi request", {
        provider: "SerpApi",
        label,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        reason: getLiveSearchFailureReason(error, "API request failed"),
        mode: params.no_cache && getLiveSearchFailureReason(error, "API request failed") === "Rate limit"
          ? "retry without forced fresh cache bypass"
          : "retry same live request",
        params: attemptParams
      });
      await delay(850);
    }
  }

  throw lastError || createLiveSearchError("API request failed", { provider: "SerpApi", label, params });
}

function getMarketplaceSearchQuery(product, location) {
  const locationPart = cleanText(location);
  const baseQuery = [product, locationPart].filter(Boolean).join(" ");
  const sourceSites = [
    "site:facebook.com/marketplace/item",
    "site:kijiji.ca/v-",
    "site:ebay.ca/itm",
    "site:ebay.com/itm",
    "site:bestbuy.ca/en-ca/product",
    "site:bestbuy.com/site"
  ].join(" OR ");

  return `${baseQuery} (${sourceSites})`;
}

function getFallbackDealSearchQueries(product, location) {
  const productPart = cleanText(product);
  const locationPart = cleanText(location);
  const nearPart = locationPart || "near me";
  const queries = [
    `${productPart} for sale near ${nearPart}`,
    `${productPart} marketplace ${nearPart}`,
    `${productPart} Kijiji ${nearPart}`,
    `${productPart} used phone ${nearPart}`
  ];

  return [...new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function getMarketplaceSearchTerms(product, location) {
  return [cleanText(product), getSerpApiQueryLocation(location) || cleanText(location)]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function addPriceSearchParams(params, minPrice, maxPrice) {
  if (minPrice) params.set("minPrice", String(minPrice));
  if (maxPrice) params.set("maxPrice", String(maxPrice));
}

function slugifyKijijiSearch(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "phone";
}

function getKijijiLocationPath(location) {
  const value = cleanText(location).toLowerCase();

  if (/markham|richmond hill|vaughan|york/.test(value)) return { slug: "markham-york-region", id: "1700274" };
  if (/toronto|north york|scarborough|etobicoke/.test(value)) return { slug: "city-of-toronto", id: "1700273" };
  if (/mississauga|brampton|peel/.test(value)) return { slug: "mississauga-peel-region", id: "1700276" };
  if (/hamilton/.test(value)) return { slug: "hamilton", id: "80014" };
  if (/ottawa/.test(value)) return { slug: "ottawa", id: "1700185" };
  if (/vancouver/.test(value)) return { slug: "greater-vancouver-area", id: "80003" };
  if (/calgary/.test(value)) return { slug: "calgary", id: "1700199" };
  if (/montreal|montréal/.test(value)) return { slug: "ville-de-montreal", id: "1700281" };

  return { slug: "ontario", id: "9004" };
}

function buildMarketplaceSearchLinks(product, location, options = {}) {
  const query = getMarketplaceSearchTerms(product, location) || cleanText(product);
  const minPrice = cleanNumber(options.minPrice);
  const maxPrice = cleanNumber(options.maxPrice);
  const kijijiLocation = getKijijiLocationPath(location);
  const facebookUrl = new URL("https://www.facebook.com/marketplace/search/");
  const kijijiUrl = new URL(
    `https://www.kijiji.ca/b-cell-phone/${kijijiLocation.slug}/${slugifyKijijiSearch(product)}/k0c760l${kijijiLocation.id}`
  );
  const googleShoppingUrl = new URL("https://www.google.ca/search");
  const bestBuyUrl = new URL("https://www.bestbuy.ca/en-ca/search");

  facebookUrl.searchParams.set("query", query);
  addPriceSearchParams(facebookUrl.searchParams, minPrice, maxPrice);

  addPriceSearchParams(kijijiUrl.searchParams, minPrice, maxPrice);

  googleShoppingUrl.searchParams.set("tbm", "shop");
  googleShoppingUrl.searchParams.set("q", query);

  bestBuyUrl.searchParams.set("search", query);

  return [
    {
      id: "facebook-marketplace",
      source: "Facebook Marketplace",
      label: "Open Facebook Marketplace Search",
      url: facebookUrl.toString(),
      note: "Facebook may ask you to sign in before showing local listings."
    },
    {
      id: "kijiji",
      source: "Kijiji",
      label: "Open Kijiji Search",
      url: kijijiUrl.toString(),
      note: "Check seller location and pickup details on each listing."
    },
    {
      id: "google-shopping",
      source: "Google Shopping",
      label: "Open Google Shopping",
      url: googleShoppingUrl.toString(),
      note: "Useful for comparing store prices and refurbished listings."
    },
    {
      id: "best-buy",
      source: "Best Buy",
      label: "Open Best Buy",
      url: bestBuyUrl.toString(),
      note: "Compare open-box, refurbished, and carrier pricing."
    }
  ];
}

function buildDealSearchGuide(product, options = {}) {
  const productText = cleanText(product);
  const basePrice = estimateBasePrice(productText);
  const minPrice = cleanNumber(options.minPrice) || roundToFive(basePrice * 0.58);
  const maxPrice = cleanNumber(options.maxPrice) || roundToFive(basePrice * 1.08);
  const isIphone = /\biphone\b/i.test(productText);

  return {
    title: `${cleanText(product, "Phone")} buyer checklist`,
    bestPriceRange: `${formatAiMoney(minPrice)} - ${formatAiMoney(maxPrice)} CAD`,
    batteryHealthTarget: isIphone
      ? "Aim for 85%+ battery health; 90%+ is strong for a used iPhone."
      : "Aim for strong battery health or battery-condition proof; avoid listings that cannot show battery status.",
    whatToLookFor: [
      "Unlocked phone or carrier compatibility clearly stated",
      "Real photos of the exact device, not stock images",
      "Storage size, colour, battery health, and condition in the description",
      "Pickup location that matches the city you searched"
    ],
    scamWarningSigns: [
      "Price far below market with urgent pressure to pay a deposit",
      "Seller refuses in-person inspection or live proof the phone turns on",
      "iCloud, Google, Samsung, or financing lock is unclear",
      "IMEI, serial number, or receipt details are avoided"
    ],
    descriptionChecks: [
      "Battery health percentage",
      "Unlocked/carrier status",
      "Cracks, scratches, repairs, or replaced parts",
      "Box, cable, receipt, warranty, and AppleCare/Samsung Care details"
    ]
  };
}

function buildRankListingsMeta(payload) {
  return {
    marketplaceSearchLinks: buildMarketplaceSearchLinks(payload.product, payload.location, payload),
    searchGuide: buildDealSearchGuide(payload.product, payload)
  };
}

function buildRankListingsFallbackResponse(payload, error = null) {
  const fallbackDebug =
    error?.searchDebug ||
    {
      requestId: payload.requestId,
      product: payload.product,
      location: payload.location,
      serpApiQueries: [],
      apiResponses: [
        {
          label: error?.liveSearchDetails?.label || "SerpApi",
          status: error?.liveSearchDetails?.status || "failed",
          error: getLiveSearchFailureReason(error, "API request failed")
        }
      ],
      rawResultsReturned: 0,
      filteredOutCount: 0,
      filterReasons: [],
      finalListingsShown: 0,
      filterMode: "loose emergency phone-results mode"
    };

  return {
    ...buildRankListingsMeta(payload),
    requestId: payload.requestId,
    totalListingsAnalyzed: 0,
    rawResultsAnalyzed: cleanNumber(fallbackDebug.rawResultsReturned),
    maxDistance: payload.maxDistance,
    listings: [],
    topDeals: getTopDeals([]),
    sourceStatuses: [],
    searchDebug: fallbackDebug,
    liveRankingLimited: true,
    rankingMessage: "Live ranking is temporarily limited, but you can still open real marketplace searches below."
  };
}

function decodeHtmlEntities(value) {
  return cleanText(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
      const number = code.toLowerCase().startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : "";
    });
}

function stripHtml(value) {
  return decodeHtmlEntities(cleanText(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAgentText(url, label, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-CA,en;q=0.9",
        "user-agent": AGENT_SEARCH_USER_AGENT
      },
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
      label,
      url
    };
  } catch (error) {
    return {
      ok: false,
      status: error.name === "AbortError" ? "timeout" : "failed",
      statusText: error.message,
      text: "",
      label,
      url
    };
  } finally {
    clearTimeout(timer);
  }
}

function getMetaContent(html, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedProperty}["'][^>]*>`, "i");
  const match = html.match(pattern) || html.match(reversePattern);
  return match ? decodeHtmlEntities(match[1]) : "";
}

function getJsonLdObjects(html) {
  const objects = [];

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(match[1]));
      if (Array.isArray(parsed)) objects.push(...parsed);
      else if (parsed && typeof parsed === "object") objects.push(parsed);
    } catch {
      // Structured data is optional. Broken JSON-LD should not fail the agent search.
    }
  }

  return objects;
}

function getPriceFromStructuredData(objects = []) {
  const queue = [...objects];

  while (queue.length) {
    const item = queue.shift();

    if (!item || typeof item !== "object") continue;

    const price =
      cleanNumber(item.price) ||
      cleanNumber(item.lowPrice) ||
      cleanNumber(item.highPrice) ||
      cleanNumber(item.offers?.price) ||
      cleanNumber(item.offers?.lowPrice) ||
      cleanNumber(item.offers?.highPrice);

    if (price) return price;

    Object.values(item).forEach((value) => {
      if (Array.isArray(value)) queue.push(...value);
      else if (value && typeof value === "object") queue.push(value);
    });
  }

  return 0;
}

function getImageFromStructuredData(objects = []) {
  const queue = [...objects];

  while (queue.length) {
    const item = queue.shift();

    if (!item || typeof item !== "object") continue;

    const image = Array.isArray(item.image) ? item.image[0] : item.image;
    if (/^https?:\/\//i.test(cleanText(image))) return cleanText(image);

    Object.values(item).forEach((value) => {
      if (Array.isArray(value)) queue.push(...value);
      else if (value && typeof value === "object") queue.push(value);
    });
  }

  return "";
}

function getKijijiPrice(price) {
  if (!price) return 0;
  if (typeof price === "number") return price > 10000 ? Math.round(price / 100) : price;

  if (typeof price === "object") {
    const amount = cleanNumber(price.amount) || cleanNumber(price.originalAmount);
    return amount > 10000 ? Math.round(amount / 100) : amount;
  }

  return cleanPriceField(price);
}

function collectKijijiListingsFromNextData(html) {
  const match = html.match(/<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i);
  if (!match) return [];

  let parsed;

  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const listings = [];
  const seenObjects = new WeakSet();

  function walk(node) {
    if (!node || listings.length >= 35) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== "object" || seenObjects.has(node)) return;
    seenObjects.add(node);

    const type = cleanText(node.__typename);
    const title = cleanText(node.title || node.name);
    const url = cleanUrl(node.url);

    if (title && url && /listing/i.test(type)) {
      listings.push({
        source: "Kijiji",
        title,
        price: getKijijiPrice(node.price),
        location: cleanText(node.location?.name || node.location?.address),
        listingUrl: url,
        description: stripHtml(node.description || node.subtitle || ""),
        mainImage: Array.isArray(node.imageUrls) ? cleanText(node.imageUrls[0]) : cleanText(node.imageUrl),
        sellerRating: cleanNumber(node.posterInfo?.rating),
        sellerVerified: node.posterInfo?.verified === true,
        sellerNotes: node.posterInfo?.verified ? "Kijiji seller profile has a verified signal." : "",
        rawText: [title, node.description, node.location?.name, node.location?.address].filter(Boolean).join(" ")
      });
    }

    Object.values(node).forEach(walk);
  }

  walk(parsed);
  return listings;
}

function isAgentListingUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();

    return (
      (host.includes("kijiji.") && path.includes("/v-")) ||
      (host.includes("ebay.") && path.includes("/itm/")) ||
      (host.includes("bestbuy.") && (path.includes("/product") || path.includes("/site"))) ||
      (host.includes("facebook.com") && path.includes("/marketplace/item/")) ||
      host.includes("swappa.com") ||
      host.includes("backmarket.")
    );
  } catch {
    return false;
  }
}

function resolveSearchResultUrl(value) {
  const decoded = decodeHtmlEntities(value);

  try {
    const url = new URL(decoded, "https://duckduckgo.com");

    if (url.hostname.includes("duckduckgo.com") && url.searchParams.get("uddg")) {
      return cleanUrl(url.searchParams.get("uddg"));
    }

    if (url.hostname.includes("bing.com") && url.pathname.includes("/ck/a") && url.searchParams.get("u")) {
      return cleanUrl(Buffer.from(url.searchParams.get("u").replace(/^a1/, ""), "base64").toString("utf8"));
    }

    return cleanUrl(url.toString());
  } catch {
    return cleanUrl(decoded);
  }
}

function collectSearchResultListings(html, sourceLabel) {
  const listings = [];
  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    if (listings.length >= 24) break;

    const listingUrl = resolveSearchResultUrl(match[1]);
    if (!listingUrl || !isAgentListingUrl(listingUrl)) continue;

    const title = stripHtml(match[2]);
    if (!title || /^(cached|similar|translate|feedback)$/i.test(title)) continue;

    const surroundingText = stripHtml(html.slice(Math.max(0, match.index - 220), Math.min(html.length, match.index + 900)));

    listings.push({
      source: getSourceName(listingUrl, sourceLabel),
      title,
      price: extractPriceNearProduct(`${title} ${surroundingText}`, title),
      location: extractCityFromText(surroundingText),
      listingUrl,
      description: surroundingText.slice(0, 360),
      mainImage: "",
      sellerNotes: "",
      rawText: `${title} ${surroundingText}`
    });
  }

  return listings;
}

function isLoginRequiredSource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("facebook.com");
  } catch {
    return false;
  }
}

async function enrichAgentListing(candidate) {
  if (!candidate?.listingUrl || isLoginRequiredSource(candidate.listingUrl)) {
    return {
      ...candidate,
      accessNote: isLoginRequiredSource(candidate.listingUrl) ? "Login required. Open this source manually." : ""
    };
  }

  const response = await fetchAgentText(candidate.listingUrl, candidate.source || "Listing detail", 6500);

  if (!response.ok || !response.text) {
    return {
      ...candidate,
      accessNote: response.status === 403 ? "Login required. Open this source manually." : cleanText(response.statusText)
    };
  }

  const structuredData = getJsonLdObjects(response.text);
  const title = getMetaContent(response.text, "og:title") || getMetaContent(response.text, "twitter:title") || candidate.title;
  const description =
    getMetaContent(response.text, "og:description") ||
    getMetaContent(response.text, "description") ||
    candidate.description;
  const image =
    getMetaContent(response.text, "og:image") ||
    getMetaContent(response.text, "twitter:image") ||
    getImageFromStructuredData(structuredData) ||
    candidate.mainImage;
  const price = candidate.price || getPriceFromStructuredData(structuredData) || extractPriceNearProduct(`${title} ${description}`, title);

  return {
    ...candidate,
    title: stripHtml(title) || candidate.title,
    description: stripHtml(description) || candidate.description,
    mainImage: cleanText(image),
    price,
    rawText: [candidate.rawText, title, description].filter(Boolean).join(" ")
  };
}

function getAgentRiskFlags(candidate, listing) {
  const text = `${candidate.rawText || ""} ${candidate.description || ""} ${candidate.title || ""}`.toLowerCase();
  const flags = [];

  if (!listing.price) flags.push("price not listed");
  if (!listing.details?.specs?.batteryHealth || listing.details.specs.batteryHealth === "Battery health not provided") {
    flags.push("battery health not provided");
  }
  if (/icloud locked|google locked|samsung locked|blacklisted|financing|finance owing|as is|for parts/.test(text)) {
    flags.push("high-risk listing wording");
  }
  if (/deposit|etransfer|e-transfer|ship only|urgent/.test(text)) {
    flags.push("payment pressure warning");
  }
  if (cleanText(candidate.description).length < 70) flags.push("description is limited");
  if (candidate.accessNote) flags.push(candidate.accessNote);

  return flags;
}

function isCatalogPhoneListing(text) {
  const value = cleanText(text).toLowerCase();
  const modelMentions = value.match(/\b(?:iphone\s*(?:1[1-7]|[6-9])|samsung\s+galaxy\s+s(?:1[0-9]|2[0-5])|galaxy\s+s(?:1[0-9]|2[0-5])|s(?:1[0-9]|2[0-5])\s*(?:ultra|plus|fe)?)\b/g) || [];
  const uniqueMentions = new Set(modelMentions.map((model) => normalizeModelForCompare(model)));

  return (
    uniqueMentions.size >= 3 ||
    /\b(best place to buy|we sell|we buy|many models|all models|available models|pre-owned phones|phone store)\b/i.test(value)
  );
}

function getRequestedModelMatchInfo(candidate, context) {
  const requestedModel = detectPhoneModel(context.product) || context.product;
  const titleModel = detectPhoneModel(candidate.title);
  const normalizedRequested = normalizeModelForCompare(requestedModel);
  const normalizedTitle = normalizeModelForCompare(titleModel);

  return {
    requestedModel,
    titleModel,
    exactTitleMatch: Boolean(normalizedRequested && normalizedTitle && normalizedRequested === normalizedTitle),
    titleDifferentModel: Boolean(normalizedRequested && normalizedTitle && normalizedRequested !== normalizedTitle)
  };
}

function titleMatchesRequestedPhone(title, requestedProduct) {
  const requestedModel = detectPhoneModel(requestedProduct) || requestedProduct;
  const titleModel = detectPhoneModel(title);
  const normalizedRequested = normalizeModelForCompare(requestedModel);
  const normalizedTitle = normalizeModelForCompare(titleModel || title);

  if (!normalizedRequested || !normalizedTitle) {
    return false;
  }

  return (
    normalizedTitle === normalizedRequested ||
    normalizedTitle.startsWith(normalizedRequested) ||
    normalizedRequested.startsWith(normalizedTitle)
  );
}

function calculateAgentListingScore(candidate, context, condition, trustScore) {
  const descriptionLength = cleanText(candidate.description).length;
  const rawText = `${candidate.rawText || ""} ${candidate.description || ""} ${candidate.title || ""}`;
  const batteryHealth = getBatteryHealthFromText(`${candidate.rawText || ""} ${candidate.description || ""}`);
  const batteryNumber = cleanNumber(batteryHealth);
  const storageMatch = findStorage(`${candidate.rawText || ""} ${candidate.description || ""}`);
  const price = cleanNumber(candidate.price);
  const valueScore = price ? calculateValueScore(price, context.basePrice, condition) : 38;
  const conditionScore = conditionScores[condition] || 66;
  const batteryScore = batteryNumber ? Math.min(100, Math.max(42, batteryNumber)) : 58;
  const storageScore = storageMatch.includes("TB") ? 92 : /\b(256|512)\s?GB\b/i.test(storageMatch) ? 82 : storageMatch !== "Not listed" ? 70 : 55;
  const descriptionScore = descriptionLength > 220 ? 88 : descriptionLength > 110 ? 72 : 54;
  const locationScore = cleanText(candidate.location).toLowerCase().includes(cleanText(context.location).toLowerCase()) ? 88 : 68;
  const riskPenalty = /locked|blacklisted|deposit|for parts|as is/i.test(rawText) ? 16 : 0;
  const missingPricePenalty = price ? 0 : 20;
  const matchInfo = getRequestedModelMatchInfo(candidate, context);
  const exactTitleBoost = matchInfo.exactTitleMatch ? 12 : 0;
  const titleMismatchPenalty = matchInfo.titleDifferentModel ? 18 : 0;
  const catalogPenalty = isCatalogPhoneListing(rawText) ? 24 : 0;

  return clampScore(
    valueScore * 0.28 +
      conditionScore * 0.18 +
      batteryScore * 0.16 +
      storageScore * 0.1 +
      locationScore * 0.1 +
      descriptionScore * 0.1 +
      trustScore * 0.08 -
      riskPenalty +
      exactTitleBoost -
      titleMismatchPenalty -
      catalogPenalty -
      missingPricePenalty
  );
}

function normalizeAgentListing(candidate, index, context) {
  const rawText = [candidate.title, candidate.description, candidate.rawText, candidate.location, candidate.source].filter(Boolean).join(" ");
  const sourceListing = {
    product: candidate.title,
    title: candidate.title,
    rawText,
    description: candidate.description,
    listingUrl: candidate.listingUrl,
    price: candidate.price
  };

  if (!candidate.listingUrl || !isAgentListingUrl(candidate.listingUrl)) return null;
  if (isAccessoryTitle(candidate.title) || isAccessoryOnlyListing(rawText) || isFinancingOnlyListing(rawText)) return null;
  if (!titleMatchesRequestedPhone(candidate.title, context.product)) return null;
  if (!matchesRequestedProduct(sourceListing, context.product, false) && !isLikelyRequestedPhoneListing(rawText, context.product)) return null;

  const matchInfo = getRequestedModelMatchInfo(candidate, context);
  const condition = inferCondition(rawText, cleanText(candidate.condition, "Not listed"));
  const trustScore = clampScore(
    30 +
      (candidate.sellerVerified ? 18 : 0) +
      Math.min(cleanNumber(candidate.sellerRating) * 8, 32) +
      (candidate.mainImage ? 8 : 0) +
      (cleanText(candidate.description).length > 120 ? 12 : 0)
  );
  const score = calculateAgentListingScore(candidate, context, condition, trustScore);
  const price = cleanNumber(candidate.price);
  const area = cleanText(candidate.location) || getDisplayLocation(context.location, rawText, candidate.source);
  const listing = {
    id: `agent-${createHash("sha1").update(candidate.listingUrl).digest("hex").slice(0, 12)}`,
    product: matchInfo.exactTitleMatch ? matchInfo.requestedModel : detectPhoneModel(rawText) || cleanText(candidate.title, context.product),
    price,
    condition,
    description: cleanText(candidate.description, "No description provided by the source."),
    area,
    listingUrl: candidate.listingUrl,
    distanceKm: 0,
    insideRange: true,
    maxDistance: context.maxDistance,
    score,
    trustScore,
    valueScore: price ? calculateValueScore(price, context.basePrice, condition) : 54,
    offerPrice: price ? roundToFive(price * getOfferFactor(score)) : 0,
    reason: `${candidate.source || "Web"} listing found by Agent Search with a direct listing URL${price ? " and price available" : ""}.`,
    riskFlags: [],
    source: candidate.source || getSourceName(candidate.listingUrl, "Web"),
    datePosted: cleanText(candidate.datePosted) || findDatePosted(rawText),
    mainImage: cleanText(candidate.mainImage),
    map: {
      x: 24 + ((index * 17) % 56),
      y: 26 + ((index * 19) % 50)
    },
    seller: {
      rating: cleanNumber(candidate.sellerRating),
      reviews: cleanNumber(candidate.sellerReviews),
      completedSales: 0,
      accountAgeYears: 0,
      verified: candidate.sellerVerified === true,
      sentiment: cleanText(candidate.sellerNotes || candidate.accessNote || "Agent Search collected this listing from a reachable marketplace result.")
    }
  };

  listing.details = buildListingDetails(
    listing.product,
    {
      condition,
      description: `${listing.description} ${rawText}`,
      datePosted: listing.datePosted,
      mainImage: listing.mainImage,
      source: listing.source
    },
    listing
  );
  listing.riskFlags = getAgentRiskFlags(candidate, listing);

  return listing;
}

function dedupeAgentCandidates(candidates = []) {
  const seen = new Set();

  return candidates.filter((candidate) => {
    const url = cleanUrl(candidate.listingUrl);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    candidate.listingUrl = url;
    return true;
  });
}

async function searchWebForAgentListings(product, location) {
  const query = getMarketplaceSearchTerms(product, location) || cleanText(product);
  const sourceQuery = `(site:kijiji.ca/v- OR site:ebay.ca/itm OR site:bestbuy.ca/en-ca/product OR site:facebook.com/marketplace/item) ${query}`;
  const searchUrls = [
    {
      label: "Bing marketplace discovery",
      url: `https://www.bing.com/search?q=${encodeURIComponent(sourceQuery)}`
    },
    {
      label: "DuckDuckGo marketplace discovery",
      url: `https://duckduckgo.com/html/?q=${encodeURIComponent(sourceQuery)}`
    }
  ];
  const responses = await Promise.all(searchUrls.map((source) => fetchAgentText(source.url, source.label, 9000)));

  return {
    candidates: responses.flatMap((response) => (response.ok ? collectSearchResultListings(response.text, response.label) : [])),
    statuses: responses.map((response) => ({
      source: response.label,
      ok: response.ok,
      status: response.status,
      count: response.ok ? collectSearchResultListings(response.text, response.label).length : 0,
      message: response.ok ? "Search results scanned." : response.statusText || "Search source unavailable."
    }))
  };
}

async function runAgentPhoneSearch(payload, existingDebug = null) {
  const meta = buildRankListingsMeta(payload);
  const context = {
    product: payload.product,
    location: cleanText(payload.location),
    maxDistance: Math.max(1, payload.maxDistance || 25),
    basePrice: estimateBasePrice(payload.product)
  };
  const statuses = [
    { label: "Agent is searching listings…", status: "running" },
    { label: "Checking listing details…", status: "pending" },
    { label: "Ranking best deals…", status: "pending" },
    { label: "Results ready.", status: "pending" }
  ];
  const agentSourceStatuses = [];
  const candidates = [];
  const kijijiLink = meta.marketplaceSearchLinks.find((link) => link.id === "kijiji");

  if (kijijiLink?.url) {
    const kijijiResponse = await fetchAgentText(kijijiLink.url, "Kijiji direct search", 9000);
    const kijijiCandidates = kijijiResponse.ok ? collectKijijiListingsFromNextData(kijijiResponse.text) : [];
    candidates.push(...kijijiCandidates);
    agentSourceStatuses.push({
      source: "Kijiji",
      ok: kijijiResponse.ok,
      status: kijijiResponse.status,
      count: kijijiCandidates.length,
      message: kijijiResponse.ok ? "Agent scanned Kijiji search results." : kijijiResponse.statusText || "Kijiji unavailable."
    });
  }

  const webDiscovery = await searchWebForAgentListings(payload.product, payload.location);
  candidates.push(...webDiscovery.candidates);
  agentSourceStatuses.push(...webDiscovery.statuses);
  agentSourceStatuses.push({
    source: "Facebook Marketplace",
    ok: false,
    status: "login_required",
    count: 0,
    message: "Login required. Open this source manually.",
    manualUrl: meta.marketplaceSearchLinks.find((link) => link.id === "facebook-marketplace")?.url || ""
  });
  statuses[0].status = "done";
  statuses[1].status = "running";

  const dedupedCandidates = dedupeAgentCandidates(candidates).slice(0, 18);
  const enrichedCandidates = await Promise.all(dedupedCandidates.slice(0, 10).map(enrichAgentListing));
  const allCandidates = [...enrichedCandidates, ...dedupedCandidates.slice(10)];
  statuses[1].status = "done";
  statuses[2].status = "running";

  const listings = allCandidates
    .map((candidate, index) => normalizeAgentListing(candidate, index, context))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  statuses[2].status = "done";
  statuses[3].status = "done";

  return {
    ...meta,
    requestId: payload.requestId,
    totalListingsAnalyzed: listings.length,
    rawResultsAnalyzed: dedupedCandidates.length,
    maxDistance: context.maxDistance,
    listings,
    topDeals: getTopDeals(listings),
    sourceStatuses: agentSourceStatuses,
    searchDebug: {
      ...(existingDebug || createSearchDebug(payload.product, payload.location, [], "agent")),
      mode: existingDebug ? `${existingDebug.mode || "serpapi"} + agent` : "agent",
      rawResultsReturned: dedupedCandidates.length,
      finalListingsShown: listings.length,
      agentSources: agentSourceStatuses
    },
    agentSearchUsed: true,
    agentStatusSteps: statuses,
    liveRankingLimited: false,
    rankingMessage: listings.length
      ? "Agent Search found and ranked live marketplace listings."
      : "No listings found yet. Try a wider location or lower filter."
  };
}

function getFacebookMarketplaceSearchQueries(product, location, currencyHint) {
  const productQuery = `"${product}"`;
  const locationQuery = cleanText(location) ? `"${cleanText(location)}"` : "";
  const queryPieces = [
    `site:facebook.com/marketplace/item ${productQuery} ${locationQuery}`,
    `site:facebook.com/marketplace/item ${productQuery} "${currencyHint}"`,
    `site:facebook.com/marketplace/item ${productQuery} "battery health"`,
    `site:facebook.com/marketplace/item ${productQuery} "GB"`
  ];

  return [...new Set(queryPieces.map((query) => query.replace(/\s+/g, " ").trim()))];
}

async function fetchSerpApiResults(product, location, options = {}) {
  const region = getSerpApiRegion(location);
  const serpLocation = getSerpApiLocation(location, region) || region.fallbackLocation;
  const queryLocation = getSerpApiQueryLocation(location);
  const baseQuery = [product, queryLocation].filter(Boolean).join(" ");
  const queryCity = queryLocation || extractCityFromText(product) || cleanText(location) || serpLocation;
  const mode = options.mode === "fallback" ? "fallback" : "primary";
  const noCacheParam = process.env.SERPAPI_FORCE_NO_CACHE === "true" ? { no_cache: "true" } : {};
  const organicBaseParams = {
    engine: "google",
    location: serpLocation,
    google_domain: region.googleDomain,
    gl: region.gl,
    hl: "en",
    num: "20",
    device: "desktop",
    ...noCacheParam
  };
  const searches =
    mode === "fallback"
      ? getFallbackDealSearchQueries(product, queryCity).map((query, index) => ({
          label: `Google Fallback ${index + 1}`,
          params: {
            ...organicBaseParams,
            q: query
          },
          resultKey: "organic_results"
        }))
      : [
          {
            label: "Google Shopping",
            params: {
              engine: "google_shopping",
              q: baseQuery,
              location: serpLocation,
              google_domain: region.googleDomain,
              gl: region.gl,
              hl: "en",
              device: "desktop",
              ...noCacheParam
            },
            resultKey: "shopping_results"
          },
          {
            label: "Google Marketplace Organic",
            params: {
              ...organicBaseParams,
              q: getMarketplaceSearchQuery(product, queryLocation || queryCity)
            },
            resultKey: "organic_results"
          }
        ];
  const searchDebug = createSearchDebug(product, location, searches, mode);
  searchDebug.requestId = cleanText(options.requestId);

  const settledSearches = await Promise.allSettled(
    searches.map(async (search) => {
      try {
        return {
          label: search.label,
          resultKey: search.resultKey,
          data: await fetchSerpApiWithRetry(search.params, search.label, 1)
        };
      } catch (error) {
        error.searchLabel = search.label;
        throw error;
      }
    })
  );
  const results = [];
  const sourceStatuses = [];
  const failedReasons = [];

  settledSearches.forEach((searchResult) => {
    if (searchResult.status === "rejected") {
      failedReasons.push(searchResult.reason);
      sourceStatuses.push({
        source: searchResult.reason?.searchLabel || "SerpApi",
        ok: false,
        message: searchResult.reason?.message || "SerpApi search failed."
      });
      searchDebug.apiResponses.push({
        label: searchResult.reason?.searchLabel || "SerpApi",
        status: searchResult.reason?.liveSearchDetails?.status || "failed",
        error: getLiveSearchFailureReason(searchResult.reason, "API request failed"),
        message: searchResult.reason?.liveSearchDetails?.message || searchResult.reason?.message || "SerpApi search failed."
      });
      return;
    }

    const { label, resultKey, data } = searchResult.value;
    const rawItems = Array.isArray(data[resultKey]) ? data[resultKey] : [];
    searchDebug.rawResultsReturned += rawItems.length;
    searchDebug.apiResponses.push({
      label,
      status: data._serpApiStatus || 200,
      resultKey,
      rawResults: rawItems.length,
      error: cleanText(data.error)
    });

    sourceStatuses.push({
      source: label,
      ok: true,
      count: rawItems.length
    });

    rawItems.forEach((item) => {
      results.push({
        ...item,
        serpApiSource: label
      });
    });
  });

  if (sourceStatuses.length && sourceStatuses.every((status) => !status.ok)) {
    const error = failedReasons[0] || new Error(sourceStatuses[0].message || "SerpApi search failed.");
    error.searchDebug = searchDebug;
    throw error;
  }

  return {
    results,
    sourceStatuses,
    searchDebug,
    searchContext: {
      requestId: cleanText(options.requestId),
      serpLocation,
      googleDomain: region.googleDomain,
      gl: region.gl,
      queryLocation,
      product: cleanText(product)
    }
  };
}

function getSerpApiFilterDecision(item, index, context) {
  const url = getSerpApiUrl(item);
  const rawText = getItemText(item);
  const combinedListingText = `${rawText} ${url}`;
  const price = getItemPrice(item, context.product);
  const condition = inferCondition(rawText || item.second_hand_condition);
  const sourceName = getSourceName(url, cleanText(item.source));
  const mainImage = getMainImage(item);
  const datePosted = getItemDatePosted(item);
  const description = getListingDescriptionFromItem(item);
  const sourceListing = {
    product: item.title,
    title: item.title,
    description: rawText,
    rawText,
    listingUrl: url,
    price
  };
  const filterReasons = [];

  if (!url) filterReasons.push("missing direct listing URL");
  if (isAccessoryTitle(item.title)) filterReasons.push("accessory-only title");
  if (isAccessoryOnlyListing(combinedListingText)) filterReasons.push("accessory-only result");
  if (isFinancingOnlyListing(combinedListingText)) filterReasons.push("financing or carrier-plan result");

  const strictProductMatch = matchesRequestedProduct(sourceListing, context.product, context.exactMatch);
  const loosePhoneMatch = isLikelyRequestedPhoneListing(combinedListingText, context.product);

  if (!strictProductMatch && !loosePhoneMatch) {
    filterReasons.push("does not look like the requested phone model");
  }

  return {
    accepted: filterReasons.length === 0,
    filterReasons,
    url,
    rawText,
    combinedListingText,
    price,
    condition,
    sourceName,
    mainImage,
    datePosted,
    description,
    sourceListing,
    debug: {
      index,
      title: cleanText(item.title || item.name || "Untitled result").slice(0, 160),
      source: sourceName,
      url,
      querySource: cleanText(item.serpApiSource),
      price,
      reasons: filterReasons
    }
  };
}

function normalizeSerpApiListing(item, index, context) {
  const decision = getSerpApiFilterDecision(item, index, context);
  const {
    url,
    rawText,
    price,
    condition,
    sourceName,
    mainImage,
    datePosted,
    description
  } = decision;

  if (!decision.accepted) {
    return null;
  }

  const trustScore = calculateSerpTrustScore(item, url);
  const valueScore = price ? calculateValueScore(price, context.basePrice, condition) : 52;
  const conditionScore = conditionScores[condition] || 68;
  const distanceScore = 72;
  const sourceBoost = sourceName === "Facebook Marketplace" ? 8 : 0;
  const score = clampScore(valueScore * 0.4 + conditionScore * 0.15 + distanceScore * 0.1 + trustScore * 0.27 + sourceBoost);
  const listing = {
    id: `serp-${createHash("sha1").update(url).digest("hex").slice(0, 12)}`,
    product: detectPhoneModel(rawText) || cleanText(item.title, context.product),
    price,
    condition,
    description,
    area: getDisplayLocation(context.location, rawText, sourceName),
    listingUrl: url,
    distanceKm: 0,
    insideRange: true,
    maxDistance: context.maxDistance,
    score,
    trustScore,
    valueScore,
    offerPrice: price ? roundToFive(price * getOfferFactor(score)) : 0,
    reason: "",
    riskFlags: [],
    source: sourceName,
    datePosted,
    mainImage,
    map: {
      x: 24 + ((index * 17) % 56),
      y: 26 + ((index * 19) % 50)
    },
    seller: {
      rating: getItemRating(item),
      reviews: getItemReviews(item),
      completedSales: 0,
      accountAgeYears: 0,
      verified: isVerifiedSerpApiListing(item, url),
      sentiment: `${sourceName} result found through SerpApi with a direct listing URL.`
    }
  };

  listing.reason = buildSerpApiReason(listing, context.exactMatch);
  listing.details = buildListingDetails(
    listing.product,
    {
      condition,
      description,
      datePosted,
      mainImage,
      source: sourceName
    },
    listing
  );
  listing.riskFlags = getSerpApiRiskFlags(item, url, listing);

  return listing;
}

function buildListingsFromSerpApiResults(results, context, searchDebug) {
  const seenUrls = new Set();
  const filterReasons = [];
  const listings = [];

  results.forEach((item, index) => {
    const decision = getSerpApiFilterDecision(item, index, context);

    if (!decision.accepted) {
      filterReasons.push(decision.debug);
      return;
    }

    const listing = normalizeSerpApiListing(item, index, context);

    if (!listing) {
      filterReasons.push({
        ...decision.debug,
        reasons: ["failed to normalize after passing filters"]
      });
      return;
    }

    if (seenUrls.has(listing.listingUrl)) {
      filterReasons.push({
        ...decision.debug,
        reasons: ["duplicate direct listing URL"]
      });
      return;
    }

    seenUrls.add(listing.listingUrl);
    listings.push(listing);
  });

  const sortedListings = listings.sort((a, b) => b.score - a.score).slice(0, 20);

  if (searchDebug) {
    searchDebug.filteredOutCount = filterReasons.length;
    searchDebug.filterReasons = filterReasons;
    searchDebug.finalListingsShown = sortedListings.length;
  }

  return sortedListings;
}

async function rankListingsFromSerpApi(product, location, maxDistance, options = {}) {
  const normalizedProduct = cleanText(product);

  if (!normalizedProduct) {
    return {
      totalListingsAnalyzed: 0,
      maxDistance,
      listings: [],
      topDeals: getTopDeals([]),
      sourceStatuses: []
    };
  }

  const primarySearch = await fetchSerpApiResults(normalizedProduct, location, {
    ...options,
    mode: "primary"
  });
  const context = {
    product: normalizedProduct,
    location: cleanText(location),
    maxDistance: Math.max(1, maxDistance || 25),
    basePrice: estimateBasePrice(normalizedProduct),
    exactMatch: options.exactMatch !== false,
    verifiedOnly: Boolean(options.verifiedOnly),
    minPrice: cleanNumber(options.minPrice),
    maxPrice: cleanNumber(options.maxPrice)
  };
  let results = primarySearch.results;
  let sourceStatuses = primarySearch.sourceStatuses;
  let searchContext = primarySearch.searchContext;
  let searchDebug = primarySearch.searchDebug;
  let listings = buildListingsFromSerpApiResults(results, context, searchDebug);

  if (!listings.length) {
    let fallbackSearch;

    try {
      fallbackSearch = await fetchSerpApiResults(normalizedProduct, location, {
        ...options,
        mode: "fallback"
      });
    } catch (error) {
      error.searchDebug = mergeSearchDebug(searchDebug, error.searchDebug);
      throw error;
    }

    results = [...results, ...fallbackSearch.results];
    sourceStatuses = [...sourceStatuses, ...fallbackSearch.sourceStatuses];
    searchContext = fallbackSearch.searchContext || searchContext;
    searchDebug = mergeSearchDebug(searchDebug, fallbackSearch.searchDebug);
    listings = buildListingsFromSerpApiResults(results, context, searchDebug);
  }

  return {
    totalListingsAnalyzed: listings.length,
    rawResultsAnalyzed: results.length,
    maxDistance: context.maxDistance,
    listings,
    topDeals: getTopDeals(listings),
    sourceStatuses,
    searchDebug,
    searchContext
  };
}

function rankListings(product, location, maxDistance, sourceListings = [], options = {}) {
  const normalizedProduct = product.trim() || "Selected product";
  const normalizedDistance = Math.max(1, maxDistance || 25);
  const basePrice = estimateBasePrice(normalizedProduct);
  const exactMatch = options.exactMatch !== false;
  const minPrice = cleanNumber(options.minPrice);
  const maxPrice = cleanNumber(options.maxPrice);
  const filteredSourceListings = sourceListings
    .map(normalizeSourceListing)
    .filter((sourceListing) => sourceListing.listingUrl)
    .filter((sourceListing) => matchesRequestedProduct(sourceListing, normalizedProduct, exactMatch))
    .filter((sourceListing) => !minPrice || !sourceListing.price || sourceListing.price >= minPrice)
    .filter((sourceListing) => !maxPrice || !sourceListing.price || sourceListing.price <= maxPrice)
    .filter((sourceListing) => !options.verifiedOnly || isVerifiedSourceListing(sourceListing));

  return filteredSourceListings
    .map((sourceListing, index) => {
      const profile = listingProfiles[index % listingProfiles.length];
      const distanceKm = Math.max(0.8, Number((normalizedDistance * profile.distanceRatio).toFixed(1)));
      const insideRange = distanceKm <= normalizedDistance;
      const price = cleanNumber(sourceListing.price, 0) || roundToFive(basePrice * profile.priceFactor);
      const condition = cleanText(sourceListing.condition) || profile.condition;
      const trustScore = calculateTrustScore(profile);
      const valueScore = calculateValueScore(price, basePrice, condition);
      const distanceScore = calculateDistanceScore(distanceKm, normalizedDistance, insideRange);
      const conditionScore = conditionScores[condition] || conditionScores[profile.condition] || 65;
      const listingUrl = getSourceListingUrl(sourceListing) || cleanUrl(profile.originalListingUrl);
      const score = clampScore(
        valueScore * 0.34 +
          conditionScore * 0.18 +
          distanceScore * 0.2 +
          trustScore * 0.24 +
          (insideRange ? 4 : -12)
      );
      const area = buildArea(profile.area, location);

      const listing = {
        id: `listing-${index}`,
        product: cleanText(sourceListing.product || sourceListing.title) || normalizedProduct,
        price,
        condition,
        area: cleanText(sourceListing.city || sourceListing.location) || area,
        listingUrl,
        distanceKm,
        insideRange,
        maxDistance: normalizedDistance,
        score,
        trustScore,
        valueScore,
        offerPrice: roundToFive(price * getOfferFactor(score)),
        reason: buildReason(score, insideRange, profile),
        riskFlags: getRiskFlags(profile, insideRange),
        map: {
          x: profile.longitude,
          y: profile.latitude
        },
        seller: {
          rating: profile.sellerRating,
          reviews: profile.reviewCount,
          completedSales: profile.completedSales,
          accountAgeYears: profile.accountAgeYears,
          verified: profile.verified,
          sentiment: profile.sentiment
        }
      };

      listing.details = buildListingDetails(
        normalizedProduct,
        {
          ...profile,
          condition,
          description:
            cleanText(
              sourceListing.description ||
                sourceListing.rawText ||
                sourceListing.text ||
                sourceListing.title ||
                sourceListing.product
            ) || `${normalizedProduct} listing details not provided.`
        },
        listing
      );
      return listing;
    })
    .sort((a, b) => b.score - a.score);
}

function getTopDeals(listings) {
  const inRange = listings.filter((listing) => listing.insideRange);
  const practicalListings = inRange.length ? inRange : listings;

  const bestValue = [...practicalListings].sort((a, b) => {
    if (b.valueScore !== a.valueScore) return b.valueScore - a.valueScore;
    return b.score - a.score;
  })[0];

  const mostTrusted = [...practicalListings].sort((a, b) => {
    if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
    return b.score - a.score;
  })[0];

  const budgetOption = [...practicalListings]
    .filter((listing) => listing.price > 0 && listing.trustScore >= 55 && conditionScores[listing.condition] >= 56)
    .sort((a, b) => a.price - b.price)[0];

  return {
    bestValue,
    mostTrusted,
    budgetOption: budgetOption || practicalListings[0]
  };
}

function normalizeRankSearchInput(source = {}) {
  return {
    product: cleanText(source.product).slice(0, 140),
    location: cleanText(source.location).slice(0, 140),
    maxDistance: Math.max(1, cleanNumber(source.maxDistance, 25)),
    minPrice: cleanNumber(source.minPrice),
    maxPrice: cleanNumber(source.maxPrice),
    exactMatch: source.exactMatch !== false && source.exactMatch !== "false",
    verifiedOnly: source.verifiedOnly === true || source.verifiedOnly === "true",
    requestId: cleanText(source.requestId || source.refresh).slice(0, 90),
    refreshToken: cleanText(source.refreshToken).slice(0, 90)
  };
}

function logRankSearchRequest(method, payload) {
  const region = getSerpApiRegion(payload.location);

  console.info(
    "[rank-listings] live search request",
    sanitizeLogDetails({
      method,
      requestId: payload.requestId,
      refreshToken: payload.refreshToken,
      product: payload.product,
      city: payload.location,
      minPrice: payload.minPrice,
      maxPrice: payload.maxPrice,
      maxDistance: payload.maxDistance,
      exactMatch: payload.exactMatch,
      verifiedOnly: payload.verifiedOnly,
      serpConfigured: Boolean(getSerpApiKey()),
      serpApiLocation: getSerpApiLocation(payload.location, region),
      googleDomain: region.googleDomain,
      gl: region.gl
    })
  );
}

function logRankSearchFailure(error, payload) {
  console.warn(
    "[rank-listings] live search failed",
    sanitizeLogDetails({
      requestId: payload.requestId,
      product: payload.product,
      city: payload.location,
      minPrice: payload.minPrice,
      maxPrice: payload.maxPrice,
      maxDistance: payload.maxDistance,
      reason: getLiveSearchFailureReason(error, "SerpApi ranking failed"),
      message: error?.message,
      details: error?.liveSearchDetails
    })
  );
}

function logRankSearchSuccess(result, payload) {
  console.info(
    "[rank-listings] live search success",
    sanitizeLogDetails({
      requestId: payload.requestId,
      product: payload.product,
      city: payload.location,
      visibleListings: Array.isArray(result?.listings) ? result.listings.length : 0,
      rawResultsAnalyzed: result?.rawResultsAnalyzed,
      sources: Array.isArray(result?.sourceStatuses)
        ? result.sourceStatuses
            .map((status) => `${status.source}:${status.ok ? "ok" : "failed"}:${status.count || 0}`)
            .join(", ")
        : ""
    })
  );
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "SUPERFINDERX" });
});

app.post("/api/auth/signup", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = cleanText(req.body.password);

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const users = await readUsers();

  if (users.some((user) => user.username === username)) {
    return res.status(409).json({ error: "Username already exists." });
  }

  const salt = randomUUID();
  const newUser = {
    id: randomUUID(),
    username,
    salt,
    passwordHash: hashPassword(password, salt),
    sessionToken: randomUUID(),
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await writeUsers(users);

  res.status(201).json({
    token: newUser.sessionToken,
    user: publicUser(newUser)
  });
});

app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = cleanText(req.body.password);
  const users = await readUsers();
  const user = users.find((candidate) => candidate.username === username);

  if (!user || user.passwordHash !== hashPassword(password, user.salt)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  user.sessionToken = randomUUID();
  await writeUsers(users);

  res.json({
    token: user.sessionToken,
    user: publicUser(user)
  });
});

app.get("/api/auth/session", async (req, res) => {
  const user = await findUserByToken(req);

  if (!user) {
    return res.status(401).json({ error: "Not signed in." });
  }

  res.json({ user: publicUser(user) });
});

app.get("/api/ai/conversations", async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;

  const conversations = getUserAiConversations(await readAiConversations(), user.id);
  res.json({
    conversations: conversations.map(publicAiConversationSummary).filter(Boolean)
  });
});

app.post("/api/ai/conversations", async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;

  const conversations = await readAiConversations();
  const now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    userId: user.id,
    title: cleanText(req.body?.title, "New chat").slice(0, 80) || "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now
  };

  conversations.push(conversation);
  await writeAiConversations(conversations.slice(-500));

  res.status(201).json({ conversation: publicAiConversation(conversation) });
});

app.get("/api/ai/conversations/:id", async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;

  const conversations = await readAiConversations();
  const conversation = conversations.find(
    (candidate) => candidate.id === cleanText(req.params.id) && candidate.userId === user.id
  );

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  res.json({ conversation: publicAiConversation(conversation) });
});

app.delete("/api/ai/conversations/:id", async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;

  const conversations = await readAiConversations();
  const nextConversations = conversations.filter(
    (conversation) => !(conversation.id === cleanText(req.params.id) && conversation.userId === user.id)
  );

  if (nextConversations.length === conversations.length) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  await writeAiConversations(nextConversations);
  res.json({ success: true });
});

app.post("/api/ai/conversations/:id/messages", async (req, res) => {
  const user = await requireSignedInUser(req, res);
  if (!user) return;

  const text = cleanAiMessageText(req.body?.text);
  const dealContext = sanitizeDealContext(req.body?.dealContext);
  const assistantContext = sanitizeAssistantContext(req.body?.assistantContext);

  if (!text) {
    return res.status(400).json({ error: "Message text is required." });
  }

  const conversations = await readAiConversations();
  const conversation = conversations.find(
    (candidate) => candidate.id === cleanText(req.params.id) && candidate.userId === user.id
  );

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const now = new Date().toISOString();
  const userMessage = {
    id: randomUUID(),
    role: "user",
    status: "sent",
    text,
    createdAt: now
  };
  const contextMessages = [...conversation.messages, userMessage];
  const replyText = await generateAssistantReplyText(userMessage, dealContext, contextMessages, assistantContext);
  const assistantMessage = {
    id: randomUUID(),
    role: "assistant",
    status: "sent",
    text: replyText,
    createdAt: new Date().toISOString()
  };

  conversation.messages = [...conversation.messages, userMessage, assistantMessage].slice(-80);
  if (!conversation.messages.some((message) => message.role === "user") || conversation.title === "New chat") {
    conversation.title = buildAiConversationTitle(text);
  }
  conversation.updatedAt = assistantMessage.createdAt;

  await writeAiConversations(conversations.slice(-500));
  res.status(201).json({ conversation: publicAiConversation(conversation), assistantMessage });
});

app.get("/api/rank-listings", async (req, res) => {
  const payload = normalizeRankSearchInput(req.query);

  try {
    logRankSearchRequest("GET", payload);

    if (!payload.product) {
      return res.status(400).json({ error: "Product is required." });
    }

    let result;

    if (!getSerpApiKey()) {
      throw createLiveSearchError("API key missing", {
        provider: "SerpApi",
        route: "GET /api/rank-listings",
        expectedEnv: "SERPAPI_API_KEY or SERP_API_KEY"
      });
    }

    result = await rankListingsFromSerpApi(payload.product, payload.location, payload.maxDistance, payload);

    if (!result.listings?.length) {
      result = await runAgentPhoneSearch(payload, result.searchDebug);
    }

    logRankSearchSuccess(result, payload);

    res.json({
      ...buildRankListingsMeta(payload),
      ...result,
      liveRankingLimited: false,
      rankingMessage: result.rankingMessage || "",
      requestId: payload.requestId
    });
  } catch (error) {
    logRankSearchFailure(error, payload);

    try {
      const agentResult = await runAgentPhoneSearch(payload, error.searchDebug);
      res.json({
        ...agentResult,
        liveRankingLimited: !agentResult.listings?.length,
        rankingMessage: agentResult.listings?.length
          ? "Agent Search found and ranked live marketplace listings. SerpApi ranking is temporarily limited."
          : "No listings found yet. Try a wider location or lower filter."
      });
    } catch (agentError) {
      logRankSearchFailure(agentError, payload);
      res.json(buildRankListingsFallbackResponse(payload, error));
    }
  }
});

app.post("/api/rank-listings", async (req, res) => {
  const payload = normalizeRankSearchInput(req.body);

  try {
    logRankSearchRequest("POST", payload);

    if (!payload.product) {
      return res.status(400).json({ error: "Product is required." });
    }

    let result;

    if (!getSerpApiKey()) {
      throw createLiveSearchError("API key missing", {
        provider: "SerpApi",
        route: "POST /api/rank-listings",
        expectedEnv: "SERPAPI_API_KEY or SERP_API_KEY"
      });
    }

    result = await rankListingsFromSerpApi(payload.product, payload.location, payload.maxDistance, payload);

    if (!result.listings?.length) {
      result = await runAgentPhoneSearch(payload, result.searchDebug);
    }

    logRankSearchSuccess(result, payload);

    res.json({
      ...buildRankListingsMeta(payload),
      ...result,
      liveRankingLimited: false,
      rankingMessage: result.rankingMessage || "",
      requestId: payload.requestId
    });
  } catch (error) {
    logRankSearchFailure(error, payload);

    try {
      const agentResult = await runAgentPhoneSearch(payload, error.searchDebug);
      res.json({
        ...agentResult,
        liveRankingLimited: !agentResult.listings?.length,
        rankingMessage: agentResult.listings?.length
          ? "Agent Search found and ranked live marketplace listings. SerpApi ranking is temporarily limited."
          : "No listings found yet. Try a wider location or lower filter."
      });
    } catch (agentError) {
      logRankSearchFailure(agentError, payload);
      res.json(buildRankListingsFallbackResponse(payload, error));
    }
  }
});

app.get("/api/deals", async (req, res) => {
  const deals = await readDeals();
  res.json(deals);
});

app.post("/api/deals", async (req, res) => {
  const deals = await readDeals();

  const newDeal = {
    id: randomUUID(),
    title: cleanText(req.body.title, "Untitled listing"),
    price: cleanNumber(req.body.price),
    score: cleanNumber(req.body.score),
    recommendation: cleanText(req.body.recommendation),
    notes: cleanText(req.body.notes),
    location: cleanText(req.body.location),
    listingUrl: cleanUrl(req.body.listingUrl),
    details: req.body.details && typeof req.body.details === "object" ? req.body.details : null,
    category: cleanText(req.body.category, "other"),
    offerPrice: cleanNumber(req.body.offerPrice),
    condition: cleanText(req.body.condition),
    distanceKm: cleanNumber(req.body.distanceKm),
    sellerRating: cleanNumber(req.body.sellerRating),
    sellerReviews: cleanNumber(req.body.sellerReviews),
    trustScore: cleanNumber(req.body.trustScore),
    insideRange: Boolean(req.body.insideRange),
    redFlags: Array.isArray(req.body.redFlags) ? req.body.redFlags : [],
    createdAt: new Date().toISOString()
  };

  deals.unshift(newDeal);
  await writeDeals(deals);

  res.status(201).json(newDeal);
});

app.delete("/api/deals/:id", async (req, res) => {
  const deals = await readDeals();
  const nextDeals = deals.filter((deal) => deal.id !== req.params.id);

  if (nextDeals.length === deals.length) {
    return res.status(404).json({ error: "Deal not found" });
  }

  await writeDeals(nextDeals);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`SUPERFINDERX backend running at http://localhost:${PORT}`);
});
