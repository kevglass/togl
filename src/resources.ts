import { graphics } from "./graphics";

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
    },

    resourceLoaded(url: string): void {
        resourcesLoaded++;
        if (resourcesLoaded >= resourcesRequested) {
            graphics.initResourceOnLoaded();
            resourceListener?.resourcesLoaded();
        }
    },
}