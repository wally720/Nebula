# 03 — Plan de implementación

## Paso 0 — Fork (hecho al crear este repo)

Fork de `dscalzi/Nebula` a `wally720/Nebula`. Rama de trabajo sugerida:
`claude/neoforge-support`.

## Paso 1 — Portar NeoNebula (no reimplementar)

`BelgianDev/NeoNebula` ya tiene el resolver completo y funcional. Ver
[`04-implementacion-existente.md`](04-implementacion-existente.md) para el análisis completo.

```bash
git remote add neonebula https://github.com/BelgianDev/NeoNebula.git
git fetch neonebula
git cherry-pick 47d2dc2..552eb99      # los 9 commits de NeoForge
```

Conflictos esperables en `src/index.ts` y `package.json`, por los dos commits de mantenimiento
que el upstream tiene y NeoNebula no. Son menores.

`02-especificacion.md` sigue siendo útil como mapa de qué hace cada pieza y por qué, con una
excepción: su §2 sobre la resolución de `latest` quedó **obsoleta**; el enfoque de NeoNebula
(filtrado numérico en cliente) es mejor y es el que se conserva.

## Paso 2 — Corregir tres defectos del port

Detallados en `04-implementacion-existente.md`:

1. **Respaldo a `mods.toml` legado** en `NeoForgeMod.struct.ts:41` — el de mayor impacto real,
   afecta a mods de 1.21.1 que aún no migraron a `neoforge.mods.toml`.
2. **`runInstaller` debe rechazar** ante código de salida distinto de cero.
3. **`javaOptions.suggestedMajor: 21`** en el `servermeta.json` del servidor.

## Paso 3 — Launcher

**Un cambio de tres líneas en `app/assets/js/processbuilder.js`**, obligatorio: sin él el juego
no arranca. Está detallado, con su origen y su verificación, en
[`06-parche-launcher.md`](06-parche-launcher.md).

No hace falta tocar `helios-core` ni actualizarlo: `~2.3.0` sirve tal cual.

---

## Verificación

1. `npm run lint` y `npm run build` limpios.
2. `nebula generate server MCSquadTest 1.21.1 --neoforge 21.1.248` → completa **sin
   intervención manual**. Esto valida el `--install-client`.
3. `--neoforge latest` debe resolver a una versión **21.1.x**, nunca 21.11.x.
   `--neoforge recommended` debe avisar y caer a latest.
4. Inspeccionar el `distribution.json` contra la forma esperada de
   `02-especificacion.md` §3.
5. Subir `repo/` al bucket y apuntar el launcher en modo dev
   (`DistroAPI.isDevMode()` permite un `distribution.json` local).
6. Lanzar. En el log "Launch Arguments" del `ProcessBuilder` verificar:
   - `cpw.mods.bootstraplauncher.BootstrapLauncher`
   - `--launchTarget forgeclient`
   - `-p` con los 8 jars del module path
7. **Prueba de mods** — la más importante, y lo único no verificable estáticamente: poner 1-2
   mods de 1.21.1 en `neoforgemods/`, regenerar, y confirmar que aparecen en la lista de mods
   in-game. Es decir, que `--fml.mavenRoots` + `--fml.modLists` realmente cargan.
8. Regresión: regenerar un servidor Forge y uno Fabric existentes y comprobar que su
   `distribution.json` no cambia.

---

## Puntos abiertos

Ambos son ajustes de una línea, no rediseños:

- **Carga de mods de punta a punta.** Está verificado que las opciones existen, se parsean y
  que `MavenDirectoryLocator` las consume como servicio de producción. No está verificado que
  un mod cargue realmente por esa vía; eso es el paso 7 de verificación.
- **`client slim`.** `ProductionClientProvider` solo exige `srg` y `extra`. Se declara por
  precedente de Forge. Si las pruebas confirman que sobra, quitarlo de `generatedFiles` ahorra
  ~14 MB por versión en el bucket.

---

## Riesgos conocidos

- La primera generación descarga Minecraft 1.21.1 y corre 5 procesadores (~1-2 min y bastante
  CPU). Nebula ya cachea el resultado en `repo/cache/`, así que solo ocurre una vez por
  versión.
- Requiere red hacia `maven.neoforged.net` y `libraries.minecraft.net` durante la generación.

## Costo recurrente de operación

Por cada actualización de NeoForge hay que re-subir los jars parcheados al bucket, porque
salen de parchear el cliente y no existen en ningún maven:

| Artefacto | Peso |
|---|---|
| `client-<mcAndNeoForm>-srg.jar` | 18 MB |
| `client-<mcAndNeoForm>-extra.jar` | 12 MB |
| `client-<mcAndNeoForm>-slim.jar` | 14 MB (si se conserva) |
| `neoforge-<ver>-client.jar` | 5.6 MB |

Los tres de `net.minecraft` solo cambian si cambia la versión de NeoForm, así que entre
parches sucesivos de NeoForge suelen repetirse y no hay que volver a subirlos.
