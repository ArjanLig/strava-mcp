export default function PrivacyPolicy() {
  return (
    <main className="container">
      <div className="hero">
        <h1>Privacy Policy</h1>
        <p className="subtitle">Last updated: March 19, 2026</p>
      </div>

      <div className="privacy-content">
        <section className="privacy-section">
          <h2>What we do</h2>
          <p>
            Strava for Claude is an MCP (Model Context Protocol) server that
            connects your Strava data to Claude, Anthropic&apos;s AI assistant. It
            allows Claude to read your activity data and provide training insights.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Data we access</h2>
          <p>
            When you connect your Strava account, we request read-only access to:
          </p>
          <ul>
            <li>Your public profile information</li>
            <li>Your activity data (rides, runs, etc.)</li>
          </ul>
          <p>We do not modify, delete, or create any data on your Strava account.</p>
        </section>

        <section className="privacy-section">
          <h2>Data we store</h2>
          <p>We store the following data, encrypted at rest using AES-256-GCM:</p>
          <ul>
            <li>
              <strong>Strava OAuth tokens</strong> — used to access your Strava
              data on your behalf. These are automatically refreshed and can be
              revoked at any time.
            </li>
            <li>
              <strong>Strava API credentials</strong> — if you use the &quot;bring
              your own app&quot; setup, your Client ID and Client Secret are stored
              encrypted.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> store your activity data. Your Strava data
            is fetched in real-time when Claude requests it and is not cached on
            our servers.
          </p>
        </section>

        <section className="privacy-section">
          <h2>How your data is used</h2>
          <p>
            Your data is used solely to provide training insights through Claude.
            We do not:
          </p>
          <ul>
            <li>Sell or share your data with third parties</li>
            <li>Use your data for advertising</li>
            <li>Use your data for any purpose other than providing this service</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>Third-party services</h2>
          <ul>
            <li>
              <strong>Strava</strong> — your data is accessed via the Strava API
              under their{" "}
              <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer">
                API Agreement
              </a>
            </li>
            <li>
              <strong>Vercel</strong> — the application is hosted on Vercel
            </li>
            <li>
              <strong>Upstash</strong> — encrypted tokens are stored in Upstash
              Redis
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>Revoking access</h2>
          <p>
            You can disconnect at any time by revoking access in your{" "}
            <a href="https://www.strava.com/settings/apps" target="_blank" rel="noopener noreferrer">
              Strava app settings
            </a>
            . This immediately invalidates all stored tokens.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Contact</h2>
          <p>
            For questions about this privacy policy, open an issue on{" "}
            <a href="https://github.com/ArjanLig/strava-mcp" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            .
          </p>
        </section>
      </div>

      <footer className="footer">
        <a href="/">Back to home</a>
      </footer>
    </main>
  );
}
