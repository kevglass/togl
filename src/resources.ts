
export interface ResourceListener {
    resourcesLoaded(): void;
}

let resourcesRequested = 0;
let resourcesLoaded = 0;
let resourceListeners: ResourceListener[] = [];

export function addResourceListener(listener: ResourceListener): void {
    resourceListeners.push(listener);
}

export function getResourceLoadingProgress(): number {
    return resourcesLoaded / resourcesRequested;
}

export function getResourceLoadingStatus(): string {
    return resourcesLoaded + "/" + resourcesRequested;
}

export function resourceRequested(url: string): void {
    resourcesRequested++;
}

export function resourceLoaded(url: string): void {
    resourcesLoaded++;
    if (resourcesLoaded >= resourcesRequested) {
        for (const resourceListener of resourceListeners) {
            resourceListener.resourcesLoaded();
        }
    }
}

export function loadTextSync(url: string): string {
    const request = new XMLHttpRequest();
    request.open("GET", url, false);
    request.send();
    if (request.status === 200) {
        return request.responseText;
    }

    throw "Error reading: " + url + " " + request.status;
}