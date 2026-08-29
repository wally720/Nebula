# 03 — Plan de implementación

## Paso 0 — Fork (hecho al crear este repo)

Fork de `dscalzi/Nebula` a `wally720/Nebula`. Rama de trabajo sugerida:
`claude/neoforge-support`.

## Paso 1 — Resolver

`src/resolver/neoforge/NeoForge.resolver.ts`, según `02-especificacion.md` §1.

Orden recomendado, para poder verificar cada pieza por separado:

1. Clase base + `isForVersion` (MC 21) + descarga del instalador desde
   `maven.neoforged.net/releases`.
2. `executeInstaller` con `--install-client` (§1.3). **Verificable ya:** debe completar sin
   intervención.
3. `getNeoFormVersion` y el comodín (§1.2).
4. `generatedFiles` (§1.1) y `processForgeModule`.
5. `processLibraries` (solo renombrar etiquetas).

## Paso 2 — Plomería

Según `02-especificacion.md` §2: `VersionRepo.struct`, `Repo.struct`,
`NeoForgeMod.struct`, `VersionSegmentedRegistry`, `ServerMeta`, `index.ts`, `VersionUtil`.

## Paso 3 — Launcher

**Sin cambios de código.** Solo confirmar en pruebas.

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
