import { ForgeModStructure113 } from './forgemod/ForgeMod113.struct.js'
import { MinecraftVersion } from '../../../util/MinecraftVersion.js'
import { UntrackedFilesOption } from '../../../model/nebula/ServerMeta.js'
import { ModsToml } from '../../../model/forge/ModsToml.js'
import StreamZip from 'node-stream-zip'
import toml from 'toml'
import { BaseForgeModStructure } from './ForgeMod.struct.js'
import {capitalize} from '../../../util/StringUtils.js'

export class NeoForgeModStructure extends BaseForgeModStructure<ModsToml> {
    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        minecraftVersion: MinecraftVersion,
        untrackedFiles: UntrackedFilesOption[]
    ) {
        super(absoluteRoot, relativeRoot, baseUrl, minecraftVersion, untrackedFiles)
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public isForVersion(version: MinecraftVersion, libraryVersion: string): boolean {
        return true
    }

    getLoggerName(): string {
        return 'NeoForgeModStructure'
    }

    protected async getModuleId(name: string, path: string): Promise<string> {
        const fmData = await this.getModMetadata(name, path)
        return this.generateMavenIdentifier(this.getClaritasGroup(path), fmData.mods[0].modId, fmData.mods[0].version)
    }
    protected async getModuleName(name: string, path: string): Promise<string> {
        return capitalize((await this.getModMetadata(name, path)).mods[0].displayName)
    }

    protected processZip(zip: StreamZip, name: string, path: string): ModsToml {
        let raw: Buffer | undefined
        try {
            raw = zip.entryDataSync('META-INF/neoforge.mods.toml')
        } catch(err) {
            // ignored
        }

        if (raw) {
            try {
                const parsed = toml.parse(raw.toString()) as ModsToml
                this.modMetadata[name] = parsed
            } catch (err) {
                this.logger.error(`NeoForgeNeoMod ${name} contains an invalid neoforge.mods.toml file.`)
            }
        } else {
            this.logger.error(`NeoForgeMod ${name} does not contain neoforge.mods.toml file.`)
        }

        const cRes = this.claritasResult?.[path]

        if(cRes == null) {
            this.logger.error(`Claritas failed to yield metadata for NeoForgeMod ${name}!`)
            this.logger.error('Is this mod malformatted or does Claritas need an update?')
        }

        const claritasId = cRes?.id

        const crudeInference = this.attemptCrudeInference(name)

        if(this.modMetadata[name] != null) {

            const x = this.modMetadata[name]
            for(const entry of x.mods) {

                if(entry.modId === this.EXAMPLE_MOD_ID) {
                    entry.modId = this.discernResult(claritasId, crudeInference.name.toLowerCase())
                    entry.displayName = crudeInference.name
                }

                if (entry.version === '${file.jarVersion}') {
                    let version = crudeInference.version
                    try {
                        const manifest = zip.entryDataSync('META-INF/MANIFEST.MF')
                        const keys = manifest.toString().split('\n')
                        // this.logger.debug(keys)
                        for (const key of keys) {
                            const match = ForgeModStructure113.IMPLEMENTATION_VERSION_REGEX.exec(key)
                            if (match != null) {
                                version = match[1]
                            }
                        }
                        this.logger.debug(`NeoForgeMod ${name} contains a version wildcard, inferring ${version}`)
                    } catch {
                        this.logger.debug(`NeoForgeMod ${name} contains a version wildcard yet no MANIFEST.MF.. Defaulting to ${version}`)
                    }
                    entry.version = version
                }
            }

        } else {
            this.modMetadata[name] = ({
                modLoader: 'javafml',
                loaderVersion: '',
                mods: [{
                    modId: this.discernResult(claritasId, crudeInference.name.toLowerCase()),
                    version: crudeInference.version,
                    displayName: crudeInference.name,
                    description: ''
                }]
            })
        }

        return this.modMetadata[name]
    }
    
}