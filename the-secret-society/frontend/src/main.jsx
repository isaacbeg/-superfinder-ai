import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  Copy,
  Diamond,
  Eraser,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Save,
  Sparkles,
  Trash2,
  Vault
} from "lucide-react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://localhost:5002");

const agents = [
  {
    id: "deal-hunter",
    name: "Deal Hunter",
    tagline: "Find, compare, and rank marketplace deals.",
    icon: BriefcaseBusiness,
    placeholder: "Example: I want an iPhone 16 Pro Max under $1200 near Vaughan",
    prompt: "Manual listing mode. Search links first, pasted listing ranking next."
  }
];

function App() {
  const [page, setPage] = useState("landing");
  const [currentAgentId, setCurrentAgentId] = useState(agents[0].id);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [agentInput, setAgentInput] = useState("");
  const [dealListingsText, setDealListingsText] = useState("");
  const [agentResult, setAgentResult] = useState(null);
  const [dealHunterTab, setDealHunterTab] = useState("live");
  const [researchForm, setResearchForm] = useState({
    item: "",
    budget: "",
    location: "",
    category: "phone"
  });
  const [researchResult, setResearchResult] = useState(null);
  const [manualListingResult, setManualListingResult] = useState(null);
  const [savedResults, setSavedResults] = useState([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const currentAgent = useMemo(
    () => agents.find((agent) => agent.id === currentAgentId) || agents[0],
    [currentAgentId]
  );

  useEffect(() => {
    loadSavedResults();
  }, []);

  function enterSociety() {
    setPage(isLoggedIn ? "dashboard" : "login");
  }

  function fakeLogin(event) {
    event.preventDefault();
    setIsLoggedIn(true);
    setStatus("Access granted.");
    setPage("dashboard");
  }

  function openAgent(agentId) {
    setCurrentAgentId(agentId);
    setAgentInput("");
    setDealListingsText("");
    setAgentResult(null);
    setResearchResult(null);
    setManualListingResult(null);
    setDealHunterTab("live");
    setStatus("");
    setPage("workspace");
  }

  async function loadSavedResults() {
    try {
      const response = await fetch(`${API_URL}/api/results`);
      const data = await response.json();
      setSavedResults(data);
    } catch {
      setStatus("Backend not connected yet. Start it with npm run dev:backend.");
    }
  }

  async function generateAgentOutput() {
    const cleanInput = agentInput.trim();

    if (!cleanInput) {
      setStatus("Write a request for the agent first.");
      return;
    }

    setIsLoading(true);
    setStatus("Working...");

    try {
      const response = await fetch(`${API_URL}/api/agents/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: currentAgent.id,
          input: cleanInput,
          listingsText: dealListingsText
        })
      });

      if (!response.ok) {
        throw new Error("Agent failed");
      }

      const result = await response.json();
      setAgentResult(result);
      setStatus(currentAgent.id === "deal-hunter" ? "Manual deal result ready." : "Result ready.");
    } catch {
      setStatus("Could not generate. Make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  }

  function clearResult() {
    setAgentResult(null);
    setResearchResult(null);
    setManualListingResult(null);
    setStatus("Result cleared.");
  }

  function updateResearchForm(field, value) {
    setResearchForm((current) => ({ ...current, [field]: value }));
  }

  function getDealRequestText() {
    if (agentInput.trim()) {
      return agentInput.trim();
    }

    return `${researchForm.item} under ${researchForm.budget || "any budget"} near ${researchForm.location}`.trim();
  }

  async function researchLiveDeals() {
    if (!agentInput.trim() && !researchForm.item.trim()) {
      setStatus("Enter an item or a full deal request first.");
      return;
    }

    setIsLoading(true);
    setStatus("Searching SerpAPI Google Shopping...");

    const params = new URLSearchParams({
      q: agentInput.trim(),
      item: researchForm.item,
      budget: researchForm.budget,
      location: researchForm.location,
      category: researchForm.category
    });

    try {
      const response = await fetch(`${API_URL}/api/research?${params}`);

      if (!response.ok) {
        throw new Error("Research failed");
      }

      const result = await response.json();
      setResearchResult(result);
      setStatus(result.results.length ? "Live research complete." : result.summary || "API not connected.");
    } catch {
      setStatus("Could not research deals. Make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  }

  async function analyzeManualListings() {
    const input = getDealRequestText();

    if (!input || !dealListingsText.trim()) {
      setStatus("Enter a deal request and paste at least one Facebook listing.");
      return;
    }

    setIsLoading(true);
    setStatus("Analyzing pasted Facebook listings...");

    try {
      const response = await fetch(`${API_URL}/api/analyze-listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          listingsText: dealListingsText
        })
      });

      if (!response.ok) {
        throw new Error("Analyze failed");
      }

      const result = await response.json();
      setManualListingResult(result);
      setStatus("Manual listings ranked.");
    } catch {
      setStatus("Could not analyze listings. Make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveResult() {
    const activeDealResult = dealHunterTab === "live" ? researchResult : manualListingResult;
    const isDealHunter = currentAgent.id === "deal-hunter";

    if (isDealHunter && activeDealResult) {
      const output = activeDealResult.textOutput || activeDealResult.summary;
      const resultToSave = {
        title: dealHunterTab === "live" ? "Deal Hunter live research" : "Deal Hunter manual listing analysis",
        agentName: currentAgent.name,
        userInput: dealHunterTab === "live" ? getDealRequestText() : `${getDealRequestText()}\n\n${dealListingsText}`,
        output,
        summary: output,
        payload: activeDealResult
      };

      try {
        const response = await fetch(`${API_URL}/api/save-result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resultToSave)
        });

        if (!response.ok) {
          throw new Error("Save failed");
        }

        const saved = await response.json();
        setSavedResults((current) => [saved, ...current]);
        setStatus("Saved to the vault.");
        setDealHunterTab("saved");
      } catch {
        setStatus("Could not save. Make sure the backend is running.");
      }

      return;
    }

    if (!agentResult?.textOutput) {
      setStatus("Generate an output before saving.");
      return;
    }

    const fullInput =
      currentAgent.id === "deal-hunter" && dealListingsText.trim()
        ? `${agentInput}\n\nPasted listings:\n${dealListingsText}`
        : agentInput;
    const resultToSave = {
      title: agentResult.title || `${currentAgent.name} result`,
      agentName: currentAgent.name,
      userInput: fullInput,
      output: agentResult.textOutput
    };

    try {
      const response = await fetch(`${API_URL}/api/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resultToSave)
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      const saved = await response.json();
      setSavedResults((current) => [saved, ...current]);
      setStatus("Saved to the vault.");
      setPage("saved");
    } catch {
      setStatus("Could not save. Make sure the backend is running.");
    }
  }

  async function deleteResult(id) {
    try {
      const response = await fetch(`${API_URL}/api/results/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setSavedResults((current) => current.filter((result) => result.id !== id));
    } catch {
      setStatus("Could not delete. Make sure the backend is running.");
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch {
      setStatus("Copy failed. Select the text and copy it manually.");
    }
  }

  return (
    <div className="app">
      <TopNav
        page={page}
        setPage={setPage}
        isLoggedIn={isLoggedIn}
        enterSociety={enterSociety}
        openAgent={openAgent}
      />
      {status && <p className="status">{status}</p>}

      {page === "landing" && <LandingPage enterSociety={enterSociety} />}
      {page === "login" && (
        <LoginPage loginForm={loginForm} setLoginForm={setLoginForm} fakeLogin={fakeLogin} />
      )}
      {page === "dashboard" && <DashboardPage openAgent={openAgent} setPage={setPage} />}
      {page === "workspace" && (
        <WorkspacePage
          agent={currentAgent}
          agentInput={agentInput}
          setAgentInput={setAgentInput}
          dealListingsText={dealListingsText}
          setDealListingsText={setDealListingsText}
          dealHunterTab={dealHunterTab}
          setDealHunterTab={setDealHunterTab}
          researchForm={researchForm}
          updateResearchForm={updateResearchForm}
          researchResult={researchResult}
          manualListingResult={manualListingResult}
          agentResult={agentResult}
          isLoading={isLoading}
          generateAgentOutput={generateAgentOutput}
          researchLiveDeals={researchLiveDeals}
          analyzeManualListings={analyzeManualListings}
          clearResult={clearResult}
          saveResult={saveResult}
          savedResults={savedResults}
          deleteResult={deleteResult}
          copyText={copyText}
          setPage={setPage}
        />
      )}
      {page === "saved" && (
        <SavedPage savedResults={savedResults} deleteResult={deleteResult} copyText={copyText} />
      )}
    </div>
  );
}

function TopNav({ page, setPage, isLoggedIn, enterSociety, openAgent }) {
  return (
    <header className="nav">
      <button className="brand" onClick={() => setPage("landing")} aria-label="Go to landing page">
        <Diamond size={20} />
        <span>SUPERFINDERX</span>
      </button>
      <div className="nav-actions">
        {isLoggedIn && (
          <>
            <button onClick={() => openAgent("deal-hunter")}>Deal Hunter</button>
            <button onClick={() => setPage("saved")}>Saved Deals</button>
          </>
        )}
        {page !== "login" && (
          <button className="gold-button small" onClick={enterSociety}>
            <KeyRound size={16} />
            Open
          </button>
        )}
      </div>
    </header>
  );
}

function LandingPage({ enterSociety }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-backdrop" />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow">Deal Hunter</p>
          <h1>SUPERFINDERX</h1>
          <p className="hero-subtitle">Search, compare, and save product deals.</p>
          <button className="gold-button" onClick={enterSociety}>
            Open Deal Hunter
          </button>
        </div>
      </section>

      <section className="agent-preview">
        {agents.map((agent) => {
          const Icon = agent.icon;
          return (
            <article className="preview-card" key={agent.id}>
              <Icon size={22} />
              <h2>{agent.name}</h2>
              <p>{agent.tagline}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function LoginPage({ loginForm, setLoginForm, fakeLogin }) {
  return (
    <main className="center-stage">
      <section className="login-panel">
        <div className="seal">
          <Vault size={28} />
        </div>
        <p className="eyebrow">Member Access</p>
        <h1>Enter the room</h1>
        <form onSubmit={fakeLogin}>
          <label>
            Username
            <input
              value={loginForm.username}
              onChange={(event) =>
                setLoginForm((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="founder"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="anything works for now"
            />
          </label>
          <button className="gold-button" type="submit">
            Open Deal Hunter
          </button>
        </form>
      </section>
    </main>
  );
}

function DashboardPage({ openAgent, setPage }) {
  return (
    <main className="dashboard">
      <section className="dashboard-heading">
        <p className="eyebrow">Deal Hunter</p>
        <h1>Search products.</h1>
        <button onClick={() => setPage("saved")} className="ghost-button">
          <Vault size={17} />
          Saved Deals
        </button>
      </section>

      <section className="agent-grid">
        {agents.map((agent) => {
          const Icon = agent.icon;
          return (
            <button className="agent-card" key={agent.id} onClick={() => openAgent(agent.id)}>
              <span className="agent-icon">
                <Icon size={25} />
              </span>
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.tagline}</small>
              </span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function WorkspacePage({
  agent,
  agentInput,
  setAgentInput,
  dealListingsText,
  setDealListingsText,
  dealHunterTab,
  setDealHunterTab,
  researchForm,
  updateResearchForm,
  researchResult,
  manualListingResult,
  agentResult,
  isLoading,
  generateAgentOutput,
  researchLiveDeals,
  analyzeManualListings,
  clearResult,
  saveResult,
  savedResults,
  deleteResult,
  copyText,
  setPage
}) {
  const isDealHunter = agent.id === "deal-hunter";

  if (isDealHunter) {
    return (
      <DealHunterWorkspace
        agent={agent}
        agentInput={agentInput}
        setAgentInput={setAgentInput}
        dealListingsText={dealListingsText}
        setDealListingsText={setDealListingsText}
        dealHunterTab={dealHunterTab}
        setDealHunterTab={setDealHunterTab}
        researchForm={researchForm}
        updateResearchForm={updateResearchForm}
        researchResult={researchResult}
        manualListingResult={manualListingResult}
        isLoading={isLoading}
        researchLiveDeals={researchLiveDeals}
        analyzeManualListings={analyzeManualListings}
        clearResult={clearResult}
        saveResult={saveResult}
        savedResults={savedResults}
        deleteResult={deleteResult}
        copyText={copyText}
        setPage={setPage}
      />
    );
  }

  return (
    <main className="workspace">
      <section className="workspace-head">
        <button className="back-button" onClick={() => setPage("dashboard")}>
          <ArrowLeft size={17} />
          Deal Hunter
        </button>
        <p className="eyebrow">{agent.prompt}</p>
        <h1>{agent.name}</h1>
      </section>

      <section className="workspace-grid upgraded">
        <div className="work-panel input-stack">
          <label>
            Request
            <textarea
              value={agentInput}
              onChange={(event) => setAgentInput(event.target.value)}
              placeholder={agent.placeholder}
            />
          </label>

          <div className="button-row">
            <button className="gold-button" onClick={generateAgentOutput} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {isLoading ? "Working" : "Generate"}
            </button>
            <button className="ghost-button" onClick={clearResult}>
              <Eraser size={17} />
              Clear Result
            </button>
          </div>
        </div>

        <div className="work-panel output-panel upgraded-output">
          <div className="panel-title">
            <span>Output</span>
            {agentResult?.textOutput && (
              <button onClick={() => copyText(agentResult.textOutput)}>
                <Copy size={16} />
                Copy All
              </button>
            )}
          </div>

          <ResultRenderer result={agentResult} isLoading={isLoading} copyText={copyText} />

          <button className="ghost-button save-result" onClick={saveResult}>
            <Save size={17} />
            Save Result
          </button>
        </div>
      </section>
    </main>
  );
}

function DealHunterWorkspace({
  agent,
  agentInput,
  setAgentInput,
  dealListingsText,
  setDealListingsText,
  dealHunterTab,
  setDealHunterTab,
  researchForm,
  updateResearchForm,
  researchResult,
  manualListingResult,
  isLoading,
  researchLiveDeals,
  analyzeManualListings,
  clearResult,
  saveResult,
  savedResults,
  deleteResult,
  copyText,
  setPage
}) {
  const facebookSearchUrl = buildFacebookMarketplaceUrl(
    agentInput.trim() || [researchForm.item, researchForm.location].filter(Boolean).join(" ")
  );

  return (
    <main className="workspace">
      <section className="workspace-head">
        <button className="back-button" onClick={() => setPage("dashboard")}>
          <ArrowLeft size={17} />
          Deal Hunter
        </button>
        <p className="eyebrow">{agent.prompt}</p>
        <h1>{agent.name}</h1>
      </section>

      <div className="deal-tabs">
        <button className={dealHunterTab === "live" ? "active" : ""} onClick={() => setDealHunterTab("live")}>
          Live Research
        </button>
        <button className={dealHunterTab === "facebook" ? "active" : ""} onClick={() => setDealHunterTab("facebook")}>
          Facebook Manual Listings
        </button>
        <button className={dealHunterTab === "saved" ? "active" : ""} onClick={() => setDealHunterTab("saved")}>
          Saved Deals
        </button>
      </div>

      {dealHunterTab === "live" && (
        <section className="workspace-grid upgraded">
          <div className="work-panel input-stack">
            <label>
              Full request
              <textarea
                value={agentInput}
                onChange={(event) => setAgentInput(event.target.value)}
                placeholder="Find me an iPhone 16 Pro Max under $1,000 near Markham"
              />
            </label>

            <div className="research-fields">
              <label>
                Item name
                <input
                  value={researchForm.item}
                  onChange={(event) => updateResearchForm("item", event.target.value)}
                  placeholder="iPhone 16 Pro Max"
                />
              </label>
              <label>
                Budget
                <input
                  type="number"
                  value={researchForm.budget}
                  onChange={(event) => updateResearchForm("budget", event.target.value)}
                  placeholder="1000"
                />
              </label>
              <label>
                Location
                <input
                  value={researchForm.location}
                  onChange={(event) => updateResearchForm("location", event.target.value)}
                  placeholder="Markham, Ontario"
                />
              </label>
              <label>
                Category
                <select
                  value={researchForm.category}
                  onChange={(event) => updateResearchForm("category", event.target.value)}
                >
                  <option value="phone">phone</option>
                  <option value="car">car</option>
                  <option value="gaming">gaming</option>
                  <option value="clothing">clothing</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>

            <div className="button-row">
              <button className="gold-button" onClick={researchLiveDeals} disabled={isLoading}>
                {isLoading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                Research Deals
              </button>
              <button className="ghost-button" onClick={clearResult}>
                <Eraser size={17} />
                Clear Result
              </button>
            </div>
          </div>

          <div className="work-panel output-panel upgraded-output">
            <div className="panel-title">
              <span>Live Research</span>
              {researchResult?.summary && (
                <button onClick={() => copyText(researchResult.summary)}>
                  <Copy size={16} />
                  Copy Summary
                </button>
              )}
            </div>
            <LiveResearchResult result={researchResult} isLoading={isLoading} />
            <button className="ghost-button save-result" onClick={saveResult}>
              <Save size={17} />
              Save Result
            </button>
          </div>
        </section>
      )}

      {dealHunterTab === "facebook" && (
        <section className="workspace-grid upgraded">
          <div className="work-panel input-stack">
            <div className="manual-box">
              <p className="eyebrow">Facebook Manual Review Required</p>
              <p>
                This app does not scrape Facebook Marketplace, automate login, or auto-message sellers.
                Open Marketplace yourself, then paste listings here for scoring.
              </p>
              <a className="manual-search-link" href={facebookSearchUrl} target="_blank" rel="noreferrer">
                Open Marketplace Search
                <ExternalLink size={16} />
              </a>
            </div>
            <label>
              Deal request
              <textarea
                value={agentInput}
                onChange={(event) => setAgentInput(event.target.value)}
                placeholder="Find me an iPhone 16 Pro Max under $1,000 near Markham"
              />
            </label>
            <label>
              Paste Facebook listings
              <textarea
                className="listing-textarea"
                value={dealListingsText}
                onChange={(event) => setDealListingsText(event.target.value)}
                placeholder={`Paste one listing per line, for example:\niPhone 16 Pro Max 256GB - $1,050 - Vaughan - unlocked - 100% battery - minor scratches\niPhone 16 Pro Max 512GB - $1,180 - Toronto - iCloud locked - cracked`}
              />
            </label>
            <div className="button-row">
              <button className="gold-button" onClick={analyzeManualListings} disabled={isLoading}>
                {isLoading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                Analyze Listings
              </button>
              <button className="ghost-button" onClick={clearResult}>
                <Eraser size={17} />
                Clear Result
              </button>
            </div>
          </div>
          <div className="work-panel output-panel upgraded-output">
            <div className="panel-title">
              <span>Facebook Manual Listings</span>
              {manualListingResult?.textOutput && (
                <button onClick={() => copyText(manualListingResult.textOutput)}>
                  <Copy size={16} />
                  Copy All
                </button>
              )}
            </div>
            <ResultRenderer result={manualListingResult} isLoading={isLoading} copyText={copyText} />
            <button className="ghost-button save-result" onClick={saveResult}>
              <Save size={17} />
              Save Result
            </button>
          </div>
        </section>
      )}

      {dealHunterTab === "saved" && (
        <section className="work-panel saved-deals-panel">
          <SavedResultsGrid savedResults={savedResults} deleteResult={deleteResult} copyText={copyText} />
        </section>
      )}
    </main>
  );
}

function LiveResearchResult({ result, isLoading }) {
  if (isLoading) {
    return (
      <div className="loading-card">
        <LoaderCircle className="spin" size={28} />
        <p>Searching SerpAPI Google Shopping...</p>
      </div>
    );
  }

  if (!result) {
    return <div className="empty-output">Live research results will appear here. No demo or fake listings are shown.</div>;
  }

  const apiConnected = result.sourceStatuses?.some((source) => source.connected);

  return (
    <div className="structured-output">
      <section className="direct-card">
        <p className="eyebrow">Research Summary</p>
        <h2>{result.summary}</h2>
      </section>

      <ParsedRequestCard parsedRequest={result.request} />

      <section className="result-section">
        <h3>API Status</h3>
        <div className="source-status-grid">
          {result.sourceStatuses.map((source) => (
            <article className={source.connected ? "source-status connected" : "source-status"} key={source.name}>
              <strong>{source.name}</strong>
              <span>{source.connected ? `${source.count} found` : "API not connected"}</span>
              <p>{source.message}</p>
            </article>
          ))}
        </div>
      </section>

      {result.facebookManual && (
        <section className="result-section">
          <h3>Facebook Marketplace</h3>
          <div className="source-grid">
            <a href={result.facebookManual.url} target="_blank" rel="noreferrer">
              <span>Open Marketplace Search</span>
              <ExternalLink size={16} />
            </a>
          </div>
          <p className="manual-note">Manual Review Required. The app did not search Facebook live.</p>
        </section>
      )}

      {result.results.length === 0 ? (
        <div className="empty-output">
          {apiConnected ? "No products found from SerpAPI for this search." : "API not connected. Add SERPAPI_API_KEY to enable live research."}
        </div>
      ) : (
        <ResearchCards results={result.results} />
      )}
    </div>
  );
}

function ResearchCards({ results }) {
  return (
    <section className="result-section">
      <h3>Ranked Product Results</h3>
      <div className="research-card-grid">
        {results.map((result, index) => (
          <article className="research-card" key={`${result.source}-${result.link}-${index}`}>
            {result.image && <img src={result.image} alt="" />}
            <div className="listing-head">
              <span className="rank-badge">#{index + 1}</span>
              {(result.badges || []).map((badge) => (
                <span className={`deal-badge ${badgeClass(badge)}`} key={badge}>
                  {badge}
                </span>
              ))}
              <span className={`score-badge ${scoreClass(result.dealScore)}`}>{result.dealScore}/100</span>
            </div>
            <h4>{result.title}</h4>
            <div className="listing-facts">
              <span>{formatMoney(result.price)}</span>
              <span>{result.source}</span>
            </div>
            <div className="listing-values">
              <div>
                <span>Relevance</span>
                <strong>{result.relevanceScore}%</strong>
              </div>
              <div>
                <span>Price rank</span>
                <strong>{result.priceRank ? `#${result.priceRank}` : "N/A"}</strong>
              </div>
            </div>
            <TagList title="Red flags" items={result.redFlags} danger />
            {result.link && (
              <a className="result-link" href={result.link} target="_blank" rel="noreferrer">
                View result
                <ExternalLink size={16} />
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ResultRenderer({ result, isLoading, copyText }) {
  if (isLoading) {
    return (
      <div className="loading-card">
        <LoaderCircle className="spin" size={28} />
        <p>Building a direct answer...</p>
      </div>
    );
  }

  if (!result) {
    return <div className="empty-output">Your direct answer, breakdown, and next step will appear here.</div>;
  }

  return (
    <div className="structured-output">
      <section className="direct-card">
        <p className="eyebrow">Direct Answer</p>
        <h2>{result.directAnswer}</h2>
      </section>

      {result.metrics?.length > 0 && (
        <section className="metric-grid">
          {result.metrics.map((metric) => (
            <div className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </section>
      )}

      {result.parsedRequest && <ParsedRequestCard parsedRequest={result.parsedRequest} />}
      {result.searchLinks?.length > 0 && <SearchSources links={result.searchLinks} />}
      {result.listings?.length > 0 && <RankedListings listings={result.listings} copyText={copyText} />}

      <section className="result-section">
        <h3>Breakdown</h3>
        <ul>
          {result.breakdown.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="result-section recommendation-card">
        <h3>Recommendation / Next Step</h3>
        <p>{result.recommendation}</p>
      </section>

      <p className="save-hint">Saved output option: use the Save Result button below.</p>
    </div>
  );
}

function ParsedRequestCard({ parsedRequest }) {
  return (
    <section className="parsed-card">
      <div>
        <span>Item</span>
        <strong>{parsedRequest.itemName}</strong>
      </div>
      <div>
        <span>Budget</span>
        <strong>{parsedRequest.budget ? formatMoney(parsedRequest.budget) : "Not set"}</strong>
      </div>
      <div>
        <span>Location</span>
        <strong>{parsedRequest.location || "Not set"}</strong>
      </div>
    </section>
  );
}

function SearchSources({ links }) {
  return (
    <section className="result-section">
      <h3>Search Sources</h3>
      <div className="source-grid">
        {links.map((link) => (
          <a href={link.url} target="_blank" rel="noreferrer" key={link.name}>
            <span>{link.name}</span>
            <ExternalLink size={16} />
          </a>
        ))}
      </div>
      <p className="manual-note">These are manual search links. No live marketplace scraping is happening.</p>
    </section>
  );
}

function RankedListings({ listings, copyText }) {
  return (
    <section className="result-section">
      <h3>Ranked Listings</h3>
      <div className="listing-grid">
        {listings.map((listing, index) => (
          <article className="listing-card" key={`${listing.rawText}-${index}`}>
            <div className="listing-head">
              <span className="rank-badge">#{index + 1}</span>
              <span className={`score-badge ${scoreClass(listing.score)}`}>{listing.score}/100</span>
              <span className={`decision-badge ${listing.finalRecommendation.toLowerCase()}`}>
                {listing.finalRecommendation}
              </span>
            </div>

            <h4>{listing.itemName}</h4>
            <div className="listing-facts">
              <span>{formatMoney(listing.price)}</span>
              <span>{listing.location || "Unknown location"}</span>
              <span>{listing.storage || "Storage unknown"}</span>
            </div>

            <div className="listing-values">
              <div>
                <span>Estimated fair price</span>
                <strong>{formatMoney(listing.estimatedFairPrice)}</strong>
              </div>
              <div>
                <span>Offer price</span>
                <strong>{formatMoney(listing.negotiationOffer)}</strong>
              </div>
            </div>

            <TagList title="Good signs" items={listing.goodSigns} />
            <TagList title="Red flags" items={listing.redFlags} danger />
            <TagList title="Condition concerns" items={listing.conditionConcerns} danger />

            <div className="seller-message">
              <p>{listing.messages.firstMessage}</p>
              <button onClick={() => copyText(listing.messages.firstMessage)}>
                <Copy size={16} />
                Copy seller message
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TagList({ title, items, danger = false }) {
  if (!items?.length) {
    return null;
  }

  return (
    <div className={danger ? "tag-list danger" : "tag-list"}>
      <p>
        {danger && <AlertTriangle size={15} />}
        {title}
      </p>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function SavedPage({ savedResults, deleteResult, copyText }) {
  return (
    <main className="saved-page">
      <section className="dashboard-heading">
        <p className="eyebrow">Vault</p>
        <h1>Saved results.</h1>
      </section>

      <SavedResultsGrid savedResults={savedResults} deleteResult={deleteResult} copyText={copyText} />
    </main>
  );
}

function SavedResultsGrid({ savedResults, deleteResult, copyText }) {
  if (savedResults.length === 0) {
    return (
      <div className="empty-vault">
        <Vault size={34} />
        <p>No saved results yet.</p>
      </div>
    );
  }

  return (
    <section className="saved-grid">
      {savedResults.map((result) => (
        <article className="saved-card" key={result.id}>
          <p className="eyebrow">{result.agentName}</p>
          <h2>{result.title}</h2>
          <p className="saved-input">{result.userInput}</p>
          <pre>{result.output}</pre>
          <div className="saved-actions">
            <button onClick={() => copyText(result.output)}>
              <Copy size={16} />
              Copy
            </button>
            <button className="danger-button" onClick={() => deleteResult(result.id)}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function extractBudgetForUrl(text) {
  const match = String(text).match(/(?:under|below|max|budget|up to|less than)\s*\$?\s*([\d,]+)/i);
  return match ? match[1].replaceAll(",", "") : "";
}

function buildFacebookMarketplaceUrl(text) {
  const request = String(text || "").trim();
  const budget = extractBudgetForUrl(request);
  const query =
    request
      .replace(/^(find me|search for|looking for|i want|i need)\s+/i, "")
      .replace(/(?:under|below|max|budget|up to|less than)\s*\$?\s*[\d,]+/i, "")
      .replace(/\b(?:near|in|around|close to)\s+[a-zA-Z][a-zA-Z\s,-]+$/i, "")
      .replace(/\s+/g, " ")
      .trim() || request;
  const params = new URLSearchParams();

  if (query) params.set("query", query);
  if (budget) params.set("maxPrice", budget);

  return `https://www.facebook.com/marketplace/search/${params.toString() ? `?${params}` : ""}`;
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "Not found";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(number);
}

function scoreClass(score) {
  if (score >= 75) return "good";
  if (score >= 50) return "maybe";
  return "bad";
}

function badgeClass(badge) {
  if (badge === "Best Deal") return "best";
  if (badge === "Cheapest") return "cheap";
  if (badge === "Over Budget") return "over";
  return "";
}

createRoot(document.getElementById("root")).render(<App />);
