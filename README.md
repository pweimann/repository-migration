# GitHub Repository Migration Script

Automatisiertes Script zur Migration von Repositories zwischen GitHub-Organisationen mit der [Octokit Core.js Library](https://github.com/octokit/core.js#readme).

## 🚀 Features

- ✅ **Bulk-Migration** von Repositories zwischen Organisationen
- 🔍 **Dry-Run Modus** für sichere Tests
- 📊 **Detailliertes Logging** und Reporting
- ⚡ **Rate-Limiting** zur API-Schonung
- 🛡️ **Validierung** von Permissions und Setup
- 📁 **JSON-Import** von Repository-Listen

## 📋 Voraussetzungen

1. **Node.js 18+** installiert
2. **GitHub Personal Access Token** mit folgenden Permissions:
   - `repo` (vollständiger Repository-Zugriff)
   - `admin:org` (Organisation verwalten)
3. **Admin-Rechte** für Ziel-Organisation
4. **Owner/Admin-Rechte** für Quell-Repositories

## 🛠️ Installation

```bash
# Dependencies installieren
npm install

# Environment-Variablen konfigurieren
cp .env.example .env
# .env editieren und TOKEN + ORGANISATIONEN eintragen
```

## ⚙️ Konfiguration

Erstelle eine `.env` Datei:

```env
GITHUB_TOKEN=ghp_your_personal_access_token_here
TARGET_ORG=My-Migration-Test
SOURCE_ORGS=senacor,org2,org3,org4
```

## ⚙️ Github Repo List Script

```env
gh repo list ORG_NAME --limit 1000 --json name,sshUrl,url,description,isPrivate,pushedAt > test-repos.json
```



## 🎯 Verwendung

### 1. Test mit einzelnem Repository

```bash
# Dry-Run Test
npm run test

# Echter Transfer (nach erfolgreichem Test)
node test-migration.js --execute
```

### 2. Migration aus JSON-Datei

```bash
# Nutzt automatisch senacor-repos.json falls vorhanden
npm run migrate

# Echter Transfer
node migrate-repos.js --execute
```

### 3. Migration von Organisationen

```bash
# Dry-Run für alle konfigurierten Organisationen
node migrate-repos.js

# Echter Transfer
node migrate-repos.js --execute
```

## 📊 Script-Optionen

```javascript
const migrator = new RepositoryMigrator({
  sourceOrgs: ['org1', 'org2'],      // Quell-Organisationen (optional)
  dryRun: true,                      // Sicherheits-Modus
  logFile: 'custom-log.json'         // Custom Log-Datei
});

// Target organization MUST be set via TARGET_ORG environment variable
```

## 🔍 Dry-Run vs. Execute

- **Dry-Run (Standard)**: Simuliert Migration ohne tatsächliche Transfers
- **Execute**: Führt echte Repository-Transfers durch

```bash
# Sicher testen
node migrate-repos.js

# Echte Migration
node migrate-repos.js --execute
```

## 📈 Output und Logging

Das Script generiert:

1. **Konsolen-Output** mit Real-time Status
2. **JSON-Log-Datei** mit detaillierten Ergebnissen
3. **Summary-Report** am Ende

Beispiel Log-Struktur:
```json
{
  "successful": [
    {
      "repo": "senacor/elasticsearch-evolution",
      "target": "My-Migration-Test/elasticsearch-evolution",
      "timestamp": "2025-01-24T10:30:00Z"
    }
  ],
  "failed": [],
  "summary": {
    "total": 93,
    "successful": 93,
    "successRate": 100
  }
}
```

## ⚠️ Wichtige Hinweise

### Permissions
- Sie benötigen **Admin-Rechte** für alle Quell-Repositories
- **Owner/Admin-Rechte** für die Ziel-Organisation sind erforderlich

### Nach der Migration
- **Team-Zuordnungen** müssen manuell neu konfiguriert werden
- **Webhooks** und **Secrets** werden nicht übertragen
- **Branch Protection Rules** müssen neu gesetzt werden

### Rate Limiting
- Das Script wartet automatisch 1 Sekunde zwischen Transfers
- GitHub API erlaubt 5000 Requests/Stunde für authentifizierte Nutzer

## 🛠️ Troubleshooting

### Häufige Fehler

**422 Validation Failed**
```bash
# Prüfen ob Ziel-Organisation existiert
gh api /orgs/$TARGET_ORG

# Prüfen ob Sie Admin-Rechte haben
gh api /orgs/$TARGET_ORG/memberships/$(gh api /user | jq -r .login)
```

**403 Forbidden**
```bash
# Token-Permissions prüfen
gh auth status

# Neuen Token mit korrekten Permissions erstellen
gh auth login --scopes repo,admin:org
```

### Debug-Modus
```bash
# Detaillierte API-Logs
DEBUG=octokit* node migrate-repos.js
```

## 🔒 **Sicherheitsverbesserung**

Die Ziel-Organisation kann **nur** über die `.env` Datei konfiguriert werden:

```env
TARGET_ORG=My-Migration-Test
```

Dies verhindert versehentliche Transfers in die falsche Organisation über Command-Line-Parameter.

## 📝 API-Referenz

Basiert auf der offiziellen [GitHub REST API](https://docs.github.com/en/rest/repos/repos#transfer-a-repository):

```javascript
await octokit.request('POST /repos/{owner}/{repo}/transfer', {
  owner: 'source-org',
  repo: 'repository-name',
  new_owner: 'target-org',
  headers: {
    'X-GitHub-Api-Version': '2022-11-28'
  }
});
```

## 🎯 Nächste Schritte

1. **Testen Sie** zuerst mit einem einzelnen Repository
2. **Führen Sie** einen Dry-Run für alle Repos durch
3. **Validieren Sie** die Ergebnisse im Log
4. **Führen Sie** die echte Migration aus
5. **Konfigurieren Sie** Teams und Permissions neu

---

**Erstellt für die Migration von 4 GitHub-Organisationen zu einer zentralen Organisation** 🚀 
