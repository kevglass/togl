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

    loadTextSync(url: string): string {
        const request = new XMLHttpRequest();
        request.open("GET", url, false);
        request.send();
        if (request.status === 200) {
          return request.responseText;
        }

        throw "Error reading: " + url + " " + request.status;
    }, 

    loadText(url: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("GET", url);
            request.onreadystatechange = () => {
                if (request.readyState == 4 && request.status == 200) {
                    resolve(request.responseText);
                }
            };
            request.onerror = () => {
                reject();
            };
            request.send();
        });
    }
}