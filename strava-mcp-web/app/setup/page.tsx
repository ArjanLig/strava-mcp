"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SetupForm() {
  const searchParams = useSearchParams();
  const oauthState = searchParams.get("oauth_state") ?? "";
  const clientState = searchParams.get("client_state") ?? "";

  const [mode, setMode] = useState<"byoc" | "server">("byoc");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const callbackDomain = typeof window !== "undefined" ? window.location.hostname : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/strava-redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oauth_state: oauthState,
          client_state: clientState,
          mode,
          strava_client_id: mode === "byoc" ? clientId : undefined,
          strava_client_secret: mode === "byoc" ? clientSecret : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      window.location.href = data.redirect_url;
    } catch {
      setError("Failed to connect. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="hero">
        <h1>Connect your Strava</h1>
        <p className="subtitle">
          To use Strava for Claude, you need to connect your Strava account.
          Choose how you want to connect below.
        </p>
      </div>

      <div className="setup-options">
        <button
          className={`setup-option ${mode === "byoc" ? "active" : ""}`}
          onClick={() => setMode("byoc")}
        >
          <div className="option-header">
            <span className="option-badge">Recommended</span>
            <h2>Use your own Strava API app</h2>
          </div>
          <p>Create a free Strava API app and enter your credentials below. Takes about 2 minutes.</p>
        </button>

        <button
          className={`setup-option ${mode === "server" ? "active" : ""} disabled-option`}
          disabled
        >
          <div className="option-header">
            <span className="option-badge pending">Coming soon</span>
            <h2>Direct connect</h2>
          </div>
          <p>One-click connect without creating your own app. Available once our Strava app is approved.</p>
        </button>
      </div>

      {mode === "byoc" && (
        <form onSubmit={handleSubmit} className="setup-form">
          <div className="setup-instructions">
            <h3>How to get your credentials</h3>
            <ol>
              <li>
                Go to{" "}
                <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">
                  strava.com/settings/api
                </a>
              </li>
              <li>Create an API application (any name/description works)</li>
              <li>
                Set <strong>Authorization Callback Domain</strong> to:{" "}
                <code>{callbackDomain}</code>
              </li>
              <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> below</li>
            </ol>
          </div>

          <div className="form-field">
            <label htmlFor="clientId">Client ID</label>
            <input
              id="clientId"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 12345"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="clientSecret">Client Secret</label>
            <input
              id="clientSecret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Your client secret"
              required
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? "Connecting..." : "Connect with Strava"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupForm />
    </Suspense>
  );
}
