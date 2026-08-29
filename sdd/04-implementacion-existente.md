# 04 — Implementación existente: `BelgianDev/NeoNebula`

**Esto cambia el plan: no hay que escribir el resolver desde cero.** Existe un fork de Nebula
con soporte NeoForge completo y funcional. La ruta recomendada es portar su trabajo, no
reimplementarlo.

Se encontró revisando los ~270 forks de `dscalzi/Nebula` filtrados por actividad
(`/forks?include=active&sort_by=last_updated`). No aparece en la búsqueda de código de GitHub
porque **GitHub no indexa forks**.

## Qué contiene

Nueve commits (may 2025 – ene 2026), 760 líneas, licencia MIT con la atribución original de
Daniel D. Scalzi intacta.

```
src/resolver/neoforge/NeoForge.resolver.ts             411
src/structure/spec_model/module/NeoForgeMod.struct.ts  114
src/util/VersionUtil.ts                                +58
src/model/neoforge/{NeoForgeVersionIndex,VersionManifestNeoForge}.ts
src/index.ts, ServerMeta.ts, Server.struct.ts, LibRepo.struct.ts, Repo.struct.ts
```

Commits, del más antiguo al más reciente:

```
e1b4530  Added NeoForge support to generate server command, and to server schema
289ea68  NeoForge distribution generation
b1767f2  Added neo client srg library
c5e96a8  Working NeoForge implementation!
3977cf3  NeoForge mod loading
14578fb  Added --neoforge argument usage to readme
291acb9  Curseforge modpack neoforge support
2737574  Fixed NeoForge version resolution
552eb99  Changed NeoForge version resolution with a way more robust filter
```

## Coincidencia con `02-especificacion.md`

La especificación de este SDD se escribió de forma independiente, antes de encontrar el fork.
Coincide en los puntos de diseño no obvios, lo que valida ambos:

| Punto | `02-especificacion.md` | NeoNebula |
|---|---|---|
| Universal primero (módulo raíz) | sí | sí |
| Todos los generados con `classpath: false` | sí | sí |
| Comodín leyendo `--fml.neoFormVersion` | `${WILDCARD_NEOFORM_VERSION}` | `${formVersion}` |
| Instalador headless | `--install-client` | `--installClient` (alias equivalente) |
| `neoforge.mods.toml` | sí | sí |
| Raíz emitida como `Type.ForgeHosted` | sí | sí |

## Donde NeoNebula es mejor que la especificación

**Resolución de `latest` / `recommended`.** La spec proponía la API
`?filter=<prefijo>` advirtiendo de la trampa del punto final (`filter=21.1` devuelve
`21.11.45`, o sea MC 1.21.11).

NeoNebula evita el problema de raíz: baja el listado completo de versiones y filtra en cliente
comparando enteros (`VersionUtil.findNeoForgePromotedVersion`):

```ts
const neoMajor = parseInt(vSplit[0])
const neoMinor = parseInt(vSplit[1])
return neoMajor === minecraftMinor && neoMinor === minecraftPatch
```

**Adoptar este enfoque, no el de la spec.** La sección correspondiente de
`02-especificacion.md` §2 queda obsoleta.

## Defectos a corregir al portar

### 1. Falta el respaldo a `mods.toml` legado — impacto real

`NeoForgeMod.struct.ts:41` solo lee `META-INF/neoforge.mods.toml`. Verificado en el bytecode de
`loader-4.0.43.jar`: NeoForge 21.1.248 **sigue aceptando `META-INF/mods.toml`**, y muchos mods
de 1.21.1 aún lo traen.

Con esos mods no revienta: registra un error y cae a `attemptCrudeInference()`, que adivina
modId y versión desde el nombre del archivo. El resultado son coordenadas maven incorrectas,
lo que rompe el seguimiento de versiones entre regeneraciones.

Arreglo: intentar `neoforge.mods.toml` y, si no está, `mods.toml`, antes de dar el error.

### 2. `runInstaller` no rechaza ante fallo

Llama a `resolve()` aunque el código de salida sea distinto de cero; solo lo registra como
error. Lo salva `verifyInstallerRan` después, pero el diagnóstico queda confuso. Debería
rechazar la promesa.

### 3. Sin `javaOptions` por defecto

No fija `javaOptions.suggestedMajor: 21`. NeoForge 21.1 exige Java 21, así que hay que
declararlo en el `servermeta.json` del servidor a mano (ver `02-especificacion.md` §3).

## Estado respecto al upstream

NeoNebula se separó en `47d2dc2` (feb 2025). Le faltan **dos** commits del upstream, ambos de
mantenimiento:

- `b227ac9` Dependency upgrade (dic 2025)
- `7ffc978` Upgrade to Node.js 22 (ene 2026)

Este fork (`wally720/Nebula`) ya está en `7ffc978`. Por lo tanto **se portan sus 9 commits
sobre el nuestro**, no al revés.

## Ruta recomendada

```bash
git remote add neonebula https://github.com/BelgianDev/NeoNebula.git
git fetch neonebula
git cherry-pick 47d2dc2..552eb99      # los 9 commits de NeoForge
```

Conflictos esperados en `src/index.ts` y `package.json` por los dos commits de mantenimiento
del upstream. Son menores.

Después: aplicar los tres arreglos de arriba, y seguir la verificación de
`03-plan-implementacion.md` sin cambios — sigue siendo válida palabra por palabra, incluido el
paso 7 (probar que un mod carga de verdad), que sigue sin estar verificado.

## Atribución

MIT. Al portar, **conservar la autoría de los commits** (`cherry-pick` lo hace solo) y el aviso
de copyright del `LICENSE`.
