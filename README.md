# Rota Adaptada — Team Interplários

Agricultural planning with NASA data, developed for the **NASA Space Apps 2026** challenge **Field Shift: Adapting Farms with NASA Data**.

[Open the application](https://rotaadaptada.udisoft.app.br) · [Português](docs/README.pt-BR.md) · [Presentation video](<Video Apresentacao App Rota Adaptada.mp4>)

## Overview

Rota Adaptada helps farmers create planting calendars and compare adjustments when delays affect their plans. It combines NASA POWER historical climate records, Brazil’s official ZARC planting conditions, and ISRIC SoilGrids soil estimates for a location confirmed by the user.

Users select crops and cycle durations, define dates, and save an original calendar. They can then simulate delays and compare alternatives within the changes they permit, preserving the original plan. A separate guided workflow helps users explore municipal planting options before deciding what to grow.

The application works on mobile and desktop, supports Portuguese and English, and can be installed as a Progressive Web App. Drafts and plans are stored in the browser on the same device. After an initial online visit, the interface can open offline; new data queries require internet access.

## Try the demonstration

1. Open the application and use **PT / EN** to choose the language.
2. Open [the planning demonstration](https://rotaadaptada.udisoft.app.br/?demo=planejamento), set in Vilhena, Rondônia, Brazil.
3. Review the location, crop sequence, cycle durations, and dates.
4. Save the original calendar, then choose the delay simulation action.
5. Review the allowed changes and compare the available alternatives.

The example is explicitly labeled and does not constitute a recommendation for other farms. Climate data is queried live; unavailable information remains visible as not evaluated.

## NASA data and supporting sources

| Source | Role |
| --- | --- |
| NASA POWER | Historical daily precipitation, minimum and maximum temperature, and root-zone and surface moisture indices for the confirmed coordinates. |
| ZARC / MAPA | Published municipal planting conditions, with season, soil, management, and crop-group constraints. |
| ISRIC SoilGrids | Estimated soil texture to provide context, not a laboratory soil test. |
| IBGE, OpenStreetMap / Nominatim, OpenFreeMap | Municipal boundaries, location lookup, and map context. |

See [data sources and API connections](DADOS_CONEXAO_APIS.md) and [ZARC provenance and attribution](rota-adaptada/docs/ZARC.md). NASA POWER and SoilGrids queries do not require API keys.

## Run locally

Prerequisite: **Node.js 22** and npm.

```bash
git clone https://github.com/vhfoliveira/rota-adaptada.git
cd rota-adaptada/rota-adaptada
npm ci
npm run dev
```

Open the local URL printed by Vite (default port 5178).

```bash
npm test
npm run validate:crop-parameters
npm run build
```

The static build is generated in `rota-adaptada/dist/` relative to the repository root. Serve it over HTTPS for GPS and PWA installation. An optional Docker deployment includes a daily ZARC updater; see [deployment instructions](deploy/README.md).

## Scope and limitations

The current version supports scheduling and scenario comparison. Historical climate records are not weather or yield forecasts. ZARC percentages are not general probabilities of farming success, and a catalog entry does not establish insurance or credit eligibility. Soil estimates do not confirm an official ZARC soil class.

Missing evidence is marked **not evaluated**. The application does not yet integrate measured soil fertility, seed-lot quality, crop health, within-field variability, or financial optimization. Field validation with agronomists and producers is a proposed next step, not a completed result.

## Repository guide

- `rota-adaptada/src/`: interface, planning logic, and data integrations.
- `rota-adaptada/tests/`: automated JavaScript tests.
- `rota-adaptada/scripts/`: data maintenance, validation, and ZARC service.
- `rota-adaptada/public/zarc/`: versioned municipal data distributed with the app.
- `docs/`: regional scope, agronomic validation roadmap, and Portuguese overview.
- `deploy/`: Docker and server deployment instructions.

Further documentation: [application guide](rota-adaptada/README.md), [guided experience](rota-adaptada/docs/GUIA_AUTOGUIADO.md), [scenario engine](rota-adaptada/docs/MOTOR_CENARIOS.md), and [agronomic scope and roadmap](docs/ESCOPO_RONDONIA.md).

## Super Intelligence (SI) disclosure

The team used OpenAI Codex, ChatGPT, Google Gemini, and Claude during project development and submission preparation. SI assistance included code/documentation work and media creation. See [SI provenance metadata](SI-PROVENANCE.json) for the confirmed scope and outstanding asset-level labeling review. External scientific datasets retain their original provider attribution; SI assistance must not be confused with their provenance.

Before submission, verify visible SI-generated labels on generated images/videos and descriptive credits plus metadata for generated audio. This repository disclosure does not replace those asset-level labels.

## License

The project code is available under the [MIT License](LICENSE). Third-party datasets, dependencies, and assets retain their own licenses and attribution requirements; see the source documentation and dataset manifests.
