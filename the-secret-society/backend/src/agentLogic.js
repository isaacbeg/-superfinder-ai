const redFlagKeywords = [
  "icloud locked",
  "blacklisted",
  "carrier locked",
  "sim locked",
  "no returns",
  "as is",
  "deposit required",
  "shipping only",
  "cracked",
  "broken",
  "parts only",
  "too good to be true",
  "no imei",
  "unpaid balance"
];

const goodSignKeywords = [
  "unlocked",
  "100% battery",
  "battery 100",
  "receipt",
  "original box",
  "box included",
  "mint",
  "like new",
  "excellent",
  "warranty",
  "applecare"
];

const conditionConcernKeywords = [
  "minor scratches",
  "scratches",
  "dent",
  "crack",
  "cracked",
  "repair",
  "replaced screen",
  "low battery",
  "battery service",
  "no charger"
];

export function money(number) {
  if (!Number.isFinite(number) || number <= 0) {
    return "$0";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(number);
}

function roundToNearest(value, step = 25) {
  return Math.max(step, Math.round(value / step) * step);
}

export function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function findKeywordMatches(text, keywords) {
  const lowerText = cleanText(text).toLowerCase();
  const matches = keywords.filter((keyword) => lowerText.includes(keyword));

  // If "minor scratches" matched, do not also show the smaller "scratches" tag.
  return matches.filter(
    (match) => !matches.some((otherMatch) => otherMatch !== match && otherMatch.includes(match))
  );
}

function toTitleCase(text) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractBudget(text) {
  const budgetMatch = text.match(
    /(?:under|below|max|maximum|budget|up to|less than)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );

  if (budgetMatch) {
    return Number(budgetMatch[1].replaceAll(",", ""));
  }

  const anyMoneyMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  return anyMoneyMatch ? Number(anyMoneyMatch[1].replaceAll(",", "")) : null;
}

function extractLocation(text) {
  const locationMatch = text.match(/\b(?:near|in|around|close to)\s+([a-zA-Z][a-zA-Z\s,-]+)$/i);

  if (!locationMatch) {
    return "";
  }

  return normalizeLocation(locationMatch[1]);
}

export function normalizeLocation(location) {
  const cleanedLocation = cleanText(location).replace(/[.,]$/g, "");
  const lowerLocation = cleanedLocation.toLowerCase();
  const ontarioCities = [
    "markham",
    "vaughan",
    "toronto",
    "mississauga",
    "brampton",
    "richmond hill",
    "scarborough",
    "north york",
    "etobicoke",
    "oakville",
    "barrie"
  ];

  const city = ontarioCities.find((cityName) => lowerLocation.includes(cityName));

  if (city) {
    const titleCity = toTitleCase(city);
    return `${titleCity}, Ontario`;
  }

  return toTitleCase(cleanedLocation);
}

export function parseUserDealRequest(input) {
  const rawInput = cleanText(input);
  const budget = extractBudget(rawInput);
  const location = extractLocation(rawInput);
  let itemName = rawInput;
  const detectedModel = extractModel(rawInput);

  itemName = itemName.replace(
    /(?:my\s+budget\s+is\s+)?(?:under|below|max|maximum|budget|up to|less than)\s*\$?\s*[\d,]+(?:\.\d{1,2})?/i,
    ""
  );

  if (location) {
    const cityOnly = location.replace(/,\s*Ontario$/i, "");
    itemName = itemName.replace(new RegExp(`\\b(?:near|in|around|close to)\\s+${cityOnly}(?:,?\\s*Ontario)?$`, "i"), "");
  }

  itemName = itemName
    .replace(/^(i want|i need|looking for|find me|search for|find)\s+(an?|the)?\s*/i, "")
    .replace(/\b(what are|what's|show me|give me|the|best|prices?|deals?|options?|my budget is|budget is)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,]$/g, "")
    .trim();

  if (detectedModel) {
    itemName = detectedModel.replace(/^IPhone/, "iPhone");
  }

  if (!itemName) {
    itemName = "your item";
  }

  return {
    itemName,
    budget,
    location,
    manualMode: true
  };
}

export function generateSearchLinks(parsedRequest) {
  const queryParts = [parsedRequest.itemName, parsedRequest.location].filter(Boolean);
  const query = queryParts.join(" ");
  const encodedQuery = encodeURIComponent(query);
  const maxPrice = parsedRequest.budget ? String(parsedRequest.budget) : "";

  return [
    {
      name: "Facebook Marketplace",
      url: `https://www.facebook.com/marketplace/search/?query=${encodedQuery}${
        maxPrice ? `&maxPrice=${maxPrice}` : ""
      }`,
      note: "Manual search link. The app does not scrape Facebook."
    }
  ];
}

export function detectRedFlags(text) {
  return findKeywordMatches(text, redFlagKeywords);
}

function detectGoodSigns(text) {
  return findKeywordMatches(text, goodSignKeywords);
}

function detectConditionConcerns(text) {
  return findKeywordMatches(text, conditionConcernKeywords);
}

function extractPrice(text) {
  const priceMatch = cleanText(text).match(/\$\s*([\d,]+(?:\.\d{1,2})?)|(?:^|\s)([\d,]{3,5})(?:\s|$)/);

  if (!priceMatch) {
    return null;
  }

  const value = priceMatch[1] || priceMatch[2];
  return Number(value.replaceAll(",", ""));
}

function extractStorage(text) {
  const storageMatch = cleanText(text).match(/\b(64|128|256|512)\s*gb\b|\b(1|2)\s*tb\b/i);

  if (!storageMatch) {
    return "";
  }

  return storageMatch[0].replace(/\s+/g, "").toUpperCase();
}

function extractModel(text) {
  const modelMatch = cleanText(text).match(
    /\biphone\s*\d+\s*(?:pro max|pro|plus|mini)?\b|\bgalaxy\s*s\d+\s*(?:ultra|plus)?\b|\bpixel\s*\d+\s*(?:pro)?\b/i
  );

  return modelMatch ? toTitleCase(modelMatch[0].replace(/\s+/g, " ").trim()) : "";
}

function extractListingLocation(parts, requestLocation) {
  const locationWords = [
    "vaughan",
    "toronto",
    "mississauga",
    "brampton",
    "markham",
    "richmond hill",
    "scarborough",
    "north york",
    "etobicoke",
    "oakville",
    "barrie"
  ];
  const locationPart = parts.find((part) => {
    const lowerPart = part.toLowerCase();
    return locationWords.some((word) => lowerPart.includes(word));
  });

  if (locationPart) {
    return toTitleCase(locationPart.trim());
  }

  return requestLocation || "";
}

export function parseListingText(listingText, request = {}) {
  const rawText = cleanText(listingText);
  const parts = rawText.split(/\s+-\s+|\s+\|\s+|,/).map((part) => part.trim()).filter(Boolean);
  const price = extractPrice(rawText);
  const pricePartIndex = parts.findIndex((part) => extractPrice(part));
  const firstPart = parts[0] || rawText;
  const itemName = pricePartIndex > 0 ? parts.slice(0, pricePartIndex).join(" - ") : firstPart;
  const redFlags = detectRedFlags(rawText);
  const goodSigns = detectGoodSigns(rawText);
  const conditionConcerns = detectConditionConcerns(rawText);

  return {
    rawText,
    itemName: itemName.replace(/\$\s*[\d,]+(?:\.\d{1,2})?/g, "").trim() || request.itemName || "Unknown item",
    model: extractModel(rawText),
    storage: extractStorage(rawText),
    price,
    location: extractListingLocation(parts, request.location),
    condition: [...goodSigns, ...conditionConcerns].join(", ") || "Not enough condition info",
    redFlags,
    goodSigns,
    conditionConcerns
  };
}

export function scoreDeal(listing, request = {}) {
  let score = 58;

  if (!listing.price) {
    score -= 18;
  }

  if (listing.price && request.budget) {
    const ratio = listing.price / request.budget;

    if (ratio <= 0.75) score += 22;
    else if (ratio <= 0.9) score += 14;
    else if (ratio <= 1) score += 7;
    else if (ratio <= 1.12) score -= 12;
    else score -= 25;
  }

  if (request.location && listing.location) {
    const sameArea = listing.location.toLowerCase().includes(request.location.toLowerCase());
    score += sameArea ? 6 : 1;
  }

  score += Math.min(18, listing.goodSigns.length * 5);
  score -= Math.min(30, listing.conditionConcerns.length * 6);
  score -= Math.min(45, listing.redFlags.length * 15);

  if (!listing.storage) score -= 4;
  if (!listing.model) score -= 3;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const qualityMultiplier =
    1.04 + Math.min(0.08, listing.goodSigns.length * 0.02) - listing.redFlags.length * 0.08 - listing.conditionConcerns.length * 0.04;
  const baseFairPrice = listing.price || request.budget || 0;
  const estimatedFairPrice = baseFairPrice ? roundToNearest(baseFairPrice * qualityMultiplier) : 0;
  const offerFactor = score >= 82 ? 0.92 : score >= 68 ? 0.86 : score >= 50 ? 0.78 : 0.65;
  const negotiationOffer = listing.price ? roundToNearest(listing.price * offerFactor) : 0;
  const finalRecommendation = listing.redFlags.length >= 2 || score < 45 ? "Avoid" : score >= 72 ? "Buy" : "Maybe";

  return {
    score,
    estimatedFairPrice,
    negotiationOffer,
    finalRecommendation
  };
}

export function generateNegotiationMessages(listing, dealScore) {
  const offer = money(dealScore.negotiationOffer);
  const item = listing.itemName || listing.model || "this item";

  return {
    firstMessage: `Hey, is ${item} still available? If everything checks out in person, would you take ${offer}?`,
    lowerOffer: `Thanks for the details. Because of the condition, I would be comfortable at ${offer}.`,
    finalOffer: `I can do ${offer} and pick it up locally. Let me know if that works.`
  };
}

function splitListings(listingsText) {
  return cleanText(listingsText)
    .split(/\n\s*\n|\n(?=[^\n]*\$)/)
    .map((listing) => listing.trim())
    .filter(Boolean);
}

export function analyzeDealHunter(input, listingsText = "") {
  const parsedRequest = parseUserDealRequest(input);
  const searchLinks = generateSearchLinks(parsedRequest);
  const listingBlocks = splitListings(listingsText);
  const analyzedListings = listingBlocks
    .map((block) => {
      const parsedListing = parseListingText(block, parsedRequest);
      const dealScore = scoreDeal(parsedListing, parsedRequest);
      const messages = generateNegotiationMessages(parsedListing, dealScore);

      return {
        ...parsedListing,
        ...dealScore,
        messages
      };
    })
    .sort((a, b) => b.score - a.score);

  const directAnswer =
    analyzedListings.length > 0
      ? `Ranked ${analyzedListings.length} pasted listing${analyzedListings.length === 1 ? "" : "s"} for ${
          parsedRequest.itemName
        }. Best current pick: ${analyzedListings[0].itemName} at ${money(analyzedListings[0].price)}.`
      : `Best search created for ${parsedRequest.itemName}${
          parsedRequest.budget ? ` under ${money(parsedRequest.budget)}` : ""
        }${parsedRequest.location ? ` near ${parsedRequest.location}` : ""}. Open Facebook Marketplace manually, paste 3-5 listings here, and I will rank them.`;

  const breakdown = [
    `Parsed item: ${parsedRequest.itemName}`,
    `Budget: ${parsedRequest.budget ? money(parsedRequest.budget) : "Not provided"}`,
    `Location: ${parsedRequest.location || "Not provided"}`,
    "Mode: Manual listing mode. No live marketplace scraping is happening."
  ];

  const recommendation =
    analyzedListings.length > 0
      ? `${analyzedListings[0].finalRecommendation}: start with the top-ranked listing, verify condition and meet safely before paying.`
      : "Open the Facebook Marketplace search link, copy promising listings, then paste them into the Paste Listings box for scoring.";

  return buildAgentResponse({
    agentId: "deal-hunter",
    title: "Deal Hunter result",
    directAnswer,
    breakdown,
    recommendation,
    searchLinks,
    parsedRequest,
    listings: analyzedListings
  });
}

function calculateExpression(input) {
  const simpleMatch = cleanText(input).match(/^\s*(-?\d+(?:\.\d+)?)\s*([x×*\/+\-])\s*(-?\d+(?:\.\d+)?)\s*$/i);

  if (!simpleMatch) {
    return null;
  }

  const left = Number(simpleMatch[1]);
  const operator = simpleMatch[2].toLowerCase();
  const right = Number(simpleMatch[3]);
  let result = 0;
  let displayOperator = operator;

  if (operator === "x" || operator === "×" || operator === "*") {
    result = left * right;
    displayOperator = "×";
  } else if (operator === "/") {
    result = right === 0 ? NaN : left / right;
  } else if (operator === "+") {
    result = left + right;
  } else {
    result = left - right;
  }

  return {
    directAnswer: Number.isFinite(result)
      ? `${left} ${displayOperator} ${right} = ${formatNumber(result)}`
      : "Cannot divide by zero.",
    metrics: Number.isFinite(result) ? [{ label: "Result", value: formatNumber(result) }] : []
  };
}

function findDimensions(input) {
  const dimensionMatch = cleanText(input).match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?/i);

  if (!dimensionMatch) {
    return null;
  }

  return {
    length: Number(dimensionMatch[1]),
    width: Number(dimensionMatch[2])
  };
}

function findSqftCost(input) {
  const costMatch = cleanText(input).match(/\$\s*(\d+(?:\.\d+)?)\s*(?:per|\/)\s*(?:sq\s*ft|sqft|square foot|square feet)/i);
  return costMatch ? Number(costMatch[1]) : null;
}

function findWastePercent(input) {
  const wasteMatch = cleanText(input).match(/(\d+(?:\.\d+)?)\s*%\s*waste/i);
  return wasteMatch ? Number(wasteMatch[1]) : null;
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Math.round(value * 100) / 100);
}

export function solveQuickMath(input) {
  const expressionResult = calculateExpression(input);

  if (expressionResult) {
    return buildAgentResponse({
      agentId: "quick-solver",
      title: "Quick Solver result",
      directAnswer: expressionResult.directAnswer,
      breakdown: ["Detected a simple arithmetic expression.", "Calculated it directly without using a live AI model."],
      recommendation: "Use this result as the final answer unless you need a longer explanation.",
      metrics: expressionResult.metrics
    });
  }

  const dimensions = findDimensions(input);
  const costPerSqft = findSqftCost(input);

  if (dimensions) {
    const area = dimensions.length * dimensions.width;
    const isFlooring = /floor|flooring|vinyl|laminate|tile|carpet/i.test(input);
    const wastePercent = findWastePercent(input) ?? (isFlooring ? 10 : 0);
    const totalSqft = area * (1 + wastePercent / 100);
    const materialCost = costPerSqft ? area * costPerSqft : null;
    const totalEstimate = costPerSqft ? totalSqft * costPerSqft : null;
    const directAnswer = costPerSqft
      ? `Area = ${formatNumber(area)} sq ft. With ${wastePercent}% waste at ${money(costPerSqft)} per sq ft, estimated material total = ${money(totalEstimate)}.`
      : `Area = ${formatNumber(area)} sq ft.`;

    return buildAgentResponse({
      agentId: "quick-solver",
      title: "Quick Solver result",
      directAnswer,
      breakdown: [
        `Length: ${formatNumber(dimensions.length)} ft`,
        `Width: ${formatNumber(dimensions.width)} ft`,
        `Area formula: length x width = ${formatNumber(area)} sq ft`,
        costPerSqft ? `Material cost before waste: ${money(materialCost)}` : "No material price was provided.",
        wastePercent ? `Waste allowance: ${wastePercent}% = ${formatNumber(totalSqft)} sq ft total` : "No waste allowance added."
      ],
      recommendation: costPerSqft
        ? "Buy a little extra material if cuts, mistakes, or pattern matching are likely."
        : "Add a price per sq ft if you want a cost estimate too.",
      metrics: [
        { label: "Area", value: `${formatNumber(area)} sq ft` },
        { label: "Waste allowance", value: `${wastePercent}%` },
        ...(costPerSqft ? [{ label: "Total estimate", value: money(totalEstimate) }] : [])
      ]
    });
  }

  return buildAgentResponse({
    agentId: "quick-solver",
    title: "Quick Solver result",
    directAnswer: "I could not detect a clear calculation yet.",
    breakdown: [
      "Try a simple expression like 9x6.",
      "Try a measurement like a room is 9 ft by 6 ft.",
      "Try a cost estimate like flooring for 9x6 room at $4 per sqft."
    ],
    recommendation: "Rewrite the request with numbers, units, and the price if there is one."
  });
}

export function createGeneralAgentResponse(agentId, input) {
  const cleanedInput = cleanText(input);

  if (agentId === "study-master") {
    return buildAgentResponse({
      agentId,
      title: "Study Master result",
      directAnswer: "Here is a study-ready summary and practice plan.",
      breakdown: [
        `Core topic: ${cleanedInput}`,
        "Simple summary: explain the topic in your own words, then connect it to one example.",
        "Practice: create 5 flashcards, answer 3 short questions, then teach the idea out loud."
      ],
      recommendation: "Do one 25-minute study sprint, then test yourself without looking at your notes."
    });
  }

  if (agentId === "idea-vault") {
    return buildAgentResponse({
      agentId,
      title: "Idea Vault result",
      directAnswer: "Your rough idea has been turned into a small build plan.",
      breakdown: [
        `Idea: ${cleanedInput}`,
        "Audience: choose the exact person this helps.",
        "First version: build the smallest version that proves the idea works.",
        "Proof: ask one real person if the idea solves a real problem."
      ],
      recommendation: "Write a one-sentence pitch and build a tiny version today."
    });
  }

  if (agentId === "message-crafter") {
    return buildAgentResponse({
      agentId,
      title: "Message Crafter result",
      directAnswer: "Here are polished message options you can copy.",
      breakdown: [
        `Polite: Hey, thanks for reaching out. ${cleanedInput}`,
        `Casual: Hey, quick update. ${cleanedInput}`,
        `Firm: I want to be clear and respectful. ${cleanedInput}`
      ],
      recommendation: "Use the polite version first unless the situation needs a stronger boundary."
    });
  }

  return buildAgentResponse({
    agentId,
    title: "Daily Mission Planner result",
    directAnswer: "Here is a focused plan for your day.",
    breakdown: [
      `Tasks: ${cleanedInput}`,
      "First sprint: choose the one task that makes the rest easier.",
      "Second sprint: finish a visible piece of work.",
      "Reset: take a short break, then review what is left."
    ],
    recommendation: "Start with a 25-minute timer and finish one small thing before switching tasks."
  });
}

function buildAgentResponse({
  agentId,
  title,
  directAnswer,
  breakdown = [],
  recommendation = "",
  searchLinks = [],
  parsedRequest = null,
  listings = [],
  metrics = []
}) {
  const textOutput = [
    directAnswer,
    "",
    "Breakdown:",
    ...breakdown.map((line) => `- ${line}`),
    "",
    "Recommendation / next step:",
    recommendation,
    searchLinks.length ? "\nSearch Sources:" : "",
    ...searchLinks.map((link) => `- ${link.name}: ${link.url}`),
    listings.length ? "\nRanked Listings:" : "",
    ...listings.map(
      (listing, index) =>
        `${index + 1}. ${listing.itemName} - ${money(listing.price)} - Score ${listing.score}/100 - ${
          listing.finalRecommendation
        } - Offer ${money(listing.negotiationOffer)}`
    )
  ]
    .filter(Boolean)
    .join("\n");

  return {
    agentId,
    title,
    directAnswer,
    breakdown,
    recommendation,
    searchLinks,
    parsedRequest,
    listings,
    metrics,
    textOutput,
    manualMode: agentId === "deal-hunter"
  };
}
