# Strava koppelen aan Claude

Met deze koppeling kun je in Claude vragen stellen over je Strava-data: trainingsbelasting, weekplannen, activiteiten en meer.

## Wat heb je nodig?

- Een Strava-account
- Claude Desktop (download: https://claude.ai/download)

## Stap 1: Strava API app aanmaken

1. Ga naar https://www.strava.com/settings/api en log in
2. Vul het formulier in:
   - **Application Name**: mag alles zijn, bijv. `Claude`
   - **Category**: kies iets willekeurigs
   - **Website**: `http://localhost`
   - **Authorization Callback Domain**: `localhost`
3. Klik op **Create**
4. Je ziet nu een **Client ID** en **Client Secret** — houd deze pagina open

## Stap 2: Installeren

Open een terminal en plak het commando hieronder:
- **Mac**: zoek "Terminal" via Cmd+Spatie
- **Windows**: druk op de Windows-toets, typ `PowerShell`, en klik op **Windows PowerShell**

```
curl -sSL https://raw.githubusercontent.com/ArjanLig/strava-mcp/main/install.sh | bash
```

Het script:
1. Vraagt om je **Client ID** en **Client Secret** van stap 1
2. Opent je browser — klik op **Authorize**
3. Configureert Claude Desktop automatisch

## Stap 3: Testen

Herstart Claude Desktop en probeer:

- "Wat waren mijn laatste ritten?"
- "Hoe ziet mijn trainingsbelasting eruit?"
- "Geef me een trainingsplan voor deze week"

## Problemen?

**Script werkt niet**
Sluit Terminal, open opnieuw, en plak het commando nog een keer.

**Claude herkent Strava niet**
Zorg dat je Claude Desktop hebt herstart na de installatie.
