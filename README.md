# FIAB Arona · Felici in Bici (PWA)

Questa cartella contiene una PWA “utility” pensata per:
- raccogliere **mappe** (link e/o iframe embed: QGIS/qgis2web, uMap, MyMaps, ecc.)
- raccogliere **link utili** (FIAB, Albergabici, Bicitalia…)
- gestire una lista di **colonnine/punti ricarica** (salvati sul dispositivo)

## Avvio in locale (test)
Da PowerShell, dentro `docs/fiab-arona-pwa`:

```powershell
python -m http.server 5173
```

Apri `http://localhost:5173`.

## Configurazione contenuti
Nell’app vai su **Impostazioni** e modifica:
- **Mappe (JSON)**
- **Link (JSON)**

Puoi anche fare **Esporta/Importa JSON** per condividere la configurazione.

## Pubblicazione su GitHub Pages
Se GitHub Pages pubblica la cartella `docs/` come sito, la PWA sarà raggiungibile a:
`https://<utente>.github.io/<repo>/fiab-arona-pwa/`

Nota: iOS richiede HTTPS per installare la PWA.

