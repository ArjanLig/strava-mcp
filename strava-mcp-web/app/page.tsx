"use client";

import { useState } from "react";

const MCP_URL = "https://strava-mcp.vercel.app/mcp";

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
          Connect your Strava account to Claude and ask questions about your
          training, activities, and performance — in plain English.
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
              <strong>Settings → Integrations</strong>, paste the URL, and save.
              Claude will prompt you to authorize with Strava the first time you
              ask a Strava question.
            </p>
          </div>
        </div>
      </section>

      <section className="note">
        <p>
          Strava authorization happens automatically — Claude will guide you
          through connecting your account on first use.
        </p>
      </section>

      <section className="examples">
        <h2>What you can ask Claude</h2>
        <ul>
          <li>"How many kilometers did I run last month?"</li>
          <li>"What was my longest ride this year?"</li>
          <li>"Show me my 5 most recent activities."</li>
          <li>"What's my average pace over the last 10 runs?"</li>
          <li>"How does this week compare to last week?"</li>
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
