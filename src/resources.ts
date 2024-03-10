/**
 * A simple resource manager. Tracks the loading of resources
 * and reports back when they're complete
 */
export namespace resources {
    /**
     * Description of a class that receives notification of resource
     * loading.
     */
    export interface ResourceListener {
        resourcesLoaded(): void;
    }

    export let resourcesRequested = 0;
    export let resourcesLoaded = 0;
    let resourceListeners: ResourceListener[] = [];

    /**
     * Add a listener to received notification of resource loading
     * 
     * @param listener The listener to add
     */
    export function addResourceListener(listener: ResourceListener): void {
        resourceListeners.push(listener);
    }

    /**
     * Get the process (from 0 -> 1) of loading of all resources 
     * being tracked
     * 
     * @returns The progress of loading resources (0 -> 1)
     */
    export function getResourceLoadingProgress(): number {
        return resourcesLoaded / resourcesRequested;
    }

    /**
     * Return a string to be displayed showing the resource loading 
     * status.
     * 
     * @returns A string containing the resource loading status
     */
    export function getResourceLoadingStatus(): string {
        return resourcesLoaded + "/" + resourcesRequested;
    }

    /**
     * Indicate that a resource has started loading
     * 
     * @param url The URL to the resource being loaded
     */
    export function resourceRequested(url: string): void {
        resourcesRequested++;
    }

    /**
     * Indicate that a resource has completed loading
     * 
     * @param url The URL of the resource that completed loading
     */
    export function resourceLoaded(url: string): void {
        resourcesLoaded++;
        if (resourcesLoaded >= resourcesRequested) {
            for (const resourceListener of resourceListeners) {
                resourceListener.resourcesLoaded();
            }
        }
    }
}