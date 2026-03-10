# Strava koppelen aan Claude — Installatiehandleiding

Met deze koppeling kun je in Claude vragen stellen over je Strava-data: trainingsbelasting, weekplannen, activiteiten en meer.

## Wat heb je nodig?

- Een Strava-account
- Claude Desktop (gratis download: https://claude.ai/download)

## Stap 1: Strava API app aanmaken

1. Ga naar https://www.strava.com/settings/api en log in
2. Vul het formulier in:
   - **Application Name**: mag alles zijn, bijv. `Claude Koppeling`
   - **Category**: kies iets willekeurigs
   - **Website**: vul in `http://localhost`
   - **Authorization Callback Domain**: vul in `localhost`
3. Klik op **Create**
4. Je ziet nu een **Client ID** (een getal) en een **Client Secret** (een lange code) — die heb je zo nodig

## Stap 2: Terminal openen

- **Mac**: open de app "Terminal" (zoek via Spotlight met Cmd+Spatie)
- **Windows**: open "PowerShell" (zoek in het startmenu)

## Stap 3: Installeren en koppelen

Kopieer en plak dit in je terminal en druk op Enter:

```
uvx strava-training-mcp --auth
```

> **Krijg je een foutmelding dat `uvx` niet gevonden wordt?**
> Installeer eerst `uv` door dit te plakken in je terminal:
>
> Mac/Linux:
> ```
> curl -LsSf https://astral.sh/uv/install.sh | sh
> ```
> Windows:
> ```
> powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
> ```
> Sluit je terminal, open een nieuwe, en probeer het opnieuw.

Het programma vraagt nu om:
1. **Client ID** — plak het getal van stap 1
2. **Client Secret** — plak de code van stap 1
3. Je browser opent automatisch — klik op **Authorize** op de Strava-pagina
4. Je wordt doorgestuurd naar een pagina die niet laadt (dat is normaal!)
5. Kopieer de **volledige URL** uit je adresbalk en plak die in de terminal

Als je "Authentication successful!" ziet, is het gelukt!

## Stap 4: Claude Desktop instellen

1. Open Claude Desktop
2. Ga naar **Settings** (tandwieltje linksonder) → **Developer** → **Edit Config**
3. Er opent een bestandje. Vervang de inhoud door:

```json
{
  "mcpServers": {
    "strava": {
      "command": "uvx",
      "args": ["strava-training-mcp"]
    }
  }
}
```

4. Sla het bestand op en sluit het
5. **Sluit Claude Desktop volledig af en open het opnieuw**

## Stap 5: Testen!

Open een nieuw gesprek in Claude en probeer:

- "Wat waren mijn laatste 5 ritten?"
- "Hoe ziet mijn trainingsbelasting eruit?"
- "Geef me een trainingsplan voor deze week"

## Problemen?

**"Missing credentials" foutmelding**
Voer opnieuw uit: `uvx strava-training-mcp --auth`

**Claude herkent de Strava-tools niet**
Controleer of je Claude Desktop hebt herstart na stap 4.

**"uvx" wordt niet gevonden**
Installeer `uv` via de instructies bij stap 3 en herstart je terminal.
