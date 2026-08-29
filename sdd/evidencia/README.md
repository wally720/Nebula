# Evidencia

Artefactos reales extraídos de `neoforge-21.1.248-installer.jar`
(`https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.248/`).

| Archivo | Qué es |
|---|---|
| `neoforge-21.1.248-version.json` | El `version.json` que el instalador deposita en `versions/neoforge-21.1.248/`. Define `mainClass`, args JVM y las 47 librerías. |
| `neoforge-21.1.248-install_profile.recortado.json` | El `install_profile.json` sin la lista de 70 librerías del instalador (irrelevantes en runtime). Conserva `data` y `processors`, que documentan qué artefactos se generan. |

Sirven como referencia al implementar, para no tener que re-descargar y re-extraer el
instalador. **No** son insumo del build: el resolver los obtiene del instalador en tiempo de
ejecución.
