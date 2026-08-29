# SDD — Soporte NeoForge

Documentación de diseño para agregar **NeoForge ≥ 21.1.248 (Minecraft 1.21.1)** al
ecosistema MCSquad.

**Conclusión: casi todo el trabajo está en este repositorio, Nebula**, el generador del
`distribution.json`. El launcher necesita **un solo cambio de tres líneas**, y ninguna versión
nueva de `helios-core`.

> **Corrección (auditoría posterior).** La primera versión de este SDD afirmaba que el launcher
> no requería cambio alguno. **Era incorrecto.** El módulo raíz de un servidor va al classpath
> ignorando su bandera `classpath: false`, y el universal de NeoForge en el classpath rompe el
> arranque del juego. Hace falta la guarda de `processbuilder.js` descrita en
> [`06-parche-launcher.md`](06-parche-launcher.md). El resto de la conclusión se mantiene.

> **Hallazgo posterior:** el resolver **no hay que escribirlo desde cero**. El fork
> `BelgianDev/NeoNebula` ya tiene una implementación completa de NeoForge (760 líneas, MIT) que
> coincide con la especificación de este SDD en todos los puntos de diseño no obvios. La ruta
> recomendada es portar sus 9 commits y corregir tres defectos. Ver
> [`04-implementacion-existente.md`](04-implementacion-existente.md).

## Índice

| Documento | Contenido |
|---|---|
| [`01-investigacion.md`](01-investigacion.md) | Hallazgos y la evidencia que los respalda. Léelo primero. |
| [`02-especificacion.md`](02-especificacion.md) | Especificación técnica del resolver de NeoForge. |
| [`03-plan-implementacion.md`](03-plan-implementacion.md) | Pasos, verificación y puntos abiertos. |
| [`04-implementacion-existente.md`](04-implementacion-existente.md) | **Ya existe una implementación funcional en otro fork.** Léelo antes de escribir código. |
| [`05-verificacion.md`](05-verificacion.md) | Resultado de la implementación y las pruebas ejecutadas. |
| [`06-parche-launcher.md`](06-parche-launcher.md) | **El cambio que sí hay que hacer en el launcher.** Obligatorio. |
| [`07-auditoria.md`](07-auditoria.md) | Auditoría del código portado: 7 fallos, su estado y su evidencia. |
| [`evidencia/`](evidencia/) | Artefactos reales extraídos del instalador de NeoForge 21.1.248. |

## Estado

- [x] Investigación y validación técnica
- [x] Fork creado
- [x] Implementación (9 commits portados desde `BelgianDev/NeoNebula` + 5 correcciones)
- [x] Pruebas de generación de punta a punta (`generate distro` con NeoForge 21.1.248)
- [x] Parche del launcher identificado y verificado (ver [`06-parche-launcher.md`](06-parche-launcher.md))
- [x] Auditoría del código portado (ver [`07-auditoria.md`](07-auditoria.md))
- [ ] Aplicar el parche a MCSquad Launcher
- [ ] Prueba de carga de mods in-game — **pendiente, requiere el launcher parcheado**

Ver [`05-verificacion.md`](05-verificacion.md) para el resultado de las pruebas y lo que
queda sin verificar.

## Metodología

Todo lo afirmado se verificó contra artefactos reales —el instalador de NeoForge 21.1.248,
los jars de FancyModLoader, modlauncher y BootstrapLauncher, y el código fuente de Nebula y
helios-core—, no contra documentación ni memoria. Cada afirmación en `01-investigacion.md`
lleva su método de verificación al lado.

La única afirmación **no** verificada de punta a punta está marcada como punto abierto: que un
mod cargue realmente por `--fml.mavenRoots` / `--fml.modLists`. Eso solo se comprueba lanzando
el juego.
