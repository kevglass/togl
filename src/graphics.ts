import { canvasRenderer } from "./canvasRenderer";
import { ResourceListener, resources } from "./resources";
import { sound } from "./sound";

// This is a very brute force simple renderer. It's just blitting images and text to 
// a canvas. It's wrapped with a view to replacing it with something decent
console.log("TOGL 1.01");

const canvas = document.getElementById("gamecanvas") as HTMLCanvasElement;
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

function loop(game: Game): void {
    // give the utility classes a chance to update based on 
    // screen size etc
    graphics.update();

    game.render();
    
    requestAnimationFrame(() => { loop(game) });
}

export interface Renderer {
    init(canvas: HTMLCanvasElement): Renderer;

    loadImage(url: string, track: boolean): HTMLImageElement 

    // load an image and store it with tileset information
    loadTileSet(url: string, tw: number, th: number): TileSet;

    // Draw a single tile from a tile set by default at its natural size
    drawTile(tiles: TileSet, x: number, y: number, tile: number): void;

    outlineText(x: number, y: number, str: string, size: number, col: string, outline: string, outlineWidth: number): void;

    // draw text at the given location 
    drawText(x: number, y: number, str: string, size: number, col: string): void;

    // draw a rectangle outlined to the canvas
    drawRect(x: number, y: number, width: number, height: number, col: string): void;

    // determine the width of a string when rendered at a given size
    textWidth(text: string, size: number): number;

    // draw a string onto the canvas centring it on the screen
    centerText(text: string, size: number, y: number, col: string): void;

    // fill a rectangle to the canvas
    fillRect(x: number, y: number, width: number, height: number, col: string): void;

    // draw an image to the canvas 
    drawImage(image: HTMLImageElement, x: number, y: number, width: number, height: number): void;

    // store the current 'state' of the canvas. This includes transforms, alphas, clips etc
    push(): void;

    // restore the next 'state' of the canvas on the stack.
    pop(): void;

    // set the alpha value to use when rendering 
    alpha(alpha: number): void;

    // translate the rendering context by a given amount
    translate(x: number, y: number): void;

    // scale the rendering context by a given amount
    scale(x: number, y: number): void;

    rotate(ang: number): void;

    fillCircle(x: number, y: number, radius: number, col: string): void;

    halfCircle(x: number, y: number, radius: number, col: string): void;
}

let currentRenderer: Renderer = canvasRenderer.init(canvas);

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
        return currentRenderer.loadImage(url, track);
    },

    // load an image and store it with tileset information
    loadTileSet(url: string, tw: number, th: number): TileSet {
        return currentRenderer.loadTileSet(url, tw, th);
    },

    // Draw a single tile from a tile set by default at its natural size
    drawTile(tiles: TileSet, x: number, y: number, tile: number): void {
        currentRenderer.drawTile(tiles, x, y, tile);
    },

    outlineText(x: number, y: number, str: string, size: number, col: string, outline: string, outlineWidth: number): void {
        currentRenderer.outlineText(x, y, str, size, col, outline, outlineWidth);
    },

    // draw text at the given location 
    drawText(x: number, y: number, str: string, size: number, col: string): void {
        currentRenderer.drawText(x, y, str, size, col);
    },

    // draw a rectangle outlined to the canvas
    drawRect(x: number, y: number, width: number, height: number, col: string): void {
        currentRenderer.drawRect(x, y, width, height, col);
    },

    // determine the width of a string when rendered at a given size
    textWidth(text: string, size: number) {
        return currentRenderer.textWidth(text, size);
    },

    // draw a string onto the canvas centring it on the screen
    centerText(text: string, size: number, y: number, col: string): void {
        currentRenderer.centerText(text, size, y, col);
    },

    // give the graphics to do anything it needs to do per frame
    update(): void {
        const screenWidth = Math.floor(window.innerWidth);
        const screenHeight = Math.floor(window.innerHeight);

        if (canvas.width !== screenWidth || canvas.height !== screenHeight) {
            canvas.width = screenWidth;
            canvas.height = screenHeight;
        }
    },

    // fill a rectangle to the canvas
    fillRect(x: number, y: number, width: number, height: number, col: string) {
        currentRenderer.fillRect(x, y, width, height, col);
    },

    // draw an image to the canvas 
    drawImage(image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
        currentRenderer.drawImage(image, x, y, width, height);
    },

    // store the current 'state' of the canvas. This includes transforms, alphas, clips etc
    push() {
        currentRenderer.push();
    },

    // restore the next 'state' of the canvas on the stack.
    pop() {
        currentRenderer.pop();
    },

    // set the alpha value to use when rendering 
    alpha(alpha: number): void {
        currentRenderer.alpha(alpha);
    },

    // translate the rendering context by a given amount
    translate(x: number, y: number): void {
        currentRenderer.translate(x, y);
    },

    // scale the rendering context by a given amount
    scale(x: number, y: number): void {
        currentRenderer.scale(x, y);
    },

    rotate(ang: number): void {
        currentRenderer.rotate(ang);
    },

    fillCircle(x: number, y: number, radius: number, col: string): void {
        currentRenderer.fillCircle(x, y, radius, col);
    },

    halfCircle(x: number, y: number, radius: number, col: string): void {
        currentRenderer.halfCircle(x, y, radius, col);
    },
}