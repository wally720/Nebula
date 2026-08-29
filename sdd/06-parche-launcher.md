# 06 — El parche del launcher

**Obligatorio.** Sin él, un servidor de NeoForge generado por este Nebula **no arranca**: el
universal entra al classpath y BootstrapLauncher falla. Ver el hallazgo 8 de
`01-investigacion.md` para el porqué.

Este documento corrige la afirmación original del SDD de que el launcher no requería cambios.

## El cambio

En `app/assets/js/processbuilder.js`, dentro de `_resolveServerLibraries()`:

```diff
         for(let mdl of mdls){
             const type = mdl.rawModule.type
             if(type === Type.ForgeHosted || type === Type.Fabric || type === Type.Library){
-                libs[mdl.getVersionlessMavenIdentifier()] = mdl.getPath()
+                if (mdl.rawModule.classpath !== false)
+                    libs[mdl.getVersionlessMavenIdentifier()] = mdl.getPath()
+
                 if(mdl.subModules.length > 0){
```

Eso es todo. Hace que el módulo raíz respete `classpath: false` igual que ya lo respetan los
submódulos en `_resolveModuleLibraries()`.

## De dónde sale

De `BelgianDev/Crafted-Launcher-Legacy`, el fork de HeliosLauncher del mismo autor de
NeoNebula, commit:

```
baf2a2792bc260c5279bb8fa30ca4661ee894946
RaftDev <theraft08@gmail.com>   2025-05-05
"Don't include modloaders that have the classpath field on false"
```

Es decir: **el mismo autor cuyo resolver portamos ya tenía este parche en su launcher**. Su
NeoForge funciona con estas dos piezas juntas, no solo con Nebula.

Cuidado al mirar ese commit: toca dos ficheros, pero el segundo (`distromanager.js`) solo
cambia la URL de su propio CDN y no tiene nada que ver. Solo importa el hunk de arriba.

## Verificación hecha

Comparado `processbuilder.js` de `dscalzi/HeliosLauncher` (master) contra el de
`Crafted-Launcher-Legacy`. Difieren en cuatro sitios:

| Línea | Diferencia | ¿Relevante? |
|---|---|---|
| 843 | la guarda de `classpath` | **sí, es el parche** |
| 99 | `child.on('close', (code, signal) =>` | no, deriva del fork |
| 237 | `catch (err)` vs `catch (_err)` | no, deriva del fork |
| 869 | `!mdl.subModules.length > 0` vs `=== 0` | no, deriva del fork |

Las tres últimas son residuo de que su fork va algo por detrás del upstream, no cambios
intencionados.

Además, en todo su launcher:

- `grep -rin neoforge app/` → **cero resultados**. No hay ningún soporte específico de NeoForge:
  ni tipo de módulo nuevo, ni rama de código, ni caso especial.
- `helios-core` es `~2.3.0`, **la misma versión que el upstream** y la misma que analizó
  `01-investigacion.md`. No la modificó ni la actualizó.
- Entre abril y julio de 2025 solo hay dos commits, y el único relevante es el de arriba.

O sea: la conclusión original del SDD era casi correcta. El launcher no necesita entender
NeoForge en absoluto, ni una versión nueva de helios-core. Necesita exactamente esta guarda.

## Coste recurrente

El parche vive en un fichero que el upstream también toca, así que **hay que reaplicarlo cada
vez que MCSquad Launcher se actualice o se rebase contra HeliosLauncher**. Son tres líneas, pero
si se pierden en un merge el síntoma es un crash al arrancar el juego, muy lejos de su causa.

Conviene dejarlo anotado donde el que haga el merge lo vea, no solo aquí.

## La alternativa que no se tomó

Se podría evitar el parche haciendo que la raíz fuese un artefacto seguro en el classpath, como
hace Forge con `fmlcore`. NeoForge no tiene equivalente —esos módulos se fusionaron en el propio
`neoforge`— así que habría que elegir de raíz alguna de las 47 librerías del `version.json`, con
efectos no verificados sobre cómo el launcher identifica el cargador de mods.

Descartado: nadie lo ha probado, mientras que la ruta del parche está en producción en el
launcher de RaftDev.
