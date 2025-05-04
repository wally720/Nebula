export interface VersionManifestNeoForge {

    id: string
    time: string
    releaseTime: string
    type: string
    mainClass: string
    inheritsFrom: string
    arguments: {
        game: string[]
    }
    libraries: {
        name: string
        downloads: {
            artifact: {
                path: string
                url: string
                sha1: string
                size: number
            }
        }
    }[]

}
