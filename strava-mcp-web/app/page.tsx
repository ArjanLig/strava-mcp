"use client";

import { useState } from "react";

const MCP_URL = "https://strava-mcp-web.vercel.app/mcp";

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"cloud" | "desktop">("cloud");
  const [os, setOs] = useState<"mac" | "win">("mac");

  async function handleCopy() {
    const text = tab === "cloud" ? MCP_URL : DESKTOP_CONFIG;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>Strava for Claude</h1>
        <p className="subtitle">
          Turn Claude into your personal cycling coach. This MCP server connects
          your Strava data to Claude — giving it real-time access to your
          activities, training load, and fitness trends.
        </p>
      </div>

      <div className="tab-bar">
        <button
          className={`tab ${tab === "cloud" ? "active" : ""}`}
          onClick={() => setTab("cloud")}
        >
          Claude.ai / Pro
        </button>
        <button
          className={`tab ${tab === "desktop" ? "active" : ""}`}
          onClick={() => setTab("desktop")}
        >
          Claude Desktop / Free
        </button>
      </div>

      {tab === "cloud" ? (
        <section className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h2>Create a Strava API app</h2>
              <p className="step-description">
                This takes about 2 minutes. You need a free Strava API app so Claude
                can access your data.
              </p>
              <ol className="substeps">
                <li>
                  Go to{" "}
                  <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">
                    strava.com/settings/api
                  </a>
                </li>
                <li>
                  Fill in the form — the <strong>Application Name</strong>,{" "}
                  <strong>Category</strong>, and <strong>Description</strong> can be
                  anything (e.g. &quot;My Claude connector&quot;)
                </li>
                <li>
                  Set <strong>Authorization Callback Domain</strong> to{" "}
                  <code className="inline-code">strava-mcp-web.vercel.app</code>
                </li>
                <li>
                  Click <strong>Create</strong> and note your{" "}
                  <strong>Client ID</strong> and <strong>Client Secret</strong> —
                  you will need these in the next step
                </li>
              </ol>
            </div>
          </div>

          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h2>Add to Claude</h2>
              <ol className="substeps">
                <li>
                  Open{" "}
                  <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">claude.ai</a>{" "}
                  (requires Pro or Max subscription)
                </li>
                <li>
                  Go to <strong>Settings → Connectors → Add custom connector</strong>
                </li>
                <li>
                  Paste this URL and save:
                  <div className="url-box" style={{ marginTop: 8 }}>
                    <code className="url-text">{MCP_URL}</code>
                    <button className="copy-button" onClick={handleCopy}>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </li>
                <li>
                  Click <strong>Connect</strong> on the newly added connector —
                  this will open a page where you enter your Strava API credentials
                  and authorize access
                </li>
              </ol>
            </div>
          </div>
        </section>
      ) : (
        <section className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h2>Create a Strava API app</h2>
              <p className="step-description">
                This takes about 2 minutes. You need a free Strava API app so Claude
                can access your data.
              </p>
              <ol className="substeps">
                <li>
                  Go to{" "}
                  <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">
                    strava.com/settings/api
                  </a>
                </li>
                <li>
                  Fill in the form — the <strong>Application Name</strong>,{" "}
                  <strong>Category</strong>, and <strong>Description</strong> can be
                  anything (e.g. &quot;My Claude connector&quot;)
                </li>
                <li>
                  Set <strong>Authorization Callback Domain</strong> to{" "}
                  <code className="inline-code">localhost</code>
                </li>
                <li>
                  Click <strong>Create</strong> and note your{" "}
                  <strong>Client ID</strong> and <strong>Client Secret</strong>
                </li>
              </ol>
            </div>
          </div>

          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h2>Install &amp; connect</h2>

              <div className="os-tabs">
                <button className={`os-tab ${os === "mac" ? "active" : ""}`} onClick={() => setOs("mac")}>Mac / Linux</button>
                <button className={`os-tab ${os === "win" ? "active" : ""}`} onClick={() => setOs("win")}>Windows</button>
              </div>

              {os === "mac" ? (
                <>
                  <p className="step-description">
                    Open <strong>Terminal</strong> (press <code className="inline-code">⌘ + Space</code>, type
                    {" "}<code className="inline-code">Terminal</code>, press Enter) and paste this command:
                  </p>
                  <div className="url-box">
                    <code className="url-text" style={{ fontSize: "0.8rem" }}>{INSTALL_CMD}</code>
                    <button className="copy-button" onClick={() => {
                      navigator.clipboard.writeText(INSTALL_CMD);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="step-description" style={{ marginTop: 10 }}>
                    It will ask for your Client ID and Client Secret from step 1,
                    open a browser to authorize with Strava, and add the server to
                    Claude Desktop automatically. Restart Claude Desktop when done.
                  </p>
                </>
              ) : (
                <>
                  <p className="step-description">
                    Open <strong>PowerShell</strong> (press <code className="inline-code">Win + X</code>, click
                    {" "}<strong>Terminal</strong> or <strong>PowerShell</strong>) and paste this command:
                  </p>
                  <div className="url-box">
                    <code className="url-text" style={{ fontSize: "0.75rem" }}>{WIN_INSTALL_CMD}</code>
                    <button className="copy-button" onClick={() => {
                      navigator.clipboard.writeText(WIN_INSTALL_CMD);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="step-description" style={{ marginTop: 10 }}>
                    This will install Python (if needed), set up the MCP server,
                    connect your Strava account, and configure Claude Desktop
                    automatically. Restart Claude Desktop when done.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="features">
        <h2>What Claude can do with your Strava data</h2>
        <div className="feature-grid">
          <div className="feature">
            <h3>Training load analysis</h3>
            <p>
              ATL, CTL, and TSB metrics with actionable advice — rest, easy,
              moderate, or hard training recommendations.
            </p>
          </div>
          <div className="feature">
            <h3>Weekly training plan</h3>
            <p>
              Recommended hours and workout types based on your current fitness
              and fatigue levels.
            </p>
          </div>
          <div className="feature">
            <h3>Activity insights</h3>
            <p>
              Deep dives into your rides — power, heart rate, speed, suffer
              score, and how it fits your broader plan.
            </p>
          </div>
          <div className="feature">
            <h3>Progress tracking</h3>
            <p>
              Weekly volume trends, ramp rate monitoring, and injury risk
              warnings when you build too fast.
            </p>
          </div>
        </div>
      </section>

      <section className="examples">
        <h2>Example conversations</h2>
        <ul>
          <li>&quot;I want to ride tonight, what should I do?&quot;</li>
          <li>&quot;How is my training load looking?&quot;</li>
          <li>&quot;Give me a training plan for this week&quot;</li>
          <li>&quot;How did my last ride compare to the week before?&quot;</li>
          <li>&quot;I&apos;m training for a 150km race in April — am I on track?&quot;</li>
        </ul>
      </section>

      <footer className="footer">
        <a
          href="https://github.com/ArjanLig/strava-mcp"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
        {" · "}
        <a href="/privacy">Privacy Policy</a>
      </footer>
    </main>
  );
}

const INSTALL_CMD = "curl -fsSL https://raw.githubusercontent.com/ArjanLig/strava-mcp/main/install.sh | bash";

const WIN_INSTALL_CMD = "irm https://raw.githubusercontent.com/ArjanLig/strava-mcp/main/install.ps1 | iex";

const DESKTOP_CONFIG = `{
  "mcpServers": {
    "strava": {
      "command": "strava-training-mcp",
      "args": []
    }
  }
}`;
