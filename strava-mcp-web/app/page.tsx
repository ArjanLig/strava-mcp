"use client";

import { useState } from "react";

const MCP_URL = "https://strava-mcp-web.vercel.app/mcp";

export default function Home() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(MCP_URL);
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

      <section className="steps">
        <div className="step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h2>Install Claude</h2>
            <p className="step-description">
              Download{" "}
              <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer">
                Claude Desktop
              </a>{" "}
              or use{" "}
              <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">
                claude.ai
              </a>{" "}
              — works with any plan, including free.
              Free plans can add 1 custom connector (remove any existing connector first), Pro and Max are unlimited.
            </p>
          </div>
        </div>

        <div className="step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h2>Create a Strava API app</h2>
            <p className="step-description">
              This takes about 2 minutes. You need a free Strava API app so
              Claude can access your data.
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
                <strong>Category</strong>, and <strong>Description</strong> can
                be anything (e.g. &quot;My Claude connector&quot;)
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
          <div className="step-number">3</div>
          <div className="step-content">
            <h2>Connect to Claude</h2>
            <ol className="substeps">
              <li>
                Open Claude Desktop or{" "}
                <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">claude.ai</a>
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
            <h3>Gear maintenance</h3>
            <p>
              Track km on your bikes and shoes with automatic warnings when
              chain, cassette, or tires need replacing.
            </p>
          </div>
          <div className="feature">
            <h3>Power curve &amp; FTP</h3>
            <p>
              Best power outputs across durations, FTP estimation, and
              month-over-month comparison.
            </p>
          </div>
          <div className="feature">
            <h3>HR zone distribution</h3>
            <p>
              Time-in-zone analysis with polarized training advice — are you
              spending enough time in Z2?
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
          <li>&quot;Check the quality of my last interval workout&quot;</li>
          <li>&quot;When do I need to replace my chain?&quot;</li>
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
