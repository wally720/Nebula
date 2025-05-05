import { BaseResolver } from '../BaseResolver.js'
import { MinecraftVersion } from '../../util/MinecraftVersion.js'
import { Module, Type } from 'helios-distribution-types'
import { VersionUtil } from '../../util/VersionUtil.js'
import { RepoStructure } from '../../structure/repo/Repo.struct.js'
import { LoggerUtil } from '../../util/LoggerUtil.js'
import { LibRepoStructure } from '../../structure/repo/LibRepo.struct.js'
import { copy, mkdirs, pathExists, remove } from 'fs-extra/esm'
import { basename, dirname, join } from 'path'
import { lstat, readFile, writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import { JavaUtil } from '../../util/java/JavaUtil.js'
import { VersionManifestNeoForge } from '../../model/neoforge/VersionManifestNeoForge.js'
import { MavenUtil } from '../../util/MavenUtil.js'
import { URL } from 'url'

interface GeneratedFile {
    name: string
    group: string
    artifact: string
    version: string
    classifiers: string[] | [undefined]
    skipIfNotPresent?: boolean
    classpath?: boolean
}

export class NeoForgeResolver extends BaseResolver {
    private static readonly logger = LoggerUtil.getLogger('NeoForgeResolver')
    private static readonly WILDCARD_NEOFORM_VERSION = '${formVersion}'

    protected readonly REMOTE_REPOSITORY = 'https://maven.neoforged.net/'

    protected repoStructure: RepoStructure
    private generatedFiles: GeneratedFile[] | undefined
    private wildcardsInUse: string[] | undefined

    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        protected minecraftVersion: MinecraftVersion,
        protected neoforgeVersion: string,
        protected discardOutput: boolean,
        protected invalidateCache: boolean
    ) {
        super(absoluteRoot, relativeRoot, baseUrl)
        this.repoStructure = new RepoStructure(absoluteRoot, relativeRoot, 'neoforge')
        this.configure()
    }

    isForVersion(version: MinecraftVersion, libraryVersion: string): boolean {
        if(version.getMinor() === 12 && VersionUtil.isOneDotTwelveFG2(libraryVersion)) {
            return false
        }
        return VersionUtil.isVersionAcceptable(version, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    }

    getModule(): Promise<Module> {
        return this.process()
    }

    private configure(): void {
        const neoFormUnifiedVersion = `${this.minecraftVersion}-${NeoForgeResolver.WILDCARD_NEOFORM_VERSION}`

        this.generatedFiles = [
            {
                name: 'universal jar',
                group: LibRepoStructure.NEOFORGE_GROUP,
                artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                version: this.neoforgeVersion,
                classifiers: ['universal'],
                classpath: false
            },
            {
                name: 'client jar',
                group: LibRepoStructure.NEOFORGE_GROUP,
                artifact: LibRepoStructure.NEOFORGE_ARTIFACT,
                version: this.neoforgeVersion,
                classifiers: ['client'],
                classpath: false
            },
            {
                name: 'client extra',
                group: LibRepoStructure.MINECRAFT_GROUP,
                artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                version: neoFormUnifiedVersion,
                classifiers: ['extra'],
                classpath: false
            },
            {
                name: 'client slim',
                group: LibRepoStructure.MINECRAFT_GROUP,
                artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                version: neoFormUnifiedVersion,
                classifiers: ['slim'],
                classpath: false
            },
            {
                name: 'client srg',
                group: LibRepoStructure.MINECRAFT_GROUP,
                artifact: LibRepoStructure.MINECRAFT_CLIENT_ARTIFACT,
                version: neoFormUnifiedVersion,
                classifiers: ['srg'],
                classpath: false
            }
        ]

        this.wildcardsInUse = [
            NeoForgeResolver.WILDCARD_NEOFORM_VERSION
        ]
    }

    private async process(): Promise<Module> {
        const libRepo = this.repoStructure.getLibRepoStruct()

        const installerPath = libRepo.getLocalNeoForge(this.neoforgeVersion, 'installer')
        NeoForgeResolver.logger.debug(`Checking for NeoForge installer at ${installerPath}..`)
        if (!await libRepo.artifactExists(installerPath)) {
            NeoForgeResolver.logger.debug('NeoForge installer not found locally, initializing download..')
            await libRepo.downloadArtifactByComponents(
                this.REMOTE_REPOSITORY,
                LibRepoStructure.NEOFORGE_GROUP,
                LibRepoStructure.NEOFORGE_ARTIFACT,
                this.neoforgeVersion, 'installer', 'jar'
            )
        } else {
            NeoForgeResolver.logger.debug('Using locally discovered NeoForge installer.')
        }

        NeoForgeResolver.logger.debug(`Beginning processing of NeoForge v${this.neoforgeVersion} (Minecraft ${this.minecraftVersion})`)
        return await this.processWithInstaller(installerPath)
    }

    private async processWithInstaller(installerPath: string): Promise<Module> {
        let installLoader = true

        const cacheDir = this.repoStructure.getNeoForgeCacheDirectory(this.neoforgeVersion)
        if (await pathExists(cacheDir)) {
            if (this.invalidateCache) {
                NeoForgeResolver.logger.info(`Removing existing cache ${cacheDir}..`)
                await remove(cacheDir)
            } else {
                installLoader = false
                NeoForgeResolver.logger.info(`Using cached results at ${cacheDir}.`)
            }
        } else {
            await mkdirs(cacheDir)
        }

        const installerOutDir = cacheDir
        if (installLoader) {
            const installer = join(installerOutDir, basename(installerPath))
            await copy(installerPath, installer)

            // Required for the installer to function.
            await writeFile(join(installerOutDir, 'launcher_profiles.json'), JSON.stringify({}))

            NeoForgeResolver.logger.debug('Starting NeoForge installer.')
            await this.runInstaller(installer, installerOutDir)
            NeoForgeResolver.logger.debug('Installer finished, beginning processing..')
        }

        await this.verifyInstallerRan(installerOutDir)

        NeoForgeResolver.logger.debug('Processing Version Manifest')
        const versionManifestTuple = await this.processVersionManifest(installerOutDir)
        const versionManifest = versionManifestTuple[0]

        NeoForgeResolver.logger.debug('Processing generated NeoForge files.')
        const forgeModule = await this.processNeoForgeModule(versionManifest, installerOutDir)

        // Attach version.json module
        forgeModule.subModules?.unshift(versionManifestTuple[1])

        NeoForgeResolver.logger.debug('Processing Libraries')
        const libs = await this.processLibraries(versionManifest, installerOutDir)

        forgeModule.subModules = forgeModule.subModules?.concat(libs)

        if (this.discardOutput) {
            NeoForgeResolver.logger.info(`Removing installer output at ${installerOutDir}..`)
            await remove(installerOutDir)
            NeoForgeResolver.logger.info('Removed installer output successfully.')
        }

        return forgeModule
    }

    private async verifyInstallerRan(installerOutputDir: string): Promise<void> {
        const versionManifestPath = this.getVersionManifestPath(installerOutputDir)

        if( !await pathExists(versionManifestPath)) {
            await remove(installerOutputDir)
            throw new Error('NeoForge installation failed.')
        }
    }

    private getVersionManifestPath(installerOutputDir: string): string {
        const versionName = this.getVersionManifestName()
        return join(installerOutputDir, 'versions', versionName, `${versionName}.json`)
    }

    private getVersionManifestName(): string {
        return `neoforge-${this.neoforgeVersion}`
    }

    // Modified installer method from ForgeGradle3Adapter, that doesn't require user interaction.
    private runInstaller(installerPath: string, outputDir: string): Promise<void> {
        return new Promise(resolve => {
            const installerLogger = LoggerUtil.getLogger('NeoForge Installer')
            const child = spawn(JavaUtil.getJavaExecutable(), [
                '-jar', installerPath, '--installClient', outputDir
            ], {cwd: dirname(installerPath)})

            child.stdout.on('data', (data) => {installerLogger.info(data.toString('utf8').trim())})
            child.stderr.on('data', (data) => {installerLogger.error(data.toString('utf8').trim())})

            child.on('close', code => {
                if(code === 0) {
                    installerLogger.info('Installer exited with code', code)
                } else {
                    installerLogger.error('Installer exited with code', code)
                }

                resolve()
            })
        })
    }

    private async processVersionManifest(installerOutDir: string): Promise<[VersionManifestNeoForge, Module]> {
        const versionRepo = this.repoStructure.getVersionRepoStruct()
        const manifestPath = this.getVersionManifestPath(installerOutDir)
        const manifestName = this.getVersionManifestName()

        const manifestBuffer = await readFile(manifestPath)
        const manifest = JSON.parse(manifestBuffer.toString()) as VersionManifestNeoForge

        const manifestModule: Module = {
            id: this.neoforgeVersion,
            name: 'Minecraft NeoForge (version.json)',
            type: Type.VersionManifest,
            artifact: this.generateArtifact(
                manifestBuffer,
                await lstat(manifestPath),
                new URL(join(versionRepo.getRelativeRoot(), manifestName,`${manifestName}.json`), this.baseUrl).toString(),
            )
        }

        const destination = join(versionRepo.getContainerDirectory(), manifestName, `${manifestName}.json`)
        await copy(manifestPath, destination, {overwrite: true})
        return [manifest, manifestModule]
    }

    private async processNeoForgeModule(versionManifest: VersionManifestNeoForge, installerOutputDir: string): Promise<Module> {
        const libDir = join(installerOutputDir, 'libraries')

        if(this.wildcardsInUse) {
            if(this.wildcardsInUse.includes(NeoForgeResolver.WILDCARD_NEOFORM_VERSION)) {

                const mcpVersion = this.getNeoFormVersion(versionManifest.arguments.game)
                if(mcpVersion == null) {
                    throw new Error('NeoForm Version not found.. did NeoForge change their format?')
                }

                this.generatedFiles = this.generatedFiles!.map(f => {
                    if(f.version.includes(NeoForgeResolver.WILDCARD_NEOFORM_VERSION)) {
                        return {
                            ...f,
                            version: f.version.replace(NeoForgeResolver.WILDCARD_NEOFORM_VERSION, mcpVersion)
                        }
                    }
                    return f
                })

            }
        }

        const mdls: Module[] = []

        for (const entry of this.generatedFiles!) {

            const targetLocations: string[] = []
            let located = false

            classifierLoop:
            for (const _classifier of entry.classifiers) {

                const targetLocalPath = join(
                    libDir,
                    MavenUtil.mavenComponentsAsNormalizedPath(entry.group, entry.artifact, entry.version, _classifier)
                )

                targetLocations.push(targetLocalPath)

                const exists = await pathExists(targetLocalPath)
                if (exists) {

                    mdls.push({
                        id: MavenUtil.mavenComponentsToIdentifier(
                            entry.group,
                            entry.artifact,
                            entry.version,
                            _classifier
                        ),
                        name: `Minecraft NeoForge (${entry.name})`,
                        type: Type.Library,
                        classpath: entry.classpath ?? true,
                        artifact: this.generateArtifact(
                            await readFile(targetLocalPath),
                            await lstat(targetLocalPath),
                            this.repoStructure.getLibRepoStruct().getArtifactUrlByComponents(
                                this.baseUrl,
                                entry.group,
                                entry.artifact,
                                entry.version,
                                _classifier
                            )
                        ),
                        subModules: []
                    })

                    const destination = this.repoStructure.getLibRepoStruct().getArtifactByComponents(
                        entry.group,
                        entry.artifact,
                        entry.version,
                        _classifier
                    )

                    await copy(targetLocalPath, destination, {overwrite: true})

                    located = true
                    break classifierLoop

                }

            }

            if (!entry.skipIfNotPresent && !located) {
                throw new Error(`Required file ${entry.name} not found at any expected location:\n\t${targetLocations.join('\n\t')}`)
            }

        }

        const forgeModule = mdls.shift()!
        forgeModule.type = Type.ForgeHosted
        forgeModule.subModules = mdls

        return forgeModule
    }

    private async processLibraries(manifest: VersionManifestNeoForge, installerOutputDir: string): Promise<Module[]> {
        const libDir = join(installerOutputDir, 'libraries')
        const libRepo = this.repoStructure.getLibRepoStruct()

        const mdls: Module[] = []

        for (const entry of manifest.libraries) {
            const artifact = entry.downloads.artifact
            if (artifact.url) {

                const targetLocalPath = join(libDir, artifact.path)

                if (!await pathExists(targetLocalPath)) {
                    throw new Error(`Expected library ${entry.name} not found!`)
                }

                const components = MavenUtil.getMavenComponents(entry.name)

                mdls.push({
                    id: entry.name,
                    name: `Minecraft NeoForge (${components.artifact})`,
                    type: Type.Library,
                    artifact: this.generateArtifact(
                        await readFile(targetLocalPath),
                        await lstat(targetLocalPath),
                        libRepo.getArtifactUrlByComponents(
                            this.baseUrl,
                            components.group,
                            components.artifact,
                            components.version,
                            components.classifier,
                            components.extension
                        )
                    )
                })
                const destination = libRepo.getArtifactByComponents(
                    components.group,
                    components.artifact,
                    components.version,
                    components.classifier,
                    components.extension
                )

                await copy(targetLocalPath, destination, {overwrite: true})

            }
        }

        return mdls

    }

    private getNeoFormVersion(args: string[]): string | null {
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--fml.neoFormVersion') {
                return args[i + 1]
            }
        }
        return null
    }
}
