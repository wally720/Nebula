# 01 — Investigación

Objetivo: validar posibilidad, complejidad y compatibilidad de agregar **NeoForge 21.1.248**
(Minecraft 1.21.1) al launcher MCSquad.

## Resumen

NeoForge es viable y de complejidad media. La hipótesis inicial —modificar el launcher— es
**incorrecta**: el launcher ya soporta todo lo que NeoForge necesita. El trabajo está
íntegramente en Nebula.

Además, NeoForge no solo es compatible: es la **salida** al callejón sin salida en que quedó
Forge 1.20.3+ (ver hallazgo 3).

---

## 1. Punto de partida: nada del stack conoce NeoForge

| Hecho | Verificación |
|---|---|
| `helios-core@2.3.0` no menciona NeoForge | `grep -ri neoforge` sobre el tarball de npm → 0 resultados |
| `helios-distribution-types@1.3.0` no tiene `Type.NeoForge` | `build/spec/type.js`: solo `Forge`, `ForgeHosted`, `Fabric`, y sus tipos de mod |
| Nebula no soporta NeoForge | README oficial y ausencia de resolver |

No hay nada que "activar" en el stack oficial. Hay que construirlo — aunque, como se descubrió
después, **ya está construido en un fork de Nebula**: ver `04-implementacion-existente.md`. Los
hallazgos de este documento siguen siendo la base para revisar y corregir ese código.

## 2. El launcher es compatible salvo por una línea

> **Corregido tras la auditoría.** Este apartado afirmaba que el launcher no requería ningún
> cambio. Todo lo que se lista debajo sigue siendo cierto y verificado, pero **falta un
> cambio de tres líneas en `processbuilder.js`**: ver el hallazgo 8 y
> [`06-parche-launcher.md`](06-parche-launcher.md).

`version.json` de NeoForge 21.1.248 (extraído del instalador, ver `evidencia/`):

- `inheritsFrom: "1.21.1"`, `mainClass: cpw.mods.bootstraplauncher.BootstrapLauncher`
- **47 librerías, todas con URL de descarga**
- **sin natives, sin rules**
- args JVM que usan solo `${library_directory}`, `${classpath_separator}` y `${version_name}`

Esos tres son exactamente los que `processbuilder.js:412-419` ya sustituye. Y la ausencia de
natives evita toda la rama compleja de `_resolveMojangLibraries()`.

Además:

- `isForgeGradle3()` de helios-core (`dist/dl/distribution/DistributionIndexProcessor.js`)
  devuelve `true` inmediatamente para MC ≥ 1.13 **sin parsear la versión del loader**. Un
  módulo `ForgeHosted` con NeoForge cae por el camino de Forge moderno automáticamente.
- El formato de distribución ya soporta `classpath: false` (`processbuilder.js:876`), para
  bajar un artefacto sin meterlo al classpath. **Pero solo en submódulos** — esa es la
  excepción del hallazgo 8.
- `classpathArg()` (`processbuilder.js:678`) ya excluye el jar de versión para MC ≥ 1.17 con
  loader no-Fabric, que es lo correcto para NeoForge.

## 3. Los mods funcionan por la vía de Forge — y este es el hallazgo clave

En `loader-4.0.43.jar` (FancyModLoader de NeoForge 21.1.248):

- `FMLServiceProvider` registra las opciones `mods`, `modLists`, `mavenRoots` bajo el prefijo
  `fml`. modlauncher las expone concatenando `<prefijo>.<opción>` → `--fml.mavenRoots`,
  `--fml.modLists`.
- `MavenDirectoryLocator` está declarado en
  `META-INF/services/net.neoforged.neoforgespi.locating.IModFileCandidateLocator`, o sea es un
  **servicio de producción**, y su `findCandidates` consume
  `ILaunchContext.mavenRoots() / .modLists() / .mods()`.

Es decir, el mecanismo que usa `processbuilder.js:316-321` sigue vivo en NeoForge.

> **Nota de método:** un `grep` de la cadena literal `"fml.mavenRoots"` sobre el jar da **cero
> resultados** y lleva a la conclusión opuesta. Es un falso negativo: el prefijo y el nombre se
> concatenan en tiempo de ejecución. Verificar por el registro de opciones y el servicio, no
> por la cadena completa.

### El contraste con Forge

En `fmlloader-1.21.1-52.1.16` (Forge para el mismo Minecraft):

| | Forge 1.21.1 | NeoForge 21.1.248 |
|---|---|---|
| `mavenRoots` | **0 ocurrencias** | 6 |
| `modLists` | **0 ocurrencias** | 6 |
| `MavenDirectoryLocator` en servicios | **ausente** | presente |

Los locators de Forge quedaron en `ModsFolderLocator`, `MinecraftLocator`, `ClasspathLocator`
y los de desarrollo. **Forge lo eliminó; NeoForge lo conservó.**

Esto explica el bloqueo real de Nebula, que no fue un cambio de instalador. dscalzi lo
documentó en `src/index.ts` (commit `47d2dc2`, feb 2025):

```
┃    Forge 1.20.3+ removed support for --fml.modLists.    ┃
┃  Helios Launcher can no longer load mods through Forge. ┃
┃      Please use Fabric or await NeoForged Support.      ┃
```

En ese mismo commit subió el soporte de versiones a MC 21 (`isForVersion`), y en
`5af7e66 Fix 1.20.4+ support` ya había manejado el instalador ejecutable. O sea: **Nebula sí
genera Forge 1.21; lo que no funciona es cargar mods desde el launcher.**

Este trabajo es ese "NeoForged Support".

## 4. NeoForge necesita jars que no se pueden descargar

El instalador no solo baja: **genera** artefactos parcheando el cliente de Minecraft. En el
bytecode de `ProductionClientProvider` y `NeoForgeClientLaunchHandler` se ve que en producción
se resuelven por `-DlibraryDirectory` mediante `LibraryFinder.findPathForMaven`, **no por el
classpath**, y que si faltan se lanza `fml.modloadingissue.corrupted_installation`:

- `net.minecraft:client:<mcAndNeoFormVersion>:srg`
- `net.minecraft:client:<mcAndNeoFormVersion>:extra`
- `net.neoforged:neoforge:<ver>:client` (parcheado)
- `net.neoforged:neoforge:<ver>:universal` (este sí está en maven)

Para 21.1.248, `mcAndNeoFormVersion` = `1.21.1-20240808.144430`.

## 5. El instalador corre headless — el paso manual se puede eliminar

Hoy Nebula abre la GUI del instalador y te obliga a elegir la carpeta a mano
(`ForgeGradle3.resolver.ts:590`, `spawn(java, ['-jar', installer])` sin argumentos; y
`verifyInstallerRan` en la línea 402 falla si te equivocas de ruta).

El `MANIFEST.MF` del instalador de NeoForge declara
`Main-Class: net.minecraftforge.installer.SimpleInstaller` con `Implementation-Vendor: NeoForge`
—es el instalador de Forge vendorizado— y su bytecode registra la opción `install-client`.

**Ejecutado y verificado:**

```
$ java -jar neoforge-21.1.248-installer.jar --install-client <dir>
...
Successfully installed client into launcher.
EXIT=0
```

Sin interacción. Produjo `versions/neoforge-21.1.248/neoforge-21.1.248.json` y 73 jars (96 MB)
bajo `libraries/`, incluidos los cuatro artefactos del hallazgo 4. Único requisito previo: un
`launcher_profiles.json` con `{}` en la carpeta destino — que **Nebula ya escribe**
(`ForgeGradle3.resolver.ts:355`).

## 6. Nebula ya tiene casi toda la maquinaria

`ForgeGradle3.resolver.ts` (777 líneas) ya hace todo lo estructural:

- descarga el instalador del maven y lo ejecuta;
- lee el `version.json` generado y lo emite como submódulo `Type.VersionManifest`;
- re-hospeda cada librería (`processLibraries`, que emite todo lo que tenga
  `downloads.artifact.url` — las 47 de NeoForge lo tienen);
- tiene la interfaz `GeneratedFile` con la bandera **`classpath?: boolean`** y un mecanismo de
  comodines (`WILDCARD_MCP_VERSION` / `wildcardsInUse` / `getMCPVersion`) para versiones que
  solo se conocen tras la instalación;
- `isForVersion` cubre hasta MC 21.

`Fabric.resolver.ts` (~120 líneas) muestra la variante mínima. Un resolver de NeoForge queda
entre ambos.

### Detalle de diseño que condiciona todo

`processForgeModule` termina con (`ForgeGradle3.resolver.ts:530`):

```ts
const forgeModule = mdls.shift()!
forgeModule.type = Type.ForgeHosted
forgeModule.subModules = mdls
```

**El primer elemento de `generatedFiles` se convierte en el módulo raíz.** Y en el launcher,
`processbuilder.js:842-843` agrega el módulo raíz al classpath **sin consultar su bandera
`classpath`** (esa comprobación solo existe para submódulos, línea 876).

Consecuencia: el orden de `generatedFiles` no es cosmético. El universal debe ir primero.

## 7. `latest` / `recommended`

Forge y Fabric aceptan estas palabras vía `VersionUtil.isPromotionVersion()` (línea 45).
NeoForge no publica `promotions_slim.json`, pero su maven expone una API equivalente.

**Trampa verificada:** el parámetro `filter` es un prefijo de texto.

```
?filter=21.1   →  21.11.45    ← ¡MC 1.21.11!
?filter=21.1.  →  21.1.249    ← MC 1.21.1, correcto
```

Sin el punto final, pedir `latest` para 1.21.1 instalaría NeoForge de Minecraft 1.21.11, y
generaría el `distribution.json` sin error aparente.

NeoForge tampoco tiene el concepto `recommended`; solo listado de versiones. La serie 21.1.x
tiene 242 versiones publicadas.

## 8. El módulo raíz ignora `classpath: false` — y eso obliga a tocar el launcher

Este hallazgo es de la auditoría, posterior a la investigación original, y corrige el
apartado 2.

En `_resolveServerLibraries()` de `processbuilder.js`, el launcher recorre los módulos raíz de
un servidor y los mete al classpath **sin mirar su bandera `classpath`**:

```js
if(type === Type.ForgeHosted || type === Type.Fabric || type === Type.Library){
    libs[mdl.getVersionlessMavenIdentifier()] = mdl.getPath()   // ← sin condición
```

La bandera solo se respeta en `_resolveModuleLibraries()`, que trata **submódulos**
(`sm.rawModule.classpath ?? true`, línea 878). Verificado en el código de
`dscalzi/HeliosLauncher` a día de hoy.

Como el diseño pone el universal de NeoForge de módulo raíz, acaba en el classpath pase lo que
pase. Y ahí rompe: el `version.json` de 21.1.248 declara
`-DignoreList=client-extra,${version_name}.jar`, que **no** incluye al universal, y el universal
**no** está entre las 47 librerías. BootstrapLauncher lo ve entonces duplicado respecto al
module path y el juego no arranca.

### Por qué con Forge no pasa

Para Forge 1.17+, `ForgeGradle3.resolver.ts` hace `unshift` de `fmlcore`, `javafmllanguage`,
`mclanguage` y `lowcodelanguage` **sin** `classpath: false`. La raíz acaba siendo `fmlcore`,
un jar que legítimamente va al classpath, y el universal queda de submódulo, donde la bandera
sí se respeta. NeoForge no tiene equivalentes de esos artefactos: se fusionaron en el propio
`neoforge`, así que la raíz solo puede ser el universal.

De ahí el parche: ver [`06-parche-launcher.md`](06-parche-launcher.md).

---

## Veredicto

| Componente | Trabajo |
|---|---|
| MCSquad Launcher | **Tres líneas** en `processbuilder.js` (hallazgo 8). Sin cambios en `helios-core`. |
| Nebula | Un resolver de NeoForge + plomería. **Ya existe implementado** en `BelgianDev/NeoNebula`: se porta, no se reescribe. Ver `04-implementacion-existente.md`. |
| Operación | Re-subir los jars parcheados en cada actualización de NeoForge |
