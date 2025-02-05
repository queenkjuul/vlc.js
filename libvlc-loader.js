// Copyright 2025 - 2025, Videolabs and the Videolan contributors
// SPDX-License-Identifier: MIT

export { MediaPlayer, Media } from "./lib/libvlc.js";

export async function initRuntime(ModuleExt) {
    try {
        const EmscriptenModule = await import('./experimental.js');
        return await EmscriptenModule.default(ModuleExt);
    } catch (e) {
        console.error(`Couldn't load libvlc runtime: ${e}`);
        return undefined;
    }
}
