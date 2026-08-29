# 02 — Especificación técnica

Alcance de esta entrega: **NeoForge 21.1.x sobre Minecraft 1.21.1**. La mecánica es la misma
desde NeoForge 20.2 (BootstrapLauncher + FancyModLoader), así que extenderlo después debería
ser cuestión de ampliar `isForVersion`.

Todo lo que sigue va en este repositorio (Nebula). El launcher no se toca.

---

## 1. `src/resolver/neoforge/NeoForge.resolver.ts`

Adaptado de `ForgeGradle3Adapter`. Diferencias respecto al original:

| | Forge | NeoForge |
|---|---|---|
| Maven remoto | `maven.minecraftforge.net` | `maven.neoforged.net/releases` |
| Grupo:artefacto | `net.minecraftforge:forge` | `net.neoforged:neoforge` |
| Formato de versión | `<mc>-<forgeVer>` | `21.1.248` (sin versión de MC) |
| Carpeta en `versions/` | `1.21.1-forge-x.y.z` | `neoforge-21.1.248` |
| Instalador | GUI, paso manual | `--install-client <dir>`, headless |
| Comodín de versión | `--fml.mcpVersion` | `--fml.neoFormVersion` |
| Metadatos de mod | `META-INF/mods.toml` | `META-INF/neoforge.mods.toml` |

### 1.1 `generatedFiles` — el orden es significativo

`processForgeModule` hace `const forgeModule = mdls.shift()!` (`ForgeGradle3.resolver.ts:530`), así que **el primer elemento se
convierte en el módulo raíz `ForgeHosted`**. Y `processbuilder.js:842-843` del launcher mete el
módulo raíz al classpath **ignorando su bandera `classpath`** (solo se respeta en submódulos,
línea 876). Por eso el universal va primero.

```ts
// mcAndNeoFormVersion = `${minecraftVersion}-${WILDCARD_NEOFORM_VERSION}`
[
  { name: 'universal jar', group: 'net.neoforged',  artifact: 'neoforge',
    version: this.artifactVersion, classifiers: ['universal'], classpath: false }, // ← raíz
  { name: 'client jar',    group: 'net.neoforged',  artifact: 'neoforge',
    version: this.artifactVersion, classifiers: ['client'],    classpath: false },
  { name: 'client srg',    group: 'net.minecraft',  artifact: 'client',
    version: mcAndNeoFormVersion,  classifiers: ['srg'],       classpath: false },
  { name: 'client extra',  group: 'net.minecraft',  artifact: 'client',
    version: mcAndNeoFormVersion,  classifiers: ['extra'],     classpath: false },
  { name: 'client slim',   group: 'net.minecraft',  artifact: 'client',
    version: mcAndNeoFormVersion,  classifiers: ['slim'],      classpath: false },
]
```

Todos con `classpath: false`, siguiendo el bloque de Forge 1.13-1.20.2 de
`ForgeGradle3.resolver.ts` (líneas 121-180 y 240-290) — el análogo estructural correcto, mismo
stack BootstrapLauncher/modlauncher. En el universal la bandera es cosmética por ser raíz.

Razón de fondo: NeoForge resuelve estos artefactos por `-DlibraryDirectory` vía
`LibraryFinder.findPathForMaven`, no por el classpath.

`client slim` estrictamente no lo exige `ProductionClientProvider` (solo pide `srg` y `extra`),
pero Forge lo declara y al ir fuera del classpath no estorba. Ver punto abierto en
`03-plan-implementacion.md`.

### 1.2 Versión de NeoForm

Se resuelve con el mecanismo de comodines **que ya existe**, cambiando la clave que lee
`getMCPVersion`:

```ts
private getNeoFormVersion(args: string[]): string | null {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--fml.neoFormVersion') return args[i + 1]
    }
    return null
}
```

Los game args de 21.1.248 son:

```
--fml.neoForgeVersion 21.1.248 --fml.fmlVersion 4.0.43
--fml.mcVersion 1.21.1 --fml.neoFormVersion 20240808.144430
--launchTarget forgeclient
```

De ahí `mcAndNeoFormVersion` = `1.21.1-20240808.144430`.

### 1.3 Ejecución del instalador

```ts
spawn(JavaUtil.getJavaExecutable(), [
    '-jar', installerExec,
    '--install-client', installerOutputDir
], { cwd: dirname(installerExec) })
```

El `launcher_profiles.json` con `{}` que Nebula ya escribe (línea 355) sigue siendo necesario.
Se puede eliminar el bloque de log `============== [ IMPORTANT ] ==============`.

### 1.4 `processLibraries`

Sin cambios funcionales: emite todo lo que traiga `downloads.artifact.url`. Las 47 librerías de
NeoForge lo traen. Solo cambia el `name` mostrado (`Minecraft Forge (...)` → `NeoForge (...)`).

---

## 2. Plomería

### `src/structure/repo/VersionRepo.struct.ts`
`getFileName()` devuelve `${mc}-${name}-${loader}`. NeoForge necesita `neoforge-${loader}`,
que es lo que escribe su instalador. Parametrizar o sobrescribir.

### `src/structure/repo/Repo.struct.ts`
Instanciar `RepoStructure` con nombre `'neoforge'`; equivalente de `getForgeCacheDirectory`.

### `src/structure/spec_model/module/NeoForgeMod.struct.ts`
Copia de `ForgeMod113.struct.ts`. Dos cambios:

- `processZip` debe leer `META-INF/neoforge.mods.toml`, con respaldo a `mods.toml` (NeoForge
  aún acepta el nombre legado).
- El directorio de mods `'neoforgemods'` se declara en el `super(...)` del constructor, igual
  que `'forgemods'` en `ForgeMod.struct.ts:20` y `'fabricmods'` en `FabricMod.struct.ts:18`.

El tipo de módulo emitido sigue siendo `Type.ForgeMod` (no existe `Type.NeoForgeMod`, y el
launcher lo trata igual). Claritas se reutiliza sin cambios.

### `src/util/VersionSegmentedRegistry.ts`
Registrar el resolver y el struct de mods.

### `src/model/nebula/ServerMeta.ts`
Campo `neoforge?: { version: string }` y su rama en `getDefaultServerMeta`.

### `src/index.ts`
Opción `--neoforge` en `generate server`, en conflicto con `--forge` y `--fabric` (extender el
`.conflicts('forge','fabric')` de la línea 183). Comando `latest-neoforge <version>` como
espejo de `latest-forge` (línea 386); `recommended-neoforge` no aplica.

**La advertencia de Forge 1.20.3+ se conserva**: sigue siendo cierta para Forge.

### `src/util/VersionUtil.ts`
`getPromotedNeoForgeVersion(minecraftVersion, promotion)`, para que `--neoforge latest`
funcione como `--forge latest`:

```
https://maven.neoforged.net/api/maven/latest/version/releases/net%2Fneoforged%2Fneoforge?filter=<prefijo>
```

- **El prefijo debe llevar punto final.** `filter=21.1` devuelve `21.11.45` (MC 1.21.11);
  `filter=21.1.` devuelve `21.1.249`. El filtro es prefijo de texto.
- Mapeo: MC `1.<minor>.<patch>` → prefijo `<minor>.<patch ?? 0>.` (1.21.1 → `21.1.`;
  1.21 → `21.0.`).
- `recommended` no existe en NeoForge. Replicar lo que ya hace `getPromotedForgeVersion`
  (líneas 83-90): avisar por log y caer a `latest`.

---

## 3. Salida esperada

El `distribution.json` generado debe contener, para el servidor:

- módulo raíz `Type.ForgeHosted` = `net.neoforged:neoforge:21.1.248:universal`
- submódulo `Type.VersionManifest` con el `version.json` de NeoForge
- 47 submódulos `Type.Library` (dependencias, todas desde `maven.neoforged.net`)
- 4 submódulos `Type.Library` generados (`client`, `srg`, `extra`, `slim`) con
  `"classpath": false`
- `javaOptions.suggestedMajor: 21` en el servidor (NeoForge 21.1 exige Java 21)

Esa forma es exactamente la que `loadModLoaderVersionJson` de helios-core espera, y por la que
`isForgeGradle3()` enruta sin cambios.
