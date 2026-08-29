# SDD — Soporte NeoForge

Documentación de diseño para agregar **NeoForge ≥ 21.1.248 (Minecraft 1.21.1)** al
ecosistema MCSquad.

**Conclusión de la investigación: el launcher (MCSquad Launcher) no requiere cambios. Todo el
trabajo está en este repositorio, Nebula**, el generador del `distribution.json`.

## Índice

| Documento | Contenido |
|---|---|
| [`01-investigacion.md`](01-investigacion.md) | Hallazgos y la evidencia que los respalda. Léelo primero. |
| [`02-especificacion.md`](02-especificacion.md) | Especificación técnica del resolver de NeoForge. |
| [`03-plan-implementacion.md`](03-plan-implementacion.md) | Pasos, verificación y puntos abiertos. |
| [`evidencia/`](evidencia/) | Artefactos reales extraídos del instalador de NeoForge 21.1.248. |

## Estado

- [x] Investigación y validación técnica
- [x] Fork creado
- [ ] Implementación
- [ ] Pruebas de punta a punta

## Metodología

Todo lo afirmado se verificó contra artefactos reales —el instalador de NeoForge 21.1.248,
los jars de FancyModLoader, modlauncher y BootstrapLauncher, y el código fuente de Nebula y
helios-core—, no contra documentación ni memoria. Cada afirmación en `01-investigacion.md`
lleva su método de verificación al lado.

La única afirmación **no** verificada de punta a punta está marcada como punto abierto: que un
mod cargue realmente por `--fml.mavenRoots` / `--fml.modLists`. Eso solo se comprueba lanzando
el juego.
