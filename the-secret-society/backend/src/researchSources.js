import {
  cleanText,
  detectRedFlags,
  generateSearchLinks,
  money,
  normalizeLocation,
  parseUserDealRequest
} from "./agentLogic.js";

const SERPAPI_SOURCE_NAME = "SerpAPI Google Shopping";
const accessoryKeywords = [
  "case",
  "cover",
  "charger",
  "cable",
  "screen protector",
  "tempered glass",
  "lens protector",
  "skin",
  "mount",
  "holder",
  "adapter",
  "parts",
  "housing",
  "box only",
  "dummy",
  "mockup"
];
const highValueProductKeywords = [
  "iphone",
  "galaxy",
  "pixel",
  "ipad",
  "macbook",
  "laptop",
  "playstation",
  "ps5",
  "xbox",
  "camera",
  "drone"
];

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function normalizeRequest({ item = "", budget = "", location = "", category = "", q = "" }) {
  const parsedFromSentence = parseUserDealRequest(q || item);
  const parsedBudget = toNumber(budget);
  const normalizedLocation = normalizeLocation(location || parsedFromSentence.location);

  return {
    itemName: cleanText(parsedFromSentence.itemName || item),
    budget: parsedBudget || parsedFromSentence.budget || null,
    location: normalizedLocation,
    category: cleanText(category || "other"),
    manualMode: true
  };
}

function sourceStatus({ connected, message, count = 0 }) {
  return {
    name: SERPAPI_SOURCE_NAME,
    connected,
    count,
    message
  };
}

function makeApiNotConnected(message = "API not connected. Add SERPAPI_API_KEY to enable live research.") {
  return {
    status: sourceStatus({ connected: false, message }),
    results: []
  };
}

function tokenize(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function buildSerpApiQuery(request) {
  return [request.itemName, request.budget ? `under ${request.budget}` : ""].filter(Boolean).join(" ").trim();
}

function calculateRelevance({ title, source }, request, position) {
  const queryTokens = [...new Set(tokenize(request.itemName))];
  const haystack = `${title} ${source}`.toLowerCase();

  if (!queryTokens.length) {
    return 50;
  }

  const matchedTokens = queryTokens.filter((token) => haystack.includes(token)).length;
  const tokenScore = (matchedTokens / queryTokens.length) * 70;
  const exactBonus = haystack.includes(request.itemName.toLowerCase()) ? 20 : 0;
  const positionBonus = Math.max(0, 10 - Math.min(10, Number(position || 20) - 1));

  return Math.max(0, Math.min(100, Math.round(tokenScore + exactBonus + positionBonus)));
}

function detectProductWarnings(title, request, price) {
  const titleText = cleanText(title).toLowerCase();
  const itemText = cleanText(request.itemName).toLowerCase();
  const warnings = [];

  if (accessoryKeywords.some((keyword) => titleText.includes(keyword))) {
    warnings.push("likely accessory");
  }

  if (
    request.budget &&
    price > 0 &&
    price < request.budget * 0.35 &&
    highValueProductKeywords.some((keyword) => itemText.includes(keyword))
  ) {
    warnings.push("suspiciously low price");
  }

  return warnings;
}

function buildResult(item, request, index) {
  const source = cleanText(item.source || item.seller || item.merchant?.name || "Google Shopping");
  const title = cleanText(item.title) || "Untitled product";
  const price = toNumber(item.extracted_price || item.price);
  const relevanceScore = calculateRelevance({ title, source }, request, item.position || index + 1);
  const redFlags = [
    ...detectRedFlags(`${title} ${item.second_hand_condition || ""} ${item.tag || ""}`),
    ...detectProductWarnings(title, request, price)
  ];

  return {
    title,
    price,
    source,
    link: cleanText(item.product_link || item.link || item.serpapi_link),
    image: cleanText(item.thumbnail || item.serpapi_thumbnail),
    condition: cleanText(item.second_hand_condition || item.tag || item.badge),
    redFlags: [...new Set(redFlags)],
    relevanceScore,
    overBudget: Boolean(request.budget && price > request.budget),
    badges: []
  };
}

function scoreResults(results, request) {
  const withPrice = results.filter((result) => result.price > 0);
  const cheapestPrice = withPrice.length ? Math.min(...withPrice.map((result) => result.price)) : 0;
  const highestRelevantPrice = request.budget || Math.max(...withPrice.map((result) => result.price), 1);

  const scored = results.map((result) => {
    const priceScore =
      result.price > 0
        ? Math.max(0, Math.min(100, 100 - ((result.price - cheapestPrice) / highestRelevantPrice) * 100))
        : 0;
    const budgetPenalty = request.budget && result.price > request.budget ? 18 : 0;
    const accessoryPenalty = result.redFlags.includes("likely accessory") ? 45 : 0;
    const lowPricePenalty = result.redFlags.includes("suspiciously low price") ? 30 : 0;
    const redFlagPenalty = Math.min(40, result.redFlags.length * 12);
    const dealScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          result.relevanceScore * 0.58 +
            priceScore * 0.42 -
            budgetPenalty -
            redFlagPenalty -
            accessoryPenalty -
            lowPricePenalty
        )
      )
    );

    return {
      ...result,
      priceScore: Math.round(priceScore),
      dealScore
    };
  });

  const ranked = scored.sort((a, b) => b.dealScore - a.dealScore || a.price - b.price || b.relevanceScore - a.relevanceScore);
  const badgeCandidates = ranked.filter(
    (result) =>
      result.relevanceScore >= 55 &&
      !result.redFlags.includes("likely accessory") &&
      !result.redFlags.includes("suspiciously low price")
  );
  const qualifiedResults = badgeCandidates.length ? badgeCandidates : ranked;
  const cheapest = ranked
    .filter((result) => qualifiedResults.includes(result) && result.price > 0)
    .sort((a, b) => a.price - b.price || b.relevanceScore - a.relevanceScore)[0];
  const bestDeal = qualifiedResults[0];

  return ranked.map((result) => {
    const badges = [];

    if (bestDeal && result === bestDeal) badges.push("Best Deal");
    if (cheapest && result === cheapest) badges.push("Cheapest");
    if (request.budget && result.price > request.budget) badges.push("Over Budget");

    return {
      ...result,
      priceRank: result.price > 0 ? scored.filter((item) => item.price > 0 && item.price < result.price).length + 1 : null,
      recommendation: badges.includes("Best Deal") ? "Best Deal" : result.overBudget ? "Over Budget" : "Worth Checking",
      badges
    };
  });
}

async function searchGoogleShopping(request) {
  if (!process.env.SERPAPI_API_KEY) {
    return makeApiNotConnected();
  }

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: buildSerpApiQuery(request),
    location: request.location || "Ontario, Canada",
    google_domain: "google.ca",
    gl: "ca",
    hl: "en",
    api_key: process.env.SERPAPI_API_KEY
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params}`);

    if (!response.ok) {
      return makeApiNotConnected(`SerpAPI returned ${response.status}. Check SERPAPI_API_KEY.`);
    }

    const data = await response.json();

    if (data.error) {
      return makeApiNotConnected(`SerpAPI error: ${data.error}`);
    }

    const rawResults = (data.shopping_results || [])
      .slice(0, 24)
      .map((item, index) => buildResult(item, request, index))
      .filter((result) => result.title && result.price > 0);
    const results = scoreResults(rawResults, request);

    return {
      status: sourceStatus({
        connected: true,
        message: `${results.length} real Google Shopping result${results.length === 1 ? "" : "s"} returned through SerpAPI.`,
        count: results.length
      }),
      results
    };
  } catch (error) {
    return makeApiNotConnected(`SerpAPI request failed: ${error.message}`);
  }
}

export async function researchDeals(query) {
  const request = normalizeRequest(query);
  const facebookLink = generateSearchLinks(request).find((link) => link.name === "Facebook Marketplace");
  const googleShopping = await searchGoogleShopping(request);
  const rankedResults = googleShopping.results;

  return {
    request,
    facebookManual: {
      ...facebookLink,
      status: "Manual Review Required"
    },
    sourceStatuses: [googleShopping.status],
    results: rankedResults,
    summary:
      rankedResults.length > 0
        ? `Found ${rankedResults.length} real Google Shopping result${rankedResults.length === 1 ? "" : "s"} through SerpAPI. Best deal: ${
            rankedResults[0].title
          } at ${money(rankedResults[0].price)}.`
        : googleShopping.status.message
  };
}
