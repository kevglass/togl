import { GameImage, Offscreen, Renderer, TileSet, graphics } from "./graphics";
import { resources } from "./resources";

// This is a very brute force simple renderer. It's just blitting images and text to 
// a canvas. It's wrapped with a view to replacing it with something decent
let ctx: CanvasRenderingContext2D;
let mainCtx: CanvasRenderingContext2D;

const scaledImageCache: Record<string, Record<number, CanvasImageSource>> = {};

declare let InstallTrigger: any;
var isFirefox = typeof InstallTrigger !== 'undefined';

interface CanvasOffscreen extends Offscreen {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
}

export const canvasRenderer: Renderer = {
    init(canvas: HTMLCanvasElement, pixelatedRenderingEnabled: boolean): Renderer {
        mainCtx = ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        if (pixelatedRenderingEnabled) {
            if (isFirefox) {
              canvas.style.imageRendering = "crisp-edges";
            } else {
              canvas.style.imageRendering = "pixelated";
            }
        }

        return canvasRenderer;
    },

    preRender(): void {

    },

    postRender(): void {

    },

    loadImage(url: string, track = true, id?: string): HTMLImageElement {
        if (track) {
            resources.resourceRequested(url);
        }
        const image = new Image();
        image.src = url;
        image.onerror = () => {
            console.log("Failed to load: " + url);
        };
        image.onload = () => {
            image.id = id ?? url;
            scaledImageCache[image.id] = {};
            scaledImageCache[image.id][image.width + (image.height * 10000)] = image;

            if (track) {
                resources.resourceLoaded(url);
            }
        };

        return image;
    },

    // load an image and store it with tileset information
    loadTileSet(url: string, tw: number, th: number, id?: string): TileSet {
        resources.resourceRequested(url);

        const image = new Image();
        image.src = url;
        image.onerror = () => {
            console.log("Failed to load: " + url);
        };
        image.onload = () => {
            image.id = id ?? url;
            scaledImageCache[image.id] = {};
            scaledImageCache[image.id][image.width + (image.height * 10000)] = image;

            resources.resourceLoaded(url);
        };

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
            (tileImage as HTMLCanvasElement).getContext("2d")?.drawImage(tiles.image as CanvasImageSource, tx, ty, tiles.tileWidth, tiles.tileHeight, 0, 0, tiles.tileWidth, tiles.tileHeight);
        }
        ctx.drawImage(tileImage as CanvasImageSource, x, y);
    },
    
    // draw a rectangle outlined to the canvas
    drawRect(x: number, y: number, width: number, height: number, col: string): void {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, width, 1);
        ctx.fillRect(x, y + height - 1, width, 1);
        ctx.fillRect(x, y, 1, height);
        ctx.fillRect(x + width - 1, y, 1, height);
    },

    // fill a rectangle to the canvas
    fillRect(x: number, y: number, width: number, height: number, col: string) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, width, height);
    },

    // draw an image to the canvas 
    drawImage(image: GameImage, x: number, y: number, width?: number, height?: number): void {
        x = Math.floor(x);
        y = Math.floor(y);
        width = width ? Math.floor(width) : image.width;
        height = height ? Math.floor(height) : image.height;

        if (image.id) {
            if (width === 0) {
                return;
            }

            let cachedScaled = scaledImageCache[image.id][width + (height * 10000)];
            if (!cachedScaled) {
                cachedScaled = scaledImageCache[image.id][width + (height * 10000)] = document.createElement("canvas");
                cachedScaled.width = width;
                cachedScaled.height = height;
                cachedScaled.getContext("2d")?.drawImage(image as HTMLImageElement, 0, 0, width, height);
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

    initResourceOnLoaded: function (): void {
    },
    
    createOffscreen(width: number, height: number): Offscreen {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        const offscreen: CanvasOffscreen = {
            width,
            height,
            canvas,
            ctx
        };

        return offscreen;
    },

    getDrawCount(): number {
        return 0;
    },

    drawOffscreen(offscreen: Offscreen, x: number, y: number): void {
        ctx.drawImage((offscreen as CanvasOffscreen).canvas, x, y);
    },

    drawOffscreenSection(offscreen: Offscreen, x: number, y: number, sx: number, sy: number, width: number, height: number): void {
        ctx.drawImage((offscreen as CanvasOffscreen).canvas, x, y, width, height, sx, sy, width, height);
    },

    drawToOffscreen(offscreen: Offscreen): void {
        ctx = (offscreen as CanvasOffscreen).ctx;
        canvasRenderer.push();
    },

    drawToMain(): void {
        canvasRenderer.pop();
        ctx = mainCtx;
    },
    
    ready(): boolean {
        return true;
    },

    clearRect(x: number, y: number, width: number, height: number): void {
        ctx.clearRect(x,y,width,height);
    },
}