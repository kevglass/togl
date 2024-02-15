export interface ResourceListener {
    resourcesLoaded(): void;
}

let resourcesRequested = 0;
let resourcesLoaded = 0;
let resourceListener: ResourceListener;

export const resources = {
    registerResourceListener(listener: ResourceListener): void {
        resourceListener = listener;
    },

    getResourceLoadingProgress(): number {
        return resourcesLoaded / resourcesRequested;
    },

    getResourceLoadingStatus(): string {
        return resourcesLoaded + "/" + resourcesRequested;
    },

    resourceRequested(url: string): void {
        resourcesRequested++;
        console.log("Loading: ", url);
    },

    resourceLoaded(url: string): void {
        resourcesLoaded++;
        console.log("Loaded: ", url);
        if (resourcesLoaded >= resourcesRequested) {
            resourceListener?.resourcesLoaded();
        }
    },
}