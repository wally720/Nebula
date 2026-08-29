# 05 — Verificación

Resultado de ejecutar el plan de `03-plan-implementacion.md`.

## Paso 1 — Port

`git cherry-pick 47d2dc2..552eb99` aplicó los 9 commits **sin conflictos**. El doc 03
anticipaba conflictos en `src/index.ts` y `package.json` por los dos commits de
mantenimiento del upstream; no se produjeron. La autoría de RaftDev quedó intacta.

## Paso 2 — Correcciones

Las tres del doc 04, más dos huecos que aparecieron al contrastar el código portado contra
`02-especificacion.md`:

| # | Corrección | Origen |
|---|---|---|
| 1 | Respaldo a `META-INF/mods.toml` legado | doc 04 |
| 2 | `runInstaller` rechaza ante código de salida ≠ 0 | doc 04 |
| 3 | `javaOptions.suggestedMajor: 21` | doc 04 |
| 4 | **`/releases` faltante en `REMOTE_REPOSITORY`** | verificación |
| 5 | `--neoforge` en conflicto con `--forge`/`--fabric`; comando `latest-neoforge` | verificación |

### Sobre la corrección 4 — era un bloqueo total

`REMOTE_REPOSITORY` era `https://maven.neoforged.net/`, sin `/releases`. El maven de
NeoForged (Reposilite) sirve los artefactos bajo `/releases`; sin ese segmento **toda**
descarga del instalador devolvía un 404 en HTML que se escribía como jar de 0 bytes, y el
instalador moría con `Invalid or corrupt jarfile`. `02-especificacion.md` §1 ya especificaba
`maven.neoforged.net/releases`; el port lo perdió.

El defecto quedaba enmascarado por el defecto 2: sin la corrección de `runInstaller`, el
fallo del instalador no detenía la ejecución y el diagnóstico aparecía mucho más tarde y
en otro lugar.

## Verificación ejecutada

Pasos 1-4 y 8 del doc 03. Entorno: Java 21.0.10, Node 22.

| Paso | Resultado |
|---|---|
| 1. `npm run lint` / `npm run build` | limpios |
| 2. `generate server MCSquadTest 1.21.1 --neoforge 21.1.248` | OK, **sin intervención manual** |
| 2b. `generate distro` | OK; el instalador corrió headless con `--installClient` |
| 3. `latest-neoforge 1.21.1` | `21.1.249` — **no** 21.11.x. Trampa del prefijo evitada |
| 3b. `latest-neoforge 1.21` / `1.21.4` | `21.0.167` / `21.4.157`, mapeo correcto |
| 4. Forma del `distribution.json` | coincide con `02-especificacion.md` §3, punto por punto |
| 8. Regresión Forge 1.12.2 y Fabric 1.21.1 | ambos generan normal; `javaOptions` solo en el servidor NeoForge |

`distribution.json` generado para el servidor NeoForge:

- raíz `ForgeHosted` = `net.neoforged:neoforge:21.1.248:universal`
- 1 submódulo `VersionManifest` (21.1.248) + 51 `Library`
- de esas, 47 dependencias desde `maven.neoforged.net` y 4 generadas
  (`neoforge:client`, `client:srg`, `client:extra`, `client:slim`), todas con
  `"classpath": false`
- `javaOptions.suggestedMajor: 21`
- `mcAndNeoFormVersion` resuelto a `1.21.1-20240808.144430`, el valor que predijo el doc 01

Regenerar produce un resultado idéntico byte a byte (caché estable).

## Lo que sigue sin verificar

- **Pasos 5-7: carga de mods in-game.** Requieren subir `repo/` al bucket y lanzar el juego.
  El paso 7 —que un mod cargue realmente por `--fml.mavenRoots` / `--fml.modLists`— sigue
  siendo el único punto abierto sustancial de todo el SDD, igual que antes de implementar.
  Nada de lo hecho aquí lo prueba ni lo descarta.
- **`client slim`.** Se conserva, por el precedente de Forge y porque NeoNebula ya lo emite.
  Quitarlo sigue siendo una optimización de una línea (~14 MB por versión), a decidir cuando
  el paso 7 dé datos.

## Desviación consciente respecto a `02-especificacion.md`

La spec (§2) pedía un directorio de mods `neoforgemods`. El código portado reutiliza
**`forgemods`**: `NeoForgeModStructure` extiende `BaseForgeModStructure` sin redeclarar el
directorio. Se conserva así, porque el módulo emitido es `Type.ForgeMod` de todos modos y
cambiarlo alteraría la estructura de carpetas de usuarios existentes sin ganancia funcional.
Si se prefiere el nombre separado, es un cambio de una línea en el `super(...)` más su
mención en el README.
