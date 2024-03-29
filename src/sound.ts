import { resources } from "./resources";

const AudioContext = window.AudioContext || (window as any).webkitAudioContext;

/**
 * The sound namespace contains wrappers for loading and playing
 * sounds through the AudioContext API.
 */
export namespace sound {
    const audioContext: AudioContext = new AudioContext();
    audioContext.resume();

    /**
     * A sound loaded in this context
     */
    export interface Sound {
        /** The audio buffer held for this sound */
        buffer?: AudioBuffer;
        /** The original data loaded for this sound */
        data?: ArrayBuffer;
    }

    /**
     * Load a sound from the given URL.
     * 
     * @param url The URL to load the sound from
     * @param track True if want to track the loading of this resource
     * @returns The loaded sound 
     */
    export function loadSound(url: string, track = true): Sound {
        if (track) {
            resources.resourceRequested(url);
        }
        const result: Sound = {};

        const req = new XMLHttpRequest();
        req.open("GET", url, true);
        req.responseType = "arraybuffer";

        req.onload = () => {
            if (track) {
                resources.resourceLoaded(url);
            }
            const arrayBuffer = req.response;
            if (arrayBuffer) {
                result.data = arrayBuffer;
                tryLoadSound(result);
            }
        };

        req.send();
        return result;
    }

    /**
     * Play a sound in this context
     * 
     * @param sound The sound loaded to play
     * @param volume The volume (0 -> 1) to play at
     */
    export function playSound(sound: Sound, volume = 1.0): void {
        tryLoadSound(sound).then(() => {
            if (sound.buffer) {
                const source = audioContext.createBufferSource();
                source.buffer = sound.buffer;
                const gain = audioContext.createGain();
                source.connect(gain);
                gain.connect(audioContext.destination);
                gain.gain.value = volume;
                source.start(0);
            }
        })
    }

    /**
     * Loop a sound in this context (good for music)
     * 
     * @param sound The sound loaded to loop
     * @param volume The volume (0 -> 1) to play at
     */
    export function loopSound(sound: Sound, volume = 1.0): void {
        tryLoadSound(sound).then(() => {
            if (sound.buffer) {
                const source = audioContext.createBufferSource();
                source.buffer = sound.buffer;
                source.loop = true;
                const gain = audioContext.createGain();
                source.connect(gain);
                gain.connect(audioContext.destination);
                gain.gain.value = volume;
                source.start(0);
            }
        })
    }

    /**
     * Hook to start the audio context on user interaction. Required by later
     * browsers.
     */
    export function resumeAudioOnInput() {
        audioContext.resume();
    }

    // Try loading the buffer of data thats been loaded into
    // a AudioBuffer
    function tryLoadSound(sound: Sound): Promise<void> {
        return new Promise<void>((resolve) => {
            if (sound.buffer) {
                resolve();
            } else {
                if (sound.data && !sound.buffer) {
                    audioContext.decodeAudioData(sound.data, (buffer: AudioBuffer) => {
                        sound.buffer = buffer;
                        resolve();
                    });
                }
            }
        });
    }
}