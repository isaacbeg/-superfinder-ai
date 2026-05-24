import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BatteryMedium,
  BadgeCheck,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CloudSun,
  Droplets,
  ExternalLink,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  PhoneCall,
  Pin,
  Radar,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Thermometer,
  Trash2
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
const SEARCH_DEBOUNCE_MS = 450;
const MIN_SEARCH_LOADING_MS = 1100;
const LIVE_SEARCH_FAILURE_TEXT = "Live search is currently unavailable. Please try again later.";
const SHOW_SEARCH_DEBUG = import.meta.env.DEV || import.meta.env.VITE_SHOW_SEARCH_DEBUG === "true";
const agentLoadingStatuses = [
  "Agent is searching listings…",
  "Checking listing details…",
  "Ranking best deals…"
];
const liveSearchFields = new Set([
  "product",
  "location",
  "minPrice",
  "maxPrice",
  "distancePreset",
  "customDistance",
  "exactMatch",
  "verifiedOnly"
]);

const distanceOptions = [
  { label: "10 km", value: "10" },
  { label: "25 km", value: "25" },
  { label: "50 km", value: "50" },
  { label: "Custom", value: "custom" }
];

const phoneOptions = [
  "iPhone 15 Pro",
  "iPhone 15",
  "iPhone 14 Pro",
  "iPhone 14",
  "iPhone 13",
  "Samsung Galaxy S24 Ultra",
  "Samsung Galaxy S24",
  "Samsung Galaxy S23",
  "Other devices"
];

const appSections = [
  {
    id: "deal-hunter",
    label: "Deal Hunter",
    eyebrow: "Deal Hunter",
    title: "Find the best overall value near you",
    icon: CircleDollarSign
  },
  {
    id: "ai-assistant",
    label: "AI Assistant",
    eyebrow: "Private AI Assistant",
    title: "Ask anything in a private chat",
    icon: MessageCircle
  }
];
const allowedSectionIds = new Set(["deal-hunter", "ai-assistant"]);
const visibleAppSections = appSections.filter((section) => allowedSectionIds.has(section.id));

const SESSION_KEY = "smart-deal-session";

function getEmptyRankingResult() {
  return {
    listings: [],
    topDeals: {
      bestValue: null,
      mostTrusted: null,
      budgetOption: null
    },
    sourceStatuses: [],
    totalListingsAnalyzed: 0,
    rawResultsAnalyzed: 0,
    searchDebug: null,
    marketplaceSearchLinks: [],
    searchGuide: null,
    agentSearchUsed: false,
    agentStatusSteps: [],
    liveRankingLimited: false,
    rankingMessage: ""
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function readStoredSession() {
  window.localStorage.removeItem(SESSION_KEY);
  return null;
}

function App() {
  const [saveStatus, setSaveStatus] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [session, setSession] = useState(readStoredSession);
  const [savedDeals, setSavedDeals] = useState([]);
  const [locationNotice, setLocationNotice] = useState("");
  const [assistantLocation, setAssistantLocation] = useState(null);
  const [isRankingLoading, setIsRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [rankingResult, setRankingResult] = useState(getEmptyRankingResult);
  const [searchForm, setSearchForm] = useState({
    product: "",
    selectedDevice: "",
    location: "",
    minPrice: "",
    maxPrice: "",
    distancePreset: "25",
    customDistance: "35",
    outsideMode: "mark",
    exactMatch: true,
    verifiedOnly: false
  });
  const [activeSection, setActiveSection] = useState("deal-hunter");
  const [searchRefreshKey, setSearchRefreshKey] = useState(0);
  const [activeSearchRequest, setActiveSearchRequest] = useState(null);
  const [agentStatusIndex, setAgentStatusIndex] = useState(0);
  const searchPanelRef = useRef(null);
  const resultsPanelRef = useRef(null);
  const productInputRef = useRef(null);

  const maxDistance = useMemo(() => getMaxDistance(searchForm), [searchForm]);
  const rankedListings = rankingResult.listings;
  const topDeals = rankingResult.topDeals;
  const bestDeal = rankedListings[0];
  const hasSearchOutput =
    isRankingLoading || rankedListings.length > 0 || Boolean(rankingError) || Boolean(activeSearchRequest);
  const canShowListings = Boolean(searchForm.product.trim()) && hasSearchOutput;
  const listingsInRange = rankedListings.filter((listing) => listing.insideRange);
  const visibleListings =
    searchForm.outsideMode === "hide" ? listingsInRange : rankedListings;
  const marketplaceSearchLinks = Array.isArray(rankingResult.marketplaceSearchLinks)
    ? rankingResult.marketplaceSearchLinks
    : [];
  const agentStatusText = isRankingLoading ? agentLoadingStatuses[agentStatusIndex] : "Results ready.";
  const agentSourceStatuses = Array.isArray(rankingResult.sourceStatuses) ? rankingResult.sourceStatuses : [];
  const agentSearchUsed = Boolean(rankingResult.agentSearchUsed);
  const liveRankingLimited = Boolean(rankingResult.liveRankingLimited);
  const rankingMessage = rankingResult.rankingMessage || "";
  const activeSectionMeta =
    visibleAppSections.find((section) => section.id === activeSection) || visibleAppSections[0];

  useEffect(() => {
    if (session) {
      loadSavedDeals();
    } else {
      setSavedDeals([]);
    }
  }, [session]);

  useEffect(() => {
    if (session) return undefined;

    setAuthForm({ username: "", password: "" });
    const clearTimer = window.setTimeout(() => {
      setAuthForm({ username: "", password: "" });
    }, 120);

    return () => window.clearTimeout(clearTimer);
  }, [authMode, session]);

  useEffect(() => {
    if (!isRankingLoading) {
      setAgentStatusIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setAgentStatusIndex((current) => Math.min(current + 1, agentLoadingStatuses.length - 1));
    }, 1300);

    return () => window.clearInterval(timer);
  }, [isRankingLoading]);

  useEffect(() => {
    if (!session) return undefined;

    if (!activeSearchRequest?.product?.trim()) {
      setRankingResult(getEmptyRankingResult());
      setIsRankingLoading(false);
      setRankingError("");
      return undefined;
    }

    const controller = new AbortController();
    setRankingResult(getEmptyRankingResult());
    setIsRankingLoading(true);
    setRankingError("");

    async function loadRankedListings() {
      const searchStartedAt = Date.now();
      const requestId = activeSearchRequest.requestId || `rank-${Date.now()}`;

      try {
        const response = await fetch(`${API_URL}/api/rank-listings?refresh=${encodeURIComponent(activeSearchRequest.refreshToken)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          },
          body: JSON.stringify({
            product: activeSearchRequest.product,
            location: activeSearchRequest.location,
            minPrice: activeSearchRequest.minPrice,
            maxPrice: activeSearchRequest.maxPrice,
            maxDistance: activeSearchRequest.maxDistance,
            exactMatch: activeSearchRequest.exactMatch,
            verifiedOnly: activeSearchRequest.verifiedOnly,
            requestId,
            refreshToken: activeSearchRequest.refreshToken
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorResult = await response.json().catch(() => null);
          const searchError = new Error(errorResult?.error || "Ranking failed");
          searchError.searchDebug = errorResult?.searchDebug || null;
          searchError.searchPayload = errorResult || null;
          throw searchError;
        }

        const result = await response.json();
        await wait(MIN_SEARCH_LOADING_MS - (Date.now() - searchStartedAt));

        if (!controller.signal.aborted) {
          setRankingResult({
            ...getEmptyRankingResult(),
            ...result,
            listings: Array.isArray(result?.listings) ? result.listings : [],
            topDeals: result?.topDeals || getEmptyRankingResult().topDeals
          });
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          await wait(MIN_SEARCH_LOADING_MS - (Date.now() - searchStartedAt));

          if (!controller.signal.aborted) {
            const fallbackPayload = error.searchPayload || {};
            setRankingResult({
              ...getEmptyRankingResult(),
              ...fallbackPayload,
              listings: Array.isArray(fallbackPayload.listings) ? fallbackPayload.listings : [],
              topDeals: fallbackPayload.topDeals || getEmptyRankingResult().topDeals,
              marketplaceSearchLinks: Array.isArray(fallbackPayload.marketplaceSearchLinks)
                ? fallbackPayload.marketplaceSearchLinks
                : [],
              searchDebug: error.searchDebug || fallbackPayload.searchDebug || null
            });
            setRankingError(fallbackPayload.liveRankingLimited ? "" : error.message || LIVE_SEARCH_FAILURE_TEXT);
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRankingLoading(false);
        }
      }
    }

    const searchTimer = window.setTimeout(loadRankedListings, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(searchTimer);
      controller.abort();
    };
  }, [
    activeSearchRequest,
    session
  ]);

  useEffect(() => {
    if (!session?.token) return;

    async function verifySession() {
      try {
        const response = await fetch(`${API_URL}/api/auth/session`, {
          headers: {
            Authorization: `Bearer ${session.token}`
          }
        });

        if (!response.ok) {
          throw new Error("Session expired");
        }
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
        setSession(null);
      }
    }

    verifySession();
  }, [session?.token]);

  function updateAuthField(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
    setAuthStatus("");
  }

  async function submitAuth(event) {
    event.preventDefault();

    if (isAuthLoading) {
      return;
    }

    if (!authForm.username.trim() || !authForm.password.trim()) {
      setAuthStatus("Enter a username and password.");
      return;
    }

    setIsAuthLoading(true);
    setAuthStatus(authMode === "signup" ? "Creating account..." : "Signing in...");

    try {
      const response = await fetch(`${API_URL}/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Authentication failed.");
      }

      const nextSession = {
        token: result.token,
        user: result.user
      };

      setSession(nextSession);
      window.localStorage.removeItem(SESSION_KEY);
      setAuthForm({ username: "", password: "" });
      setAuthStatus("");
      setSaveStatus("");
    } catch (error) {
      setAuthStatus(error.message || "Authentication failed.");
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function loadSavedDeals() {
    try {
      const response = await fetch(`${API_URL}/api/deals`);
      const deals = await response.json();
      setSavedDeals(deals);
    } catch {
      setSaveStatus("Try again in a moment.");
    }
  }

  function clearCurrentSearchResults(status = "") {
    setActiveSearchRequest(null);
    setRankingResult(getEmptyRankingResult());
    setIsRankingLoading(false);
    setRankingError("");

    if (status) {
      setSaveStatus(status);
    }
  }

  function updateField(field, value) {
    setSearchForm((current) => ({ ...current, [field]: value }));
    if (field === "location") {
      setAssistantLocation(null);
    }

    if (liveSearchFields.has(field)) {
      clearCurrentSearchResults("Filters updated. Press Search Again for fresh live results.");
      return;
    }

    setSaveStatus("");
  }

  function selectDevice(device) {
    setSearchForm((current) => ({
      ...current,
      selectedDevice: device,
      product: device === "Other devices" ? "" : device
    }));
    clearCurrentSearchResults(
      device === "Other devices"
        ? "Filters preserved. Enter another phone to search."
        : "Device selected. Press Search Again for fresh live results."
    );
  }

  function refreshSearch() {
    if (!searchForm.product.trim()) {
      setRankingError("Choose a phone first, then search again.");
      searchPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.requestAnimationFrame(() => productInputRef.current?.focus());
      return;
    }

    setActiveSearchRequest(null);
    setRankingResult(getEmptyRankingResult());
    setIsRankingLoading(false);
    setRankingError("");
    setIsRankingLoading(true);
    const nextRefreshKey = searchRefreshKey + 1;
    setSearchRefreshKey(nextRefreshKey);
    setActiveSearchRequest({
      product: searchForm.product.trim(),
      location: searchForm.location.trim(),
      minPrice: searchForm.minPrice,
      maxPrice: searchForm.maxPrice,
      maxDistance,
      exactMatch: searchForm.exactMatch,
      verifiedOnly: searchForm.verifiedOnly,
      requestId: `rank-${Date.now()}-${nextRefreshKey}`,
      refreshToken: String(nextRefreshKey)
    });
    setSaveStatus("Searching live listings with your current filters.");
  }

  function scrollToResults() {
    resultsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function searchAnotherPhone() {
    setSearchForm((current) => ({
      ...current,
      product: "",
      selectedDevice: "Other devices"
    }));
    setRankingResult(getEmptyRankingResult());
    setRankingError("");
    setSaveStatus("Filters preserved. Enter another phone to search.");
    searchPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => productInputRef.current?.focus());
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationNotice("Current location is unavailable in this browser.");
      return;
    }

    setLocationNotice("Requesting browser location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(3));
        const longitude = Number(position.coords.longitude.toFixed(3));
        setSearchForm((current) => ({
          ...current,
          location: "Current location"
        }));
        setAssistantLocation({
          label: "Current location",
          latitude,
          longitude
        });
        clearCurrentSearchResults("Location updated. Press Search Again for fresh live results.");
        setLocationNotice("Using an approximate current-location area for distance ranking.");
      },
      () => {
        setLocationNotice("Location permission was not granted. City or postal code still works.");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  function dropPin() {
    setSearchForm((current) => ({
      ...current,
      location: current.location ? current.location.replace(/\s+pin$/i, "") + " pin" : "Dropped pin"
    }));
    setAssistantLocation(null);
    clearCurrentSearchResults("Pin updated. Press Search Again for fresh live results.");
    setLocationNotice("Pin dropped. The app uses the general pickup area, not your exact address.");
  }

  async function saveBestDeal() {
    if (!bestDeal) return;

    const dealToSave = {
      title: bestDeal.product,
      price: bestDeal.price,
      score: bestDeal.score,
      recommendation: bestDeal.reason,
      notes: bestDeal.seller.sentiment,
      location: bestDeal.area,
      category: "smart deal",
      offerPrice: bestDeal.offerPrice,
      redFlags: bestDeal.riskFlags,
      listingUrl: bestDeal.listingUrl,
      details: bestDeal.details,
      condition: bestDeal.condition,
      distanceKm: bestDeal.distanceKm,
      sellerRating: bestDeal.seller.rating,
      sellerReviews: bestDeal.seller.reviews,
      trustScore: bestDeal.trustScore,
      insideRange: bestDeal.insideRange
    };

    try {
      const response = await fetch(`${API_URL}/api/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dealToSave)
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      const savedDeal = await response.json();
      setSavedDeals((current) => [savedDeal, ...current]);
      setSaveStatus("Best overall deal saved.");
    } catch {
      setSaveStatus("Try again in a moment.");
    }
  }

  async function deleteDeal(id) {
    try {
      const response = await fetch(`${API_URL}/api/deals/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setSavedDeals((current) => current.filter((deal) => deal.id !== id));
    } catch {
      setSaveStatus("Try again in a moment.");
    }
  }

  if (!session) {
    return (
      <div className="app-shell auth-shell">
        <section className="panel auth-panel">
          <div className="section-heading">
            <p className="eyebrow">SUPERFINDERX</p>
            <h1>{authMode === "signup" ? "Create account" : "Login"}</h1>
          </div>

          {authStatus && <p className="status-line">{authStatus}</p>}

          <form onSubmit={submitAuth} autoComplete="off">
            <label>
              Username
              <input
                name="sdf-username"
                value={authForm.username}
                onChange={(event) => updateAuthField("username", event.target.value)}
                placeholder="Username"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </label>

            <label>
              Password
              <input
                name="sdf-password"
                type="password"
                value={authForm.password}
                onChange={(event) => updateAuthField("password", event.target.value)}
                placeholder="Password"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </label>

            <button className="primary-button auth-submit" type="submit" disabled={isAuthLoading}>
              {isAuthLoading && <ButtonSpinner />}
              {isAuthLoading
                ? authMode === "signup"
                  ? "Creating account..."
                  : "Signing in..."
                : authMode === "signup"
                  ? "Sign up"
                  : "Login"}
            </button>
          </form>

          <div className="auth-switch">
            <span>{authMode === "signup" ? "Already have an account?" : "Need an account?"}</span>
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "signup" ? "login" : "signup");
                setAuthForm({ username: "", password: "" });
                setAuthStatus("");
              }}
            >
              {authMode === "signup" ? "Login" : "Sign up"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{activeSectionMeta.eyebrow}</p>
          <h1>{activeSectionMeta.title}</h1>
        </div>
        <nav className="main-nav" aria-label="Main sections">
          {visibleAppSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                className={activeSection === section.id ? "main-nav-button active" : "main-nav-button"}
                type="button"
                onClick={() => setActiveSection(section.id)}
                key={section.id}
              >
                <Icon size={17} />
                {section.label}
              </button>
            );
          })}
        </nav>
      </header>

      {saveStatus && <p className="status-line">{saveStatus}</p>}

      <main className={activeSection === "deal-hunter" ? "dashboard-grid" : "single-section-grid"}>
        {activeSection === "deal-hunter" && (
          <>
        <section className="panel search-panel" ref={searchPanelRef}>
          <div className="section-heading">
            <p className="eyebrow">Filters</p>
            <h2>Step 1: Select a device</h2>
          </div>

          <div className="device-options" aria-label="Device options">
            {phoneOptions.map((device) => (
              <button
                className={
                  searchForm.selectedDevice === device ? "secondary-button option-button selected" : "secondary-button option-button"
                }
                type="button"
                onClick={() => selectDevice(device)}
                key={device}
              >
                {device}
              </button>
            ))}
          </div>

          <label>
            Phone Type
            <input
              ref={productInputRef}
              value={searchForm.product}
              onChange={(event) => updateField("product", event.target.value)}
              placeholder="Select a phone or type one manually"
              readOnly={Boolean(searchForm.selectedDevice && searchForm.selectedDevice !== "Other devices")}
              autoComplete="off"
            />
          </label>

          <label>
            City
            <input
              value={searchForm.location}
              onChange={(event) => updateField("location", event.target.value)}
              placeholder="Enter city or postal code"
              autoComplete="off"
            />
          </label>

          <div className="two-column">
            <label>
              Min price
              <input
                type="number"
                min="0"
                value={searchForm.minPrice}
                onChange={(event) => updateField("minPrice", event.target.value)}
                placeholder="No minimum"
                autoComplete="off"
              />
            </label>

            <label>
              Max price
              <input
                type="number"
                min="0"
                value={searchForm.maxPrice}
                onChange={(event) => updateField("maxPrice", event.target.value)}
                placeholder="No maximum"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="location-actions">
            <button className="secondary-button" onClick={useCurrentLocation}>
              <LocateFixed size={17} />
              Use current location
            </button>
            <button className="secondary-button" onClick={dropPin}>
              <Pin size={17} />
              Drop pin
            </button>
          </div>

          {locationNotice && <p className="notice-line">{locationNotice}</p>}

          <div className="two-column">
            <label>
              Max distance
              <select
                value={searchForm.distancePreset}
                onChange={(event) => updateField("distancePreset", event.target.value)}
              >
                {distanceOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Custom km
              <input
                type="number"
                min="1"
                value={searchForm.customDistance}
                disabled={searchForm.distancePreset !== "custom"}
                onChange={(event) => updateField("customDistance", event.target.value)}
              />
            </label>
          </div>

          <fieldset className="segmented-control">
            <legend>Outside range</legend>
            <label>
              <input
                type="radio"
                name="outsideMode"
                value="mark"
                checked={searchForm.outsideMode === "mark"}
                onChange={(event) => updateField("outsideMode", event.target.value)}
              />
              Mark lower
            </label>
            <label>
              <input
                type="radio"
                name="outsideMode"
                value="hide"
                checked={searchForm.outsideMode === "hide"}
                onChange={(event) => updateField("outsideMode", event.target.value)}
              />
              Hide
            </label>
          </fieldset>

          <fieldset className="segmented-control filter-toggles">
            <legend>Accuracy</legend>
            <label>
              <input
                type="checkbox"
                checked={searchForm.exactMatch}
                onChange={(event) => updateField("exactMatch", event.target.checked)}
              />
              Exact match
            </label>
            <label>
              <input
                type="checkbox"
                checked={searchForm.verifiedOnly}
                onChange={(event) => updateField("verifiedOnly", event.target.checked)}
              />
              Verified only
            </label>
          </fieldset>

          <p className="notice-line">
            Step 2: Review filters. SuperFinderX tries live ranking first, then keeps real marketplace searches ready.
          </p>

          {isRankingLoading && (
            <LoadingBanner
              label={agentStatusText}
              detail="Agent Search is checking live sources, opening reachable listings, and preparing rankings."
            />
          )}

          <div className="deal-flow-actions">
            <button className="primary-button" type="button" onClick={refreshSearch} disabled={isRankingLoading}>
              {isRankingLoading ? <ButtonSpinner /> : <RefreshCw size={17} />}
              {isRankingLoading ? agentStatusText : "Run Agent Search"}
            </button>
            <button className="secondary-button" type="button" onClick={scrollToResults} disabled={!canShowListings}>
              <Navigation size={17} />
              Back to Results
            </button>
            <button className="secondary-button" type="button" onClick={searchAnotherPhone}>
              <SlidersHorizontal size={17} />
              Search another phone
            </button>
          </div>
        </section>

        <section className="panel overview-panel">
          <div className="section-heading">
            <p className="eyebrow">Results</p>
            <h2>
              {!searchForm.product
                ? "Select a device to see results"
                : isRankingLoading
                  ? agentStatusText
                : agentSearchUsed
                  ? "Agent-ranked listings ready"
                : liveRankingLimited
                  ? "Marketplace searches ready"
                : rankingError
                  ? "Search unavailable"
                : !hasSearchOutput
                  ? "Ready to search"
                  : `${rankedListings.length} listings analyzed`}
            </h2>
          </div>

          <MetricGrid
            metrics={[
              { label: "Within range", value: listingsInRange.length },
              { label: "Max distance", value: `${maxDistance} km` },
              { label: "Saved", value: savedDeals.length }
            ]}
          />

          {isRankingLoading && (
            <LoadingBanner
              label={agentStatusText}
              detail="Scoring fair price, condition, battery, storage, scam risk, and source trust."
            />
          )}

          {(isRankingLoading || agentSearchUsed || rankingResult.agentStatusSteps?.length > 0) && (
            <AgentStatusPanel
              currentStatus={agentStatusText}
              steps={rankingResult.agentStatusSteps}
              isLoading={isRankingLoading}
            />
          )}

          <div className="criteria-list">
            <span>
              <CircleDollarSign size={16} />
              Price
            </span>
            <span>
              <CheckCircle2 size={16} />
              Condition
            </span>
            <span>
              <Navigation size={16} />
              Distance
            </span>
            <span>
              <Star size={16} />
              Seller reviews
            </span>
            <span>
              <ShieldCheck size={16} />
              Trust signals
            </span>
          </div>

          <div className="privacy-note">
            <ShieldCheck size={18} />
            <p>
              Location is used only for distance calculations. Exact home addresses and
              precise user locations are not displayed.
            </p>
          </div>

          <div className="results-toolbar">
            <button className="primary-button" type="button" onClick={refreshSearch} disabled={!searchForm.product.trim() || isRankingLoading}>
              {isRankingLoading ? <ButtonSpinner /> : <RefreshCw size={17} />}
              {isRankingLoading ? agentStatusText : "Agent Search Again"}
            </button>
            <button className="secondary-button" type="button" onClick={searchAnotherPhone}>
              <SlidersHorizontal size={17} />
              Another phone
            </button>
          </div>
        </section>

        {canShowListings && marketplaceSearchLinks.length > 0 && (
          <MarketplaceSearchPanel
            links={marketplaceSearchLinks}
            sourceStatuses={agentSourceStatuses}
            message={rankingMessage}
            liveRankingLimited={liveRankingLimited}
          />
        )}

        {canShowListings && bestDeal && (
          <section className="panel best-panel">
            <div className="section-heading">
              <p className="eyebrow">Best Overall Deal</p>
              <h2>Phone Type: {bestDeal.product}</h2>
            </div>

            <div className="best-layout">
              <div className="price-stack">
                <strong>{formatMoney(bestDeal.price)}</strong>
                <span>{bestDeal.condition}</span>
              </div>

              <div className="score-pill">
                <Radar size={18} />
                {bestDeal.score}/100
              </div>
            </div>

            <DetailGrid listing={bestDeal} />

            <p className="reason-line">{bestDeal.reason}</p>
            <ListingDetails details={bestDeal.details} compact />

            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => setMapOpen(true)}
              >
                <ExternalLink size={18} />
                View on Map
              </button>
              <ListingLink listing={bestDeal} />
              <button className="primary-button save-button" onClick={saveBestDeal}>
                <Bookmark size={18} />
                Save best
              </button>
              <button className="secondary-button" type="button" onClick={scrollToResults}>
                <Navigation size={18} />
                Back to Results
              </button>
              <button className="secondary-button" type="button" onClick={searchAnotherPhone}>
                <SlidersHorizontal size={18} />
                Search another phone
              </button>
            </div>
          </section>
        )}

        {canShowListings && visibleListings.length > 0 && (
        <section className="panel top-deals-panel">
          <div className="section-heading">
            <p className="eyebrow">Top Deals</p>
            <h2>Ranked by realistic value</h2>
          </div>

          <div className="deal-card-grid">
            <FeaturedDeal
              title="#1 Best Value"
              icon={<CircleDollarSign size={18} />}
              listing={topDeals.bestValue}
              note="Lowest price for the condition while staying practical for pickup."
            />
            <FeaturedDeal
              title="#2 Most Trusted"
              icon={<BadgeCheck size={18} />}
              listing={topDeals.mostTrusted}
              note="Strongest review profile, account age, and verification signals."
            />
            <FeaturedDeal
              title="#3 Budget Option"
              icon={<SlidersHorizontal size={18} />}
              listing={topDeals.budgetOption}
              note="Cheapest acceptable option after condition and trust checks."
            />
          </div>
        </section>
        )}

        {SHOW_SEARCH_DEBUG && canShowListings && (
          <SearchDebugPanel
            debug={rankingResult.searchDebug}
            error={rankingError}
            isLoading={isRankingLoading}
          />
        )}

        {canShowListings && (
        <section className="panel listings-panel" ref={resultsPanelRef}>
          <div className="section-heading">
            <p className="eyebrow">Listings</p>
            <h2>
              {isRankingLoading
                ? "Updating rankings..."
                : liveRankingLimited
                  ? "Live ranking limited"
                : rankingError
                  ? "Live search unavailable"
                : visibleListings.length === 0 && marketplaceSearchLinks.length > 0
                  ? "Manual searches available"
                  : `${visibleListings.length} visible listings`}
            </h2>
          </div>

          <div className="results-toolbar listings-toolbar">
            <button className="primary-button" type="button" onClick={refreshSearch} disabled={!searchForm.product.trim() || isRankingLoading}>
              {isRankingLoading ? <ButtonSpinner /> : <RefreshCw size={17} />}
              {isRankingLoading ? agentStatusText : "Run Agent Search Again"}
            </button>
            <button className="secondary-button" type="button" onClick={searchAnotherPhone}>
              <SlidersHorizontal size={17} />
              Search another phone
            </button>
          </div>

          <div className="listing-table">
            {visibleListings.length === 0 ? (
              isRankingLoading ? (
                <ListingSkeletons />
              ) : (
                <EmptyState
                  title={
                    rankingMessage && !visibleListings.length
                      ? rankingMessage
                      : liveRankingLimited
                        ? "Live ranking is temporarily limited, but you can still open real marketplace searches below."
                      : rankingError || "No matching listings found."
                  }
                  detail={
                    liveRankingLimited
                      ? "Use the Search These Sites buttons above to view real listings directly."
                      : rankingError
                        ? ""
                        : "Try another phone, city, or price range."
                  }
                />
              )
            ) : visibleListings.map((listing, index) => (
              <ListingCard listing={listing} index={index} key={listing.id} />
            ))}
          </div>
        </section>
        )}

        {canShowListings && visibleListings.length > 0 && (
        <section className="panel trust-panel">
          <div className="section-heading">
            <p className="eyebrow">Seller Trust Analysis</p>
            <h2>How listings are weighted</h2>
          </div>

          <div className="trust-grid">
            {rankedListings.slice(0, 4).map((listing) => (
              <TrustCard listing={listing} key={listing.id} />
            ))}
          </div>
        </section>
        )}

        <section className="panel recommendation-panel">
          <div className="section-heading">
            <p className="eyebrow">Recommendation</p>
            <h2>The best deal is not always the cheapest</h2>
          </div>
          <DealSearchGuide guide={rankingResult.searchGuide} product={searchForm.product} />
        </section>

        <section className="panel saved-panel">
          <div className="section-heading">
            <p className="eyebrow">Saved Deals</p>
            <h2>{savedDeals.length} saved listing{savedDeals.length === 1 ? "" : "s"}</h2>
          </div>

          {savedDeals.length === 0 ? (
            <EmptyState title="No saved deals yet." detail="Save a strong listing when you find one." />
          ) : (
            <div className="saved-grid">
              {savedDeals.map((deal) => (
                <article className="saved-card" key={deal.id}>
                  <div>
                    <p className="eyebrow">{deal.condition || deal.category || "deal"}</p>
                    <h3>Phone Type: {deal.title}</h3>
                  </div>
                  <div className="saved-details">
                    <span>{formatMoney(deal.price)}</span>
                    <span>{deal.score}/100</span>
                    <span>{formatDistance(deal.distanceKm)}</span>
                    <span>{formatSellerRating(deal)}</span>
                  </div>
                  <p>{deal.recommendation}</p>
                  {deal.details && <ListingDetails details={deal.details} compact />}
                  <ListingLink listing={deal} />
                  <button className="delete-button" onClick={() => deleteDeal(deal.id)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
          </>
        )}

        {activeSection === "ai-assistant" && (
          <ChatPanel
            session={session}
            currentDeal={bestDeal}
            assistantContext={buildChatAssistantContext(searchForm, assistantLocation)}
          />
        )}
      </main>

      {mapOpen && (
        <div className="map-overlay" role="dialog" aria-modal="true" aria-label="Listing map">
          <section className="panel map-modal">
            <div className="map-modal-header">
              <div>
                <p className="eyebrow">Map View</p>
                <h2>{searchForm.location || "Set a location"}</h2>
              </div>
              <button className="secondary-button" onClick={() => setMapOpen(false)}>
                Close
              </button>
            </div>

            <DealMap listings={visibleListings} onDropPin={dropPin} />

            <div className="map-legend">
              <span>
                <i className="legend-dot user-dot" />
                Your general area
              </span>
              <span>
                <i className="legend-dot listing-dot" />
                Pickup area
              </span>
              <span>
                <i className="legend-dot outside-dot" />
                Outside preferred range
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ChatPanel({ session, currentDeal, assistantContext }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [draft, setDraft] = useState("");
  const [assistantStatus, setAssistantStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConversationLoading, setIsConversationLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!session?.token) return undefined;

    let isMounted = true;

    async function loadAssistantConversations() {
      setIsConversationLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/ai/conversations`, {
          headers: getAssistantHeaders(session)
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || "Could not load conversations.");
        }

        if (!isMounted) return;

        const nextConversations = result?.conversations || [];
        setConversations(nextConversations);
        setAssistantStatus("");

        if (!activeConversation && nextConversations[0]) {
          await loadConversation(nextConversations[0].id, isMounted);
        }
      } catch {
        if (isMounted) {
          setAssistantStatus("Try again in a moment.");
        }
      } finally {
        if (isMounted) {
          setIsConversationLoading(false);
        }
      }
    }

    loadAssistantConversations();

    return () => {
      isMounted = false;
    };
  }, [session?.token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages?.length, isSubmitting]);

  async function loadConversation(conversationId, isMounted = true) {
    try {
      const response = await fetch(`${API_URL}/api/ai/conversations/${conversationId}`, {
        headers: getAssistantHeaders(session)
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Conversation unavailable.");
      }

      if (isMounted) {
        setActiveConversation(result.conversation);
        setAssistantStatus("");
      }
    } catch {
      if (isMounted) {
        setAssistantStatus("Try again in a moment.");
      }
    }
  }

  function startNewConversation() {
    setActiveConversation(null);
    setDraft("");
    setAssistantStatus("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function createConversation() {
    const response = await fetch(`${API_URL}/api/ai/conversations`, {
      method: "POST",
      headers: getAssistantHeaders(session),
      body: JSON.stringify({})
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.error || "Could not create chat.");
    }

    setConversations((current) => sortConversationSummaries(upsertConversationSummary(current, result.conversation)));
    return result.conversation;
  }

  async function deleteConversation(conversationId) {
    try {
      const response = await fetch(`${API_URL}/api/ai/conversations/${conversationId}`, {
        method: "DELETE",
        headers: getAssistantHeaders(session)
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
      }
    } catch {
      setAssistantStatus("Try again in a moment.");
    }
  }

  async function submitAssistantMessage(event) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || isSubmitting) {
      return;
    }

    setDraft("");
    setAssistantStatus("");
    setIsSubmitting(true);

    const now = new Date().toISOString();
    const temporaryConversation = {
      ...(activeConversation || { id: "", title: buildLocalConversationTitle(text), messages: [] }),
      title: activeConversation?.title || buildLocalConversationTitle(text),
      messages: [
        ...(activeConversation?.messages || []),
        { id: `temp-user-${Date.now()}`, role: "user", status: "sent", text, createdAt: now },
        { id: `temp-ai-${Date.now()}`, role: "assistant", status: "thinking", text: getAssistantLoadingText(text), createdAt: now }
      ]
    };
    setActiveConversation(temporaryConversation);

    try {
      const conversation = activeConversation?.id ? activeConversation : await createConversation();
      const response = await fetch(`${API_URL}/api/ai/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: getAssistantHeaders(session),
        body: JSON.stringify({
          text,
          dealContext: buildChatDealContext(currentDeal),
          assistantContext
        })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Assistant failed.");
      }

      setActiveConversation(result.conversation);
      setConversations((current) => sortConversationSummaries(upsertConversationSummary(current, result.conversation)));
    } catch {
      setActiveConversation((current) => ({
        ...(current || temporaryConversation),
        messages: (current?.messages || temporaryConversation.messages).map((message) =>
          message.status === "thinking"
            ? {
                ...message,
                status: "sent",
                text: "I couldn't get that response right now. Try again in a moment."
              }
            : message
        )
      }));
      setAssistantStatus("Try again in a moment.");
    } finally {
      setIsSubmitting(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const assistantMessages = activeConversation?.messages || [];

  return (
    <section className="panel ai-assistant-panel">
      <div className="chat-header">
        <div className="section-heading">
          <p className="eyebrow">SuperFinderX Assistant</p>
          <h2>AI Assistant</h2>
        </div>
        <span className="chat-count">
          <MessageCircle size={16} />
          {assistantMessages.length}
        </span>
      </div>

      {assistantStatus && <p className="chat-status">{assistantStatus}</p>}

      <div className="ai-chat-shell">
        <aside className="ai-chat-sidebar" aria-label="AI chats">
          <button className="primary-button new-chat-button" type="button" onClick={startNewConversation}>
            <MessageCircle size={16} />
            New Chat
          </button>

          <div className="ai-chat-list">
            {conversations.length === 0 ? (
              isConversationLoading ? (
                <ConversationSkeletons />
              ) : (
                <p className="empty-state compact-empty">No previous chats.</p>
              )
            ) : (
              conversations.map((conversation) => (
                <div
                  className={conversation.id === activeConversation?.id ? "ai-chat-list-item active" : "ai-chat-list-item"}
                  key={conversation.id}
                >
                  <button type="button" onClick={() => loadConversation(conversation.id)}>
                    <strong>{conversation.title}</strong>
                    <span>{formatChatTime(conversation.updatedAt)}</span>
                  </button>
                  <button
                    className="icon-button danger-icon"
                    type="button"
                    onClick={() => deleteConversation(conversation.id)}
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="ai-chat-main">
          <div className="ai-assistant-messages" aria-live="polite">
            {assistantMessages.length === 0 ? (
              isConversationLoading ? (
                <div className="assistant-loading-shell">
                  <LoadingBanner label="Loading AI response..." detail="Opening your private assistant workspace." />
                </div>
              ) : (
                <p className="empty-state assistant-empty">No messages yet.</p>
              )
            ) : (
              assistantMessages.map((message) => (
                <article className={getAssistantMessageClassName(message)} key={message.id}>
                  <div className="message-bubble">
                    <div className="message-meta">
                      <strong>{message.role === "assistant" ? "SuperFinderX AI" : session.user?.username || "You"}</strong>
                      <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
                    </div>
                    {message.status === "thinking" ? (
                      <p className="message-text thinking-text">
                        <TypingLoader label={message.text || "Loading AI response..."} />
                      </p>
                    ) : (
                      <div className="message-text">
                        <MessageText text={message.text} />
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="ai-chat-composer" onSubmit={submitAssistantMessage}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask SuperFinderX anything"
              rows={1}
            />
            <button className="primary-button send-button" type="submit" disabled={!draft.trim() || isSubmitting}>
              <Send size={17} />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function ButtonSpinner() {
  return <span className="button-spinner" aria-hidden="true" />;
}

function LoadingBanner({ label, detail }) {
  return (
    <div className="loading-banner" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </div>
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state empty-card">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function AgentStatusPanel({ currentStatus, steps, isLoading }) {
  const safeSteps = Array.isArray(steps) && steps.length
    ? steps
    : agentLoadingStatuses.map((label, index) => ({
        label,
        status: isLoading && label === currentStatus ? "running" : "pending"
      }));

  return (
    <div className="agent-status-panel">
      <div className="agent-status-header">
        <Radar size={17} />
        <strong>{isLoading ? currentStatus : "Results ready."}</strong>
      </div>
      <div className="agent-status-steps">
        {safeSteps.map((step) => (
          <span className={`agent-step ${step.status || "pending"}`} key={step.label}>
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MarketplaceSearchPanel({ links, sourceStatuses, message, liveRankingLimited }) {
  if (!Array.isArray(links) || links.length === 0) {
    return null;
  }
  const loginRequiredSources = Array.isArray(sourceStatuses)
    ? sourceStatuses.filter((status) => status.status === "login_required")
    : [];

  return (
    <section className="panel marketplace-panel">
      <div className="section-heading">
        <p className="eyebrow">Search These Sites</p>
        <h2>Open real marketplace results directly</h2>
      </div>

      {(liveRankingLimited || message) && (
        <p className="limited-ranking-note">
          {message || "Live ranking is temporarily limited, but you can still open real marketplace searches below."}
        </p>
      )}

      <div className="marketplace-link-grid">
        {links.map((link) => (
          <a className="marketplace-link" href={link.url} target="_blank" rel="noreferrer" key={link.id || link.url}>
            <span>
              <strong>{link.label}</strong>
              <small>{link.note || link.source}</small>
            </span>
            <ExternalLink size={17} />
          </a>
        ))}
      </div>

      {loginRequiredSources.length > 0 && (
        <div className="source-access-list">
          {loginRequiredSources.map((source) => (
            <article key={source.source}>
              <strong>{source.source}</strong>
              <span>{source.message || "Login required. Open this source manually."}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DealSearchGuide({ guide, product }) {
  if (!guide) {
    return (
      <p>
        The ranking favors fair price, good condition, close pickup distance, and a
        strong seller reputation. Risky profiles are pushed down even when the list
        price looks tempting.
      </p>
    );
  }

  return (
    <div className="deal-guide">
      <div className="guide-highlight-grid">
        <article>
          <span>Best price range</span>
          <strong>{guide.bestPriceRange || "Compare recent local listings"}</strong>
        </article>
        <article>
          <span>Battery target</span>
          <strong>{guide.batteryHealthTarget || "Aim for 85%+ battery health"}</strong>
        </article>
      </div>

      <div className="guide-list-grid">
        <GuideList title={`What to look for${product ? ` in ${product}` : ""}`} items={guide.whatToLookFor} />
        <GuideList title="Scam warning signs" items={guide.scamWarningSigns} danger />
        <GuideList title="Description details to check" items={guide.descriptionChecks} />
      </div>
    </div>
  );
}

function GuideList({ title, items, danger = false }) {
  const safeItems = Array.isArray(items) ? items : [];

  if (!safeItems.length) {
    return null;
  }

  return (
    <section className={danger ? "guide-list danger" : "guide-list"}>
      <h3>{title}</h3>
      <ul>
        {safeItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function SearchDebugPanel({ debug, error, isLoading }) {
  if (!debug && !isLoading && !error) {
    return null;
  }

  const queries = Array.isArray(debug?.serpApiQueries) ? debug.serpApiQueries : [];
  const responses = Array.isArray(debug?.apiResponses) ? debug.apiResponses : [];
  const filterReasons = Array.isArray(debug?.filterReasons) ? debug.filterReasons : [];

  return (
    <section className="panel search-debug-panel">
      <div className="section-heading">
        <p className="eyebrow">Search Debug</p>
        <h2>{isLoading ? "Live request running" : "Live search diagnostics"}</h2>
      </div>

      <div className="debug-metrics">
        <div>
          <span>Raw results</span>
          <strong>{debug?.rawResultsReturned ?? 0}</strong>
        </div>
        <div>
          <span>Filtered out</span>
          <strong>{debug?.filteredOutCount ?? 0}</strong>
        </div>
        <div>
          <span>Final shown</span>
          <strong>{debug?.finalListingsShown ?? 0}</strong>
        </div>
        <div>
          <span>Fallback</span>
          <strong>{debug?.fallbackUsed ? "Used" : "No"}</strong>
        </div>
      </div>

      {debug?.filterMode && <p className="debug-muted">Filter mode: {debug.filterMode}</p>}

      {error && <p className="debug-error">{error}</p>}

      <div className="debug-grid">
        <div>
          <h3>SerpApi Queries</h3>
          {queries.length === 0 ? (
            <p className="debug-muted">No query captured yet.</p>
          ) : (
            <div className="debug-list">
              {queries.map((query, index) => (
                <article className="debug-item" key={`${query.label}-${index}`}>
                  <strong>{query.label}</strong>
                  <code>{query.q || "No query"}</code>
                  <span>
                    {query.engine || "engine?"} · {query.location || "location?"} · {query.googleDomain || "domain?"}
                  </span>
                </article>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3>API Responses</h3>
          {responses.length === 0 ? (
            <p className="debug-muted">No response captured yet.</p>
          ) : (
            <div className="debug-list">
              {responses.map((response, index) => (
                <article className="debug-item" key={`${response.label}-${index}`}>
                  <strong>{response.label}</strong>
                  <span>Status: {String(response.status || "unknown")}</span>
                  <span>Raw: {response.rawResults ?? 0}</span>
                  {response.error && <span>Error: {response.error}</span>}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="debug-filter-section">
        <h3>Filtered Results</h3>
        {filterReasons.length === 0 ? (
          <p className="debug-muted">No filtered-out results captured.</p>
        ) : (
          <div className="debug-filter-list">
            {filterReasons.map((item, index) => (
              <article className="debug-item" key={`${item.url || item.title}-${index}`}>
                <strong>{item.title || "Untitled result"}</strong>
                <span>{item.source || "Unknown source"}</span>
                <code>{item.url || "No URL"}</code>
                <span>{(item.reasons || []).join(", ") || "No reason listed"}</span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ListingSkeletons({ count = 3 }) {
  return (
    <div className="skeleton-list" aria-label="Searching live listings">
      {Array.from({ length: count }).map((_, index) => (
        <article className="listing-card skeleton-card" key={index}>
          <div className="skeleton-block skeleton-rank" />
          <div className="skeleton-block skeleton-image" />
          <div className="skeleton-stack">
            <div className="skeleton-block skeleton-line wide" />
            <div className="skeleton-block skeleton-line medium" />
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-chip-row">
              <div className="skeleton-block skeleton-chip" />
              <div className="skeleton-block skeleton-chip" />
              <div className="skeleton-block skeleton-chip" />
            </div>
          </div>
          <div className="skeleton-actions">
            <div className="skeleton-block skeleton-button" />
            <div className="skeleton-block skeleton-button" />
          </div>
        </article>
      ))}
    </div>
  );
}

function ConversationSkeletons() {
  return (
    <div className="conversation-skeletons" aria-label="Loading AI chats">
      {[0, 1, 2].map((item) => (
        <div className="conversation-skeleton" key={item}>
          <span className="skeleton-block skeleton-line wide" />
          <span className="skeleton-block skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function TypingLoader({ label }) {
  return (
    <span className="typing-loader">
      <span>{label}</span>
      <span className="typing-dots" aria-hidden="true" />
    </span>
  );
}

function getAssistantLoadingText(text) {
  const value = String(text || "").toLowerCase();

  if (/\b(weather|temperature|forecast|rain|snow|wind|humidity)\b/.test(value)) {
    return "Loading AI response...";
  }

  if (/\b(restaurant|business|google maps|near me|nearby|local|address|phone number|open now|store|shop)\b/.test(value)) {
    return "Checking live local results...";
  }

  if (/\b(deal|price|listing|buy|sell|marketplace|iphone|samsung|phone|product|discount)\b/.test(value)) {
    return "Searching live listings...";
  }

  return "Loading AI response...";
}

function getMaxDistance(searchForm) {
  if (searchForm.distancePreset === "custom") {
    return Math.max(1, Number(searchForm.customDistance) || 1);
  }

  return Number(searchForm.distancePreset);
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "Price not listed";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(number);
}

function formatDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "Distance not listed";
  return `${number} km`;
}

function formatSellerRating(deal) {
  const rating = Number(deal.sellerRating);
  const reviews = Number(deal.sellerReviews);

  if (!Number.isFinite(rating) || rating <= 0) {
    return "No rating";
  }

  return `${rating.toFixed(1)} (${Number.isFinite(reviews) ? reviews : 0})`;
}

function formatSellerSummary(seller = {}) {
  const rating = Number(seller.rating);
  const reviews = Number(seller.reviews);

  if (!Number.isFinite(rating) || rating <= 0) {
    return "No rating listed";
  }

  return `${rating.toFixed(1)} (${Number.isFinite(reviews) ? reviews : 0})`;
}

function formatDealScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 ? `${Math.round(score)}/100` : "Not scored";
}

function getBatteryHealth(listing = {}) {
  return (
    listing.batteryHealth ||
    listing.details?.specs?.batteryHealth ||
    listing.details?.batteryHealth ||
    "Battery not listed"
  );
}

function getScamRisk(listing = {}) {
  const riskFlags = Array.isArray(listing.riskFlags)
    ? listing.riskFlags
    : Array.isArray(listing.redFlags)
      ? listing.redFlags
      : [];
  const trustScore = Number(listing.trustScore);

  if (riskFlags.length >= 3 || (Number.isFinite(trustScore) && trustScore < 45)) {
    return { label: "Scam Risk: High", className: "high" };
  }

  if (riskFlags.length > 0 || (Number.isFinite(trustScore) && trustScore < 70)) {
    return { label: "Scam Risk: Medium", className: "medium" };
  }

  return { label: "Scam Risk: Low", className: "low" };
}

function getAssistantHeaders(session) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`
  };
}

function sortConversationSummaries(conversations) {
  return [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function upsertConversationSummary(conversations, nextConversation) {
  if (!nextConversation?.id) {
    return conversations;
  }

  const conversationMap = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  conversationMap.set(nextConversation.id, {
    id: nextConversation.id,
    title: nextConversation.title || "New chat",
    updatedAt: nextConversation.updatedAt,
    createdAt: nextConversation.createdAt,
    messageCount: nextConversation.messageCount ?? nextConversation.messages?.length ?? 0,
    lastMessage: nextConversation.lastMessage || nextConversation.messages?.at(-1)?.text || ""
  });
  return [...conversationMap.values()];
}

function buildLocalConversationTitle(text) {
  const words = String(text || "")
    .replace(/[^\w\s$.-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);
  const title = words.join(" ");
  return title ? (title.length > 54 ? `${title.slice(0, 51)}...` : title) : "New chat";
}

function getAssistantMessageClassName(message) {
  return [
    "chat-message",
    message.role === "user" ? "own-message" : "assistant-message",
    message.status === "thinking" ? "thinking-message" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function formatChatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function buildChatDealContext(deal) {
  if (!deal) {
    return null;
  }

  return {
    product: deal.product,
    title: deal.title,
    price: deal.price,
    condition: deal.condition,
    score: deal.score,
    valueScore: deal.valueScore,
    trustScore: deal.trustScore,
    offerPrice: deal.offerPrice,
    distanceKm: deal.distanceKm,
    area: deal.area,
    location: deal.location,
    listingUrl: deal.listingUrl,
    source: deal.source,
    datePosted: deal.datePosted,
    reason: deal.reason,
    recommendation: deal.recommendation,
    riskFlags: deal.riskFlags,
    redFlags: deal.redFlags,
    details: deal.details
  };
}

function buildChatAssistantContext(searchForm, assistantLocation) {
  const locationLabel = searchForm.location || assistantLocation?.label || "";
  const shouldAttachCoordinates =
    assistantLocation &&
    assistantLocation.label === locationLabel &&
    Number.isFinite(assistantLocation.latitude) &&
    Number.isFinite(assistantLocation.longitude);

  return {
    locationLabel,
    latitude: shouldAttachCoordinates ? assistantLocation.latitude : null,
    longitude: shouldAttachCoordinates ? assistantLocation.longitude : null,
    product: searchForm.product,
    minPrice: searchForm.minPrice,
    maxPrice: searchForm.maxPrice,
    maxDistanceKm: getMaxDistance(searchForm)
  };
}

function MessageText({ text }) {
  if (!text) {
    return null;
  }

  const weatherResult = parseWeatherResult(text);

  if (weatherResult) {
    return <WeatherCard weather={weatherResult} />;
  }

  const localBusinessResults = parseLocalBusinessResults(text);

  if (localBusinessResults) {
    return <LocalBusinessResults resultsData={localBusinessResults} />;
  }

  return text.split(/(https?:\/\/[^\s)]+)/gi).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) {
      return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    }

    return (
      <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>
        {formatCompactUrl(part)}
      </a>
    );
  });
}

function parseWeatherResult(text) {
  const value = String(text || "").trim();

  if (!/^Live weather for /i.test(value)) {
    return null;
  }

  const lines = value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine = lines[0] || "";
  const weather = {
    location: titleLine.replace(/^Live weather for\s*/i, "").replace(/:$/, ""),
    temperature: "",
    condition: "",
    highLow: "",
    rainChance: "",
    humidity: "",
    wind: "",
    precipitation: "",
    hourly: [],
    daily: [],
    source: ""
  };
  let listMode = "";

  lines.slice(1).forEach((line) => {
    if (/^Hourly forecast:/i.test(line)) {
      listMode = "hourly";
      return;
    }

    if (/^Daily forecast:/i.test(line)) {
      listMode = "daily";
      return;
    }

    if (line.startsWith("-")) {
      const item = line.replace(/^-\s*/, "");
      if (listMode === "hourly") weather.hourly.push(item);
      else if (listMode === "daily") weather.daily.push(item);
      return;
    }

    listMode = "";
    const fieldMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (!fieldMatch) return;

    const label = fieldMatch[1].toLowerCase();
    const fieldValue = fieldMatch[2];

    if (label === "current temperature" || label === "temperature") weather.temperature = fieldValue;
    else if (label === "condition") weather.condition = fieldValue;
    else if (label === "high/low") weather.highLow = fieldValue;
    else if (label === "chance of rain") weather.rainChance = fieldValue;
    else if (label === "humidity") weather.humidity = fieldValue;
    else if (label === "wind") weather.wind = fieldValue;
    else if (label === "precipitation") weather.precipitation = fieldValue;
    else if (label === "source") weather.source = fieldValue;
  });

  return weather.temperature || weather.condition || weather.highLow || weather.hourly.length || weather.daily.length
    ? weather
    : null;
}

function WeatherCard({ weather }) {
  return (
    <div className="weather-card">
      <div className="weather-card-header">
        <div>
          <p className="eyebrow">Live Weather</p>
          <h4>{weather.location}</h4>
        </div>
        <CloudSun size={28} />
      </div>

      <div className="weather-current">
        <strong>{weather.temperature || "Temperature not listed"}</strong>
        <span>{weather.condition || "Condition not listed"}</span>
      </div>

      <div className="weather-facts">
        {weather.highLow && (
          <span>
            <Thermometer size={14} />
            {weather.highLow}
          </span>
        )}
        {weather.rainChance && (
          <span>
            <Droplets size={14} />
            {weather.rainChance} rain
          </span>
        )}
        {weather.wind && <span>{weather.wind}</span>}
        {weather.humidity && <span>{weather.humidity} humidity</span>}
      </div>

      {weather.hourly.length > 0 && (
        <div className="weather-forecast">
          <strong>Hourly</strong>
          <ul>
            {weather.hourly.slice(0, 6).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {weather.daily.length > 0 && (
        <div className="weather-forecast">
          <strong>
            <CalendarDays size={14} />
            Daily
          </strong>
          <ul>
            {weather.daily.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {weather.source && <p className="weather-source">Source: {weather.source}</p>}
    </div>
  );
}

function parseLocalBusinessResults(text) {
  const value = String(text || "").trim();

  if (!/^Live (?:local results|Google Maps business listings)/i.test(value) || !/\d+\.\s*(?:Business|Restaurant) name:/i.test(value)) {
    return null;
  }

  const firstResultIndex = value.search(/\n\s*1\.\s*(?:Business|Restaurant) name:/i);
  const heading = firstResultIndex > -1 ? value.slice(0, firstResultIndex).trim() : "Live local results";
  const resultText = firstResultIndex > -1 ? value.slice(firstResultIndex).trim() : value;
  const blocks = resultText.match(/\d+\.\s*(?:Business|Restaurant) name:[\s\S]*?(?=\n\s*\d+\.\s*(?:Business|Restaurant) name:|$)/gi) || [];
  const results = blocks.map(parseLocalBusinessBlock).filter(Boolean);

  return results.length ? { heading, results } : null;
}

function parseLocalBusinessBlock(block) {
  const lines = block
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const business = {
    name: "",
    rating: "",
    reviewCount: "",
    reviewHighlights: [],
    address: "",
    phone: "",
    website: "",
    googleMapsUrl: "",
    openStatus: "",
    type: "",
    why: "",
    source: ""
  };
  let readingHighlights = false;

  lines.forEach((line) => {
    const nameMatch = line.match(/^\d+\.\s*(?:Business|Restaurant) name:\s*(.*)$/i);

    if (nameMatch) {
      business.name = nameMatch[1];
      readingHighlights = false;
      return;
    }

    if (/^Review highlights:/i.test(line)) {
      readingHighlights = true;
      return;
    }

    if (readingHighlights && line.startsWith("-")) {
      business.reviewHighlights.push(line.replace(/^-\s*/, ""));
      return;
    }

    readingHighlights = false;

    const fieldMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (!fieldMatch) return;

    const label = fieldMatch[1].toLowerCase();
    const fieldValue = fieldMatch[2];

    if (label === "rating") business.rating = fieldValue;
    else if (label === "number of reviews" || label === "review count") business.reviewCount = fieldValue;
    else if (label === "address" || label === "address/location") business.address = fieldValue;
    else if (label === "phone") business.phone = fieldValue;
    else if (label === "website") business.website = fieldValue;
    else if (label === "google maps url") business.googleMapsUrl = fieldValue;
    else if (label === "open/closed status") business.openStatus = fieldValue;
    else if (label === "business category/type" || label === "type of business") business.type = fieldValue;
    else if (label === "why recommended" || label === "why listed") business.why = fieldValue;
    else if (label === "source") business.source = fieldValue;
  });

  return business.name ? business : null;
}

function LocalBusinessResults({ resultsData }) {
  return (
    <div className="local-results">
      <p className="local-results-heading">{resultsData.heading}</p>
      <div className="local-result-grid">
        {resultsData.results.map((business, index) => (
          <article className="local-result-card" key={`${business.name}-${index}`}>
            <div>
              <h4>{business.name}</h4>
              <p className="local-result-type">{business.type || "Local business"}</p>
            </div>

            <div className="local-result-facts">
              <span>
                <Star size={14} />
                {business.rating || "Rating not available"}
              </span>
              <span>{business.reviewCount || "Reviews not available"}</span>
              <span>{business.openStatus || "Status not available"}</span>
            </div>

            <div className="local-result-detail">
              <strong>Address</strong>
              <span>{business.address || "Address not available"}</span>
            </div>

            <div className="local-result-detail">
              <strong>Phone</strong>
              <span>{isAvailableValue(business.phone) ? business.phone : "Phone not available"}</span>
            </div>

            <div className="local-result-detail">
              <strong>Reviews</strong>
              {business.reviewHighlights.length ? (
                <ul>
                  {business.reviewHighlights.slice(0, 3).map((snippet) => (
                    <li key={snippet}>{snippet}</li>
                  ))}
                </ul>
              ) : (
                <span>Reviews not available from live search.</span>
              )}
            </div>

            {business.why && <p className="local-result-why">{business.why}</p>}

            <div className="local-result-actions">
              {isAvailableUrl(business.googleMapsUrl) && (
                <a className="secondary-button local-action-button" href={business.googleMapsUrl} target="_blank" rel="noreferrer">
                  <MapPin size={15} />
                  Open in Google Maps
                </a>
              )}
              {isAvailableUrl(business.website) && (
                <a className="secondary-button local-action-button" href={business.website} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  Visit Website
                </a>
              )}
              {isAvailableValue(business.phone) && (
                <a className="secondary-button local-action-button" href={`tel:${formatTelLink(business.phone)}`}>
                  <PhoneCall size={15} />
                  Call Business
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function isAvailableValue(value) {
  return Boolean(value && !/^not available/i.test(value));
}

function isAvailableUrl(value) {
  if (!isAvailableValue(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatTelLink(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function formatCompactUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function MetricGrid({ metrics }) {
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <div className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}

function DetailGrid({ listing }) {
  return (
    <div className="detail-grid">
      <div>
        <span>Location</span>
        <strong>{listing.area}</strong>
      </div>
      <div>
        <span>Distance</span>
        <strong>{formatDistance(listing.distanceKm)}</strong>
      </div>
      <div>
        <span>Seller rating</span>
        <strong>{formatSellerSummary(listing.seller)}</strong>
      </div>
      <div>
        <span>Source</span>
        <strong>{listing.source || "Not listed"}</strong>
      </div>
    </div>
  );
}

function ListingImage({ listing }) {
  const imageUrl = listing?.mainImage || listing?.details?.mainImage;

  if (!imageUrl) {
    return <div className="listing-thumb placeholder">No image</div>;
  }

  return <img className="listing-thumb" src={imageUrl} alt={`${listing.product} listing`} loading="lazy" />;
}

function ListingCard({ listing, index }) {
  const risk = getScamRisk(listing);
  const batteryHealth = getBatteryHealth(listing);

  return (
    <article className="listing-card">
      <div className="rank-badge">#{index + 1}</div>
      <ListingImage listing={listing} />

      <div className="listing-card-main">
        <div className="listing-card-heading">
          <div>
            <p className="eyebrow">{listing.source || "Live listing"}</p>
            <h3>{listing.product || "Product listing"}</h3>
          </div>
          <strong className="table-price">{formatMoney(listing.price)}</strong>
        </div>

        <p className="listing-meta">
          {listing.area || "Location not listed"} · {formatDistance(listing.distanceKm)} · {listing.datePosted || "Date not listed"}
        </p>
        <p className="listing-card-description">
          {listing.description || listing.details?.description || "No description provided by the source."}
        </p>
        <p className="listing-card-reason">{listing.reason || "No deal analysis available yet."}</p>

        <div className="listing-facts">
          <span>
            <ExternalLink size={14} />
            {listing.source || "Source not listed"}
          </span>
          <span>
            <MapPin size={14} />
            {listing.area || "Location not listed"}
          </span>
          <span>
            <CheckCircle2 size={14} />
            {listing.condition || "Condition not listed"}
          </span>
          <span>
            <BatteryMedium size={14} />
            {batteryHealth}
          </span>
          <span>
            <Radar size={14} />
            Deal Score: {formatDealScore(listing.score)}
          </span>
          <span className={`risk-pill ${risk.className}`}>
            <ShieldCheck size={14} />
            {risk.label}
          </span>
        </div>
      </div>

      <div className="listing-card-actions">
        <div className={listing.insideRange ? "range-chip" : "range-chip outside"}>
          {formatDistance(listing.distanceKm)}
        </div>
        <div className="trust-mini">
          <Star size={16} />
          {formatSellerSummary(listing.seller)}
        </div>
        <ListingLink listing={listing} />
      </div>
    </article>
  );
}

function DealMap({ listings, onDropPin }) {
  return (
    <button className="deal-map" onClick={onDropPin} type="button" aria-label="Drop a location pin">
      <span className="map-grid-line vertical one" />
      <span className="map-grid-line vertical two" />
      <span className="map-grid-line horizontal one" />
      <span className="map-grid-line horizontal two" />
      <span className="user-marker">
        <MapPin size={17} />
      </span>

      {listings.map((listing, index) => (
        <span
          className={listing.insideRange ? "listing-marker" : "listing-marker outside"}
          style={{ left: `${listing.map.x}%`, top: `${listing.map.y}%` }}
          title={`${listing.product}: ${formatDistance(listing.distanceKm)}`}
          key={listing.id}
        >
          {index + 1}
        </span>
      ))}
    </button>
  );
}

function ListingLink({ listing }) {
  if (!listing?.listingUrl) {
    return <span className="unavailable-link">No direct listing link stored</span>;
  }

  return (
    <div className="listing-link-stack">
      <a className="map-link" href={listing.listingUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={16} />
        Open Listing
      </a>
      <span className="listing-url-label">{formatCompactUrl(listing.listingUrl)}</span>
    </div>
  );
}

function ListingDetails({ details, compact = false }) {
  if (!details) {
    return null;
  }

  const specs = details.specs || {};

  return (
    <div className={compact ? "listing-details compact" : "listing-details"}>
      {details.mainImage && (
        <img className="detail-image" src={details.mainImage} alt="Listing" loading="lazy" />
      )}

      <section className="listing-detail-section">
        <h4>Listing Description</h4>
        <p>{details.description || "No description provided"}</p>
      </section>

      <section className="listing-detail-section">
        <h4>Phone Specs</h4>
        <dl className="spec-list">
          <SpecRow label="Model" value={specs.model} />
          <SpecRow label="Source" value={specs.source || details.source} />
          <SpecRow label="Date Posted" value={specs.datePosted || details.datePosted} />
          <SpecRow label="Storage" value={specs.storage} />
          <SpecRow label="Colour" value={specs.colour} />
          <SpecRow label="Battery Health" value={specs.batteryHealth} />
          <SpecRow label="Condition" value={specs.condition} />
          <SpecRow label="Carrier" value={specs.carrier} />
          <SpecRow label="Accessories" value={specs.accessories} />
          <SpecRow label="Warranty" value={specs.warranty} />
          <SpecRow label="Damage / Issues" value={specs.damageIssues} />
        </dl>
      </section>

      <section className="listing-detail-section pros-cons">
        <div>
          <h4>Pros</h4>
          <ul>
            {(details.pros || []).map((pro) => (
              <li key={pro}>{pro}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Cons</h4>
          <ul>
            {(details.cons || []).map((con) => (
              <li key={con}>{con}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function SpecRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || "Not listed"}</dd>
    </>
  );
}

function FeaturedDeal({ title, icon, listing, note }) {
  if (!listing) return null;

  const risk = getScamRisk(listing);

  return (
    <article className="deal-card">
      <div className="deal-card-title">
        <span>{icon}</span>
        <h3>{title}</h3>
      </div>
      <h4>Phone Type: {listing.product}</h4>
      <div className="featured-deal-summary">
        <ListingImage listing={listing} />
        <div>
          <strong className="table-price">{formatMoney(listing.price)}</strong>
          <span>{listing.area || "Location not listed"}</span>
        </div>
      </div>
      <div className="listing-facts compact">
        <span>
          <CheckCircle2 size={14} />
          {listing.condition || "Condition not listed"}
        </span>
        <span>
          <BatteryMedium size={14} />
          {getBatteryHealth(listing)}
        </span>
        <span>
          <Radar size={14} />
          Deal Score: {formatDealScore(listing.score)}
        </span>
        <span className={`risk-pill ${risk.className}`}>
          <ShieldCheck size={14} />
          {risk.label}
        </span>
      </div>
      <DetailGrid listing={listing} />
      <p>{note}</p>
      <ListingLink listing={listing} />
      {!listing.insideRange && <span className="outside-label">Outside Preferred Range</span>}
    </article>
  );
}

function TrustCard({ listing }) {
  return (
    <article className="trust-card">
      <div className="trust-header">
        <h3>{listing.product}</h3>
        <strong>{listing.trustScore}/100</strong>
      </div>
      <div className="trust-bars">
        <TrustLine label="Rating" value={(listing.seller.rating / 5) * 100} />
        <TrustLine label="Reviews" value={Math.min(listing.seller.reviews, 100)} />
        <TrustLine label="Sales" value={Math.min((listing.seller.completedSales / 35) * 100, 100)} />
      </div>
      <p>{listing.seller.sentiment}</p>
      <div className="trust-tags">
        <span>{listing.seller.accountAgeYears} yr account</span>
        <span>{listing.seller.completedSales} sales</span>
        {listing.seller.verified && <span>verified</span>}
      </div>
    </article>
  );
}

function TrustLine({ label, value }) {
  return (
    <div className="trust-line">
      <span>{label}</span>
      <div>
        <i style={{ width: `${Math.round(value)}%` }} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
