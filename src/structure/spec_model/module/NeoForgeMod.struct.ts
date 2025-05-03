import { ForgeModStructure113 } from './forgemod/ForgeMod113.struct.js'
import { MinecraftVersion } from '../../../util/MinecraftVersion.js'
import { UntrackedFilesOption } from '../../../model/nebula/ServerMeta.js'

export class NeoForgeModStructure extends ForgeModStructure113 {
    constructor(
        absoluteRoot: string,
        relativeRoot: string,
        baseUrl: string,
        minecraftVersion: MinecraftVersion,
        untrackedFiles: UntrackedFilesOption[]
    ) {
        super(absoluteRoot, relativeRoot, baseUrl, minecraftVersion, untrackedFiles)
    }

    getLoggerName(): string {
        return 'NeoForgeModStructure'
    }
}