import { ResourceListener, resources } from "./resources";
import { sound } from "./sound";

// This is a very brute force simple renderer. It's just blitting images and text to 
// a canvas. It's wrapped with a view to replacing it with something decent

const canvas = document.getElementById("gamecanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D;
let eventListener: Game | undefined;
let mouseDown = false;

// a tile set cuts an imag into pieces to be used as sprites
export interface TileSet {
    image: HTMLImageElement;
    tileWidth: number;
    tileHeight: number;
    tiles: CanvasImageSource[];
}

// a hook back for mouse/touch events
export interface Game extends ResourceListener {
    mouseDown(x: number, y: number, index: number): void;
    mouseDrag(x: number, y: number, index: number): void;
    mouseUp(x: number, y: number, index: number): void;
    keyDown(key: string): void;
    keyUp(key: string): void;
    resourcesLoaded(): void;
    render(): void;
}

document.addEventListener('contextmenu', event => {
    event.preventDefault();
});

canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
});

canvas.addEventListener("touchstart", (event) => {
    sound.resumeAudioOnInput();
    canvas.focus();

    for (const touch of event.changedTouches) {
        eventListener?.mouseDown(touch.clientX, touch.clientY, touch.identifier);
    }

    event.stopPropagation();
    event.preventDefault();
});

canvas.setAttribute("tabindex", "0");

canvas.addEventListener("keydown", (event) => {
    eventListener?.keyDown(event.key);
});

canvas.addEventListener("keyup", (event) => {
    eventListener?.keyUp(event.key);
});

canvas.addEventListener("touchend", (event) => {
    sound.resumeAudioOnInput();

    for (const touch of event.changedTouches) {
        eventListener?.mouseUp(touch.clientX, touch.clientY, touch.identifier);
    }

    event.stopPropagation();
    event.preventDefault();
});

canvas.addEventListener("touchmove", (event) => {
    sound.resumeAudioOnInput();

    for (const touch of event.changedTouches) {
        eventListener?.mouseDrag(touch.clientX, touch.clientY, touch.identifier);
    }

    event.stopPropagation();
    event.preventDefault();
});

canvas.addEventListener("mousedown", (event) => {
    sound.resumeAudioOnInput();
    canvas.focus();

    eventListener?.mouseDown(event.x, event.y, event.button);
    mouseDown = true;

    event.stopPropagation();
    event.preventDefault();
});

canvas.addEventListener("mousemove", (event) => {
    sound.resumeAudioOnInput();
    if (mouseDown) {
        eventListener?.mouseDrag(event.x, event.y, event.button);

        event.stopPropagation();
        event.preventDefault();
    }
});

canvas.addEventListener("mouseup", (event) => {
    sound.resumeAudioOnInput();
    mouseDown = false;

    eventListener?.mouseUp(event.x, event.y, event.button);

    event.stopPropagation();
});

const scaledImageCache: Record<string, Record<number, CanvasImageSource>> = {};

function loop(game: Game): void {
    // give the utility classes a chance to update based on 
    // screen size etc
    graphics.update();

    game.render();
    
    requestAnimationFrame(() => { loop(game) });
}

export const graphics = {
    // register an event listener for mouse/touch events
    startRendering(game: Game): void {
        eventListener = game;
        resources.registerResourceListener(game);

        // start the rendering loop
        requestAnimationFrame(() => { loop(game) });
    },

    width(): number {
        return canvas.width;
    },

    height(): number {
        return canvas.height;
    },

    loadImage(url: string, track = true): HTMLImageElement {
        if (track) {
            resources.resourceRequested(url);
        }
        const image = new Image();
        image.src = url;
        image.onerror = () => {
            console.log("Failed to load: " + url);
        }
        image.onload = () => {
            image.id = url;
            scaledImageCache[image.id] = {};
            scaledImageCache[image.id][image.width + (image.height * 10000)] = image;

            if (track) {
                resources.resourceLoaded(url);
            }
        }

        return image;
    },

    // load an image and store it with tileset information
    loadTileSet(url: string, tw: number, th: number): TileSet {
        resources.resourceRequested(url);

        const image = new Image();
        image.src = url;
        image.onerror = () => {
            console.log("Failed to load: " + url);
        }
        image.onload = () => {
            resources.resourceLoaded(url);
        }

        return { image, tileWidth: tw, tileHeight: th, tiles: [] };
    },

    // Draw a single tile from a tile set by default at its natural size
    drawTile(tiles: TileSet, x: number, y: number, tile: number): void {
        x = Math.floor(x);
        y = Math.floor(y);
    
        const tw = Math.floor(tiles.image.width / tiles.tileWidth);
        const tx = (tile % tw) * tiles.tileWidth;
        const ty = Math.floor(tile / tw) * tiles.tileHeight;

        let tileImage = tiles.tiles[tile];
        if (!tileImage) {
            tileImage = tiles.tiles[tile] = document.createElement("canvas");
            tileImage.width = tiles.tileWidth;
            tileImage.height = tiles.tileHeight;
            tileImage.getContext("2d")?.drawImage(tiles.image, tx, ty, tiles.tileWidth, tiles.tileHeight, 0, 0, tiles.tileWidth, tiles.tileHeight);
        }
        ctx.drawImage(tileImage, x, y);
    },

    outlineText(x: number, y: number, str: string, size: number, col: string, outline: string, outlineWidth: number): void {
        graphics.drawText(x - outlineWidth, y - outlineWidth, str, size, outline);
        graphics.drawText(x + outlineWidth, y - outlineWidth, str, size, outline);
        graphics.drawText(x - outlineWidth, y + outlineWidth, str, size, outline);
        graphics.drawText(x + outlineWidth, y + outlineWidth, str, size, outline);

        graphics.drawText(x, y, str, size, col);
    },

    // draw text at the given location 
    drawText(x: number, y: number, str: string, size: number, col: string): void {
        ctx.fillStyle = col;
        ctx.font = "bold " + size + "px \"Fira Sans\", sans-serif";
        ctx.fillText(str, x, y);
    },

    // draw a rectangle outlined to the canvas
    drawRect(x: number, y: number, width: number, height: number, col: string): void {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, width, 1);
        ctx.fillRect(x, y + height - 1, width, 1);
        ctx.fillRect(x, y, 1, height);
        ctx.fillRect(x + width - 1, y, 1, height);
    },

    // determine the width of a string when rendered at a given size
    textWidth(text: string, size: number) {
        ctx.font = "bold " + size + "px \"Fira Sans\", sans-serif";
        return ctx.measureText(text).width;
    },

    // draw a string onto the canvas centring it on the screen
    centerText(text: string, size: number, y: number, col: string): void {
        const cx = Math.floor(graphics.width() / 2);
        graphics.drawText(cx - (graphics.textWidth(text, size) / 2), y, text, size, col);
    },

    // give the graphics to do anything it needs to do per frame
    update(): void {
        canvas.width = Math.floor(window.innerWidth);
        canvas.height = Math.floor(window.innerHeight);
    },

    // fill a rectangle to the canvas
    fillRect(x: number, y: number, width: number, height: number, col: string) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, width, height);
    },

    // draw an image to the canvas 
    drawImage(image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
        x = Math.floor(x);
        y = Math.floor(y);
        width = Math.floor(width);
        height = Math.floor(height);
        
        if (image.id) {
            if (width === 0) {
                return;
            }

            let cachedScaled = scaledImageCache[image.id][width + (height * 10000)];
            if (!cachedScaled) {
                cachedScaled = scaledImageCache[image.id][width + (height * 10000)] = document.createElement("canvas");
                cachedScaled.width = width;
                cachedScaled.height = height;
                cachedScaled.getContext("2d")?.drawImage(image, 0, 0, width, height);
            }

            ctx.drawImage(cachedScaled, x, y);
        }
    },

    // store the current 'state' of the canvas. This includes transforms, alphas, clips etc
    push() {
        ctx.save();
    },

    // restore the next 'state' of the canvas on the stack.
    pop() {
        ctx.restore();
    },

    // set the alpha value to use when rendering 
    alpha(alpha: number): void {
        ctx.globalAlpha = alpha;
    },

    // translate the rendering context by a given amount
    translate(x: number, y: number): void {
        x = Math.floor(x);
        y = Math.floor(y);

        ctx.translate(x, y);
    },

    // scale the rendering context by a given amount
    scale(x: number, y: number): void {
        ctx.scale(x, y);
    },

    rotate(ang: number): void {
        ctx.rotate(ang);
    },

    fillCircle(x: number, y: number, radius: number, col: string): void {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    },

    halfCircle(x: number, y: number, radius: number, col: string): void {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, radius, Math.PI, 0);
        ctx.fill();
    },
}