# 07 — Auditoría del código portado

Revisión del código ya portado y corregido, buscando fallos. Siete hallazgos. El primero
cambió la conclusión del SDD y tiene documento propio; el resto se lista aquí con su evidencia
y su estado.

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | El launcher sí necesita un parche | alta | documentado en [`06-parche-launcher.md`](06-parche-launcher.md) |
| 2 | No hay validación de versión de Minecraft | media | **corregido** con una guarda de versión mínima |
| 3 | Un fallo de descarga envenena la caché | media | **aplazado** a propósito, ver abajo |
| 4 | Claritas no reconoce mods de NeoForge | baja | **mitigado**: el error pasó a warning explicativo |
| 5 | Mensaje de error dice «Forge» donde es NeoForge | cosmética | **corregido** |
| 6 | `latest` depende del orden de la API | baja | **corregido** con orden numérico explícito |
| 7 | Un `servermeta.json` con `forge` y `neoforge` da dos raíces | baja | **no se aplica**, descartado |

## 2. No hay validación de versión de Minecraft

`NeoForgeResolver.isForVersion()` **no se llama nunca**. Fabric sí valida
(`Server.struct.ts:222`) y Forge valida vía `VersionSegmentedRegistry`; el bloque de NeoForge no
hace ninguna de las dos cosas. El registro que pedía `02-especificacion.md` §2 no se llegó a
hacer.

El método que existe es copia del de Forge: acepta MC 12-21 y llama a `isOneDotTwelveFG2` con la
versión de NeoForge, lo cual no significa nada. NeoForge solo existe desde MC 1.20.2.

Reproducido:

```
$ nebula generate server BadVer 1.16.5 --neoforge 21.1.248     # aceptado sin queja
$ nebula generate distro
Error: Required file client extra not found at any expected location:
    .../libraries/net/minecraft/client/1.16.5-20240808.144430/client-1.16.5-20240808.144430-extra.jar
```

El error llega tarde, no dice cuál es el problema real, y **aborta la generación de toda la
distribución**, no solo la del servidor mal configurado.

### Cómo se corrigió

Se descartó revivir `isForVersion` —seguiría siendo código muerto salvo que se rehiciera todo el
registro— por algo más directo: una guarda de versión mínima en `Server.struct.ts`, en el punto
donde `generate distro` procesa un servidor de NeoForge. Falla al instante, antes de bajar nada:

```
Error: NeoForge is not supported on Minecraft 1.16.5 (server BadVer (Minecraft 1.16.5)).
       The minimum supported version is 1.20.4.
```

El mínimo vive en la constante `MINIMUM_NEOFORGE_MINECRAFT_VERSION`. **Está puesto en 1.20.4 por
decisión de proyecto, no por límite de NeoForge**: NeoForge existe desde 1.20.2, así que bajarlo
es cambiar un carácter si algún día hacen falta 1.20.2 o 1.20.3.

`isForVersion` sigue siendo código muerto y sigue siendo copia del de Forge. No estorba, pero
conviene saberlo si alguien lo lee esperando que haga algo.

## 3. Una descarga fallida deja un jar de 0 bytes que nunca se reintenta

`BaseMavenRepo.downloadArtifactDirect()` solo escucha errores del `writer`, nunca del request.
Ante un 404 escribe el cuerpo HTML —o nada— y el proceso muere con un volcado de `got`
ilegible.

Lo grave es la siguiente ejecución: `artifactExists()` es un `pathExists()` a secas, así que da
por bueno el fichero de 0 bytes, registra *«Using locally discovered NeoForge installer»* y el
instalador falla con `Invalid or corrupt jarfile` **indefinidamente**, hasta borrarlo a mano.

Esto es lo que enmascaró el defecto del `/releases` durante la implementación (ver
`05-verificacion.md`).

Es código compartido: afecta igual a Forge y a Fabric.

**Decisión: aplazado a propósito**, para no meter mano al núcleo de un fork que se quiere poder
rebasar contra `dscalzi/Nebula`. Queda anotado aquí como trabajo futuro.

Mientras tanto, el síntoma y su remedio manual: si el instalador falla con
`Invalid or corrupt jarfile`, borrar el jar de 0 bytes bajo `repo/lib/` y repetir. Es un bug de
upstream, así que el arreglo (comprobar el código de estado y borrar el fichero parcial) sería
un buen PR a `dscalzi/Nebula`.

## 4. Claritas no reconoce los mods de NeoForge

`02-especificacion.md` §2 afirma que «Claritas se reutiliza sin cambios». No es exacto.

Extraído `libraries/java/Claritas.jar`: solo conoce la anotación
`net.minecraftforge.fml.common.Mod`. Los mods de NeoForge usan `net.neoforged.fml.common.Mod`.

Comprobado con JEI real (`jei-1.21.1-neoforge-19.50.0.414.jar`):

```
[NeoForgeModStructure] Claritas failed to yield metadata for NeoForgeMod jei-...jar!
→ id generado: "generated.forgemod:jei:19.50.0.414@jar"      (el grupo real es mezz.jei)
```

**Todos** los mods de NeoForge caen al grupo por defecto. No rompe la carga —las coordenadas
son internamente consistentes y las URLs apuntan bien—, pero la metadata queda degradada.

### Cómo se mitigó

Arreglarlo de verdad es actualizar Claritas, que es otro repositorio y otro trabajo. Se decidió
no hacerlo ahora. Lo que sí se hizo es dejar de mentir en el log: los dos `error` pasaron a un
solo `warn` que explica que es lo esperado:

```
[warn] Claritas yielded no metadata for NeoForgeMod jei-...jar; falling back to the default group.
```

Antes decía «Is this mod malformatted or does Claritas need an update?», que hacía pensar en un
mod roto cuando no lo hay. El grupo genérico `generated.forgemod` sigue estando ahí; si algún
día molesta, la solución es enseñarle a Claritas la anotación `net.neoforged.fml.common.Mod`.

## 5, 6, 7 — menores

- `VersionUtil.ts:117`: el mensaje dice `No latest version found for **Forge** <ver>` cuando
  quien falló fue NeoForge. Copia-pega; despista al diagnosticar.
- `findNeoForgePromotedVersion` se queda con el **último elemento del array** que devuelve la
  API, asumiendo orden ascendente. Hoy es cierto (242 versiones de la serie 21.1.x, orden
  numérico correcto, devuelve `21.1.249`), pero es una dependencia de un detalle no
  documentado. Un `sort` numérico explícito lo blindaría.
- `_doSeverRetrieval` trata `serverMeta.forge` y `serverMeta.neoforge` como `if` independientes:
  un `servermeta.json` editado a mano con ambos genera **dos módulos raíz**. El `.conflicts()`
  del CLI protege la creación, no el fichero. **Descartado**: no se da en el flujo real, donde
  los `servermeta.json` los genera Nebula.

## Lo que se comprobó sano

- **85 URLs del `distribution.json` verificadas** contra el disco: todas resuelven a ficheros
  reales, con MD5 y tamaño coincidentes. Ningún desajuste ruta/URL.
- El respaldo a `mods.toml` legado funciona: un jar de prueba con el nombre antiguo produce
  `legacytest:3.2.1` con el `displayName` del TOML, sin inferencia burda.
- De seis mods populares de 1.21.1 (JEI, ModernFix, Cloth Config, Architectury, Balm, Citadel),
  **los seis** usan ya `neoforge.mods.toml`. El «impacto real» que `04` atribuía a ese defecto
  está sobrevalorado: la corrección es defensiva, no urgente.
- El `ServerMetaSchema` generado incluye `neoforge` y `javaOptions`.
