### GitHub Repository Migration

Automatisiertes Skript zum Transfer von Repositories zwischen GitHub-Organisationen.

### Voraussetzungen

- **Node.js**: 18+
- **GitHub Token**: Scopes `repo`, `admin:org`
- **Rechte**: Owner/Admin in Ziel & Quell-Organisation

### Setup

```bash
npm install
```

`.env` erstellen:

```env
GITHUB_TOKEN=ghp_xxx
TARGET_ORG=my-target-org
SOURCE_ORGS=org-a,org-b
```

### Nutzung

- **Dry-Run (Standard)**:

```bash
node migrate-repos.js
# oder
npm run migrate
```

- **Ausführen (Transfer)**:

```bash
node migrate-repos.js --execute
```

### Nutzer exportieren (optional)

```bash
node export-users.js  # schreibt users.json
```

### Hinweise

- Standard ist Dry-Run; `--execute` führt den tatsächlichen Transfer aus.
- Das Skript wartet ca. 1s zwischen API-Calls (Rate-Limit-Schonung).
