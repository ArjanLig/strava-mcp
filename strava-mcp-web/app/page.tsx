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
            <h2>Copy the MCP URL</h2>
            <div className="url-box">
              <code className="url-text">{MCP_URL}</code>
              <button className="copy-button" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h2>Add to Claude Desktop</h2>
            <p className="step-description">
              Open Claude Desktop, go to{" "}
              <strong>Settings → Connectors → Add custom connector</strong>,
              paste the URL, and connect. Claude will ask you to authorize with
              Strava on first use.
            </p>
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
          <li>"I want to ride tonight, what should I do?"</li>
          <li>"How is my training load looking?"</li>
          <li>"Give me a training plan for this week"</li>
          <li>"How did my last ride compare to the week before?"</li>
          <li>"I'm training for a 150km race in April — am I on track?"</li>
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
      </footer>
    </main>
  );
}
