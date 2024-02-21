import { canvasRenderer } from "./canvasRenderer";
import { resources } from "./resources";
import { sound } from "./sound";
import { webglRenderer } from "./webglRenderer";

// This is a very brute force simple renderer. It's just blitting images and text to 
// a canvas. It's wrapped with a view to replacing it with something decent
console.log("TOGL 1.0.4");

export namespace graphics {
    const canvas = document.getElementById("gamecanvas") as HTMLCanvasElement;
    let eventListener: Game | undefined;
    let mouseDown = false;

    export type FontCharacterWidth = [number, string];
    export type FontCharacterWidths = FontCharacterWidth[];

    export interface Offscreen {
        width: number;
        height: number;
    }

    export interface GameFont {
        lineHeight: number;
        tiles: TileSet;
        widths: FontCharacterWidths;
        chars: string;
        baseline: number;
    }

    export enum RendererType {
        CANVAS = "canvas",
        WEBGL = "webgl",
    }

    export interface GameImage {
        id: string;
        width: number;
        height: number;
    }

    // a tile set cuts an imag into pieces to be used as sprites
    export interface TileSet {
        image: GameImage;
        tileWidth: number;
        tileHeight: number;
        tiles: GameImage[];
    }

    // a hook back for mouse/touch events
    export interface Game extends resources.ResourceListener {
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
        if (currentRenderer.ready()) {
            // give the utility classes a chance to update based on 
            // screen size etc
            update();
            currentRenderer.preRender();

            game.render();

            currentRenderer.postRender();

            frameCount++;
            if (Date.now() - lastFPS > 1000) {
                fps = frameCount;
                frameCount = 0;
                lastFPS = Date.now();
            }
        }
        requestAnimationFrame(() => { loop(game) });
    }

    export interface Renderer {
        init(canvas: HTMLCanvasElement, pixelatedRenderingEnabled: boolean): Renderer;

        loadImage(url: string, track: boolean, id?: string): GameImage

        // load an image and store it with tileset information
        loadTileSet(url: string, tw: number, th: number, id?: string): TileSet;

        // Draw a single tile from a tile set by default at its natural size
        drawTile(tiles: TileSet, x: number, y: number, tile: number, width: number, height: number): void;

        // draw a rectangle outlined to the canvas
        drawRect(x: number, y: number, width: number, height: number, col: string): void;

        // fill a rectangle to the canvas
        fillRect(x: number, y: number, width: number, height: number, col: string): void;

        // draw an image to the canvas 
        drawImage(image: GameImage, x: number, y: number, width?: number, height?: number): void;

        // store the current 'state' of the canvas. This includes transforms, alphas, clips etc
        push(): void;

        // restore the next 'state' of the canvas on the stack.
        pop(): void;

        // set the alpha value to use when rendering 
        alpha(alpha: number): void;

        // translate the rendering context by a given amount
        translate(x: number, y: number): void;

        rotate(ang: number): void;

        // scale the rendering context by a given amount
        scale(x: number, y: number): void;

        initResourceOnLoaded(): void;

        preRender(): void;

        postRender(): void;

        createOffscreen(width: number, height: number): Offscreen;

        drawOffscreen(offscreen: Offscreen, x: number, y: number): void;

        drawOffscreenSection(offscreen: Offscreen, x: number, y: number, sx: number, sy: number, width: number, height: number): void;

        drawToOffscreen(offscreen: Offscreen): void;

        drawToMain(): void;

        ready(): boolean;

        clearRect(x: number, y: number, width: number, height: number): void;

        getDrawCount(): number;

        resize(): void;
    }

    let currentRenderer: Renderer;
    let lastFPS: number = 0;
    let frameCount: number = 0;
    let fps: number = 0;

    export function init(rendererType: RendererType, pixelatedRenderingEnabled = false): void {
        console.log("TOGL Renderer: " + rendererType + " (pixelated = " + pixelatedRenderingEnabled + ")");

        if (rendererType === RendererType.CANVAS) {
            currentRenderer = canvasRenderer.init(canvas, pixelatedRenderingEnabled);
        }
        if (rendererType === RendererType.WEBGL) {
            currentRenderer = webglRenderer.init(canvas, pixelatedRenderingEnabled);
        }
    }

    // register an event listener for mouse/touch events
    export function startRendering(game: Game): void {
        eventListener = game;
        resources.addResourceListener(game);
        resources.addResourceListener({
            resourcesLoaded(): void {
                initResourceOnLoaded();
            }
        });

        // start the rendering loop
        requestAnimationFrame(() => { loop(game) });
    }

    export function getFPS(): number {
        return fps;
    }

    export function width(): number {
        return canvas.width;
    }

    export function height(): number {
        return canvas.height;
    }

    export function loadImage(url: string, track = true, id?: string): GameImage {
        return currentRenderer.loadImage(url, track);
    }

    // load an image and store it with tileset information
    export function loadTileSet(url: string, tw: number, th: number, id?: string): TileSet {
        return currentRenderer.loadTileSet(url, tw, th, id);
    }

    export function generateFont(size: number, col: string, charset?: string): GameFont {
        const characterSet = charset ??
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
            "abcdefghijklmnopqrstuvwxyz" +
            "0123456789.,;:?!\"'+-=*%_()" +
            "[]{}~#&@©®™°^`|/\<>…€$£¢¿¡" +
            "“”‘’«»‹›„‚·•ÀÁÂÄÃÅÆÇÐÈÉÊËÌ" +
            "ÍÎÏÑÒÓÔÖÕØŒÙÚÛÜÝŸÞẞàáâäãåæ" +
            "çðèéêëìíîïñòóôöõøœùúûüýÿþß" +
            "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШ" +
            "ЩЪЫЬЭЮЯабвгдеёжзийклмнопрс" +
            "туфхцчшщъыьэюя";

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = col;
        ctx.font = "bold " + size + "px \"Fira Sans\", sans-serif";

        const widths: FontCharacterWidths = [];

        let tw = 0;
        let th = 0;
        let baseline = 0;

        for (let i = 0; i < characterSet.length; i++) {
            const metrics = ctx.measureText(characterSet[i]);
            const width = Math.ceil(metrics.width);
            const height = Math.ceil(metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent);
            const bl = Math.ceil(metrics.actualBoundingBoxAscent);

            tw = Math.max(width, tw);
            th = Math.max(height, th);
            baseline = Math.max(bl, baseline);

            let def = widths.find(i => i[0] === width);
            if (!def) {
                def = [width, ""];
                widths.push(def);
            }
            def[1] += characterSet[i];
        }

        canvas.width = 26 * tw;
        canvas.height = Math.ceil(characterSet.length / 26) * th;
        ctx.fillStyle = col;
        ctx.font = "bold " + size + "px \"Fira Sans\", sans-serif";

        for (let i = 0; i < characterSet.length; i++) {
            const xp = (i % 26) * tw;
            const yp = (Math.floor(i / 26) * th) + baseline - 1;
            ctx.fillText(characterSet[i], xp, yp);
        }

        return {
            tiles: loadTileSet(canvas.toDataURL(), tw, th, size + "-" + col),
            baseline,
            chars: characterSet,
            widths,
            lineHeight: th
        }
    }

    export function createFont(tiles: TileSet, lineHeight: number, widths: FontCharacterWidths, chars: string, baseline: number): GameFont {
        return {
            tiles,
            lineHeight,
            widths,
            chars,
            baseline
        }
    }

    // Draw a single tile from a tile set by default at its natural size
    export function drawTile(tiles: TileSet, x: number, y: number, tile: number, width: number = tiles.tileWidth, height: number = tiles.tileHeight): void {
        currentRenderer.drawTile(tiles, x, y, tile, width, height);
    }

    export function outlineText(x: number, y: number, str: string, font: GameFont, outlineWidth: number, outlineFont: GameFont): void {
        drawText(x - outlineWidth, y - outlineWidth, str, outlineFont);
        drawText(x + outlineWidth, y - outlineWidth, str, outlineFont);
        drawText(x - outlineWidth, y + outlineWidth, str, outlineFont);
        drawText(x + outlineWidth, y + outlineWidth, str, outlineFont);
        drawText(x, y, str, font);
    }

    // draw text at the given location 
    export function drawText(x: number, y: number, text: string, font: GameFont): void {
        push();
        translate(x, y - font.baseline);

        x = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charAt(i);
            if (c === ' ') {
                x += Math.floor(font.tiles.tileWidth / 2.5);
                continue;
            }
            const tile = font.chars.indexOf(c);
            drawTile(font.tiles, x, 0, tile);
            const kern = font.widths.find((a: any) => (a[1] as string).includes(c));
            if (kern) {
                x += (kern[0] as number);
            }
        }

        pop();
    }

    // draw a rectangle outlined to the canvas
    export function drawRect(x: number, y: number, width: number, height: number, col: string): void {
        currentRenderer.drawRect(x, y, width, height, col);
    }

    // determine the width of a string when rendered at a given size
    export function textWidth(text: string, font: GameFont) {
        let x = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charAt(i);
            if (c === ' ') {
                x += Math.floor(font.tiles.tileWidth / 2.5);
                continue;
            }
            const kern = font.widths.find(a => (a[1] as string).includes(c));
            if (kern) {
                x += (kern[0] as number);
            }
        }

        return x;
    }

    // draw a string onto the canvas centring it on the screen
    export function centerText(text: string, y: number, font: GameFont): void {
        drawText(Math.floor((width() - textWidth(text, font)) / 2), y, text, font);
    }

    // give the graphics to do anything it needs to do per frame
    export function update(): void {
        const screenWidth = Math.floor(window.innerWidth);
        const screenHeight = Math.floor(window.innerHeight);

        if (canvas.width !== screenWidth || canvas.height !== screenHeight) {
            canvas.width = screenWidth;
            canvas.height = screenHeight;
            currentRenderer.resize();
        }
    }

    // fill a rectangle to the canvas
    export function fillRect(x: number, y: number, width: number, height: number, col: string) {
        currentRenderer.fillRect(x, y, width, height, col);
    }

    // draw an image to the canvas 
    export function drawImage(image: GameImage, x: number, y: number, width?: number, height?: number): void {
        currentRenderer.drawImage(image, x, y, width, height);
    }

    // store the current 'state' of the canvas. This includes transforms, alphas, clips etc
    export function push() {
        currentRenderer.push();
    }

    // restore the next 'state' of the canvas on the stack.
    export function pop() {
        currentRenderer.pop();
    }

    // set the alpha value to use when rendering 
    export function alpha(alpha: number): void {
        currentRenderer.alpha(alpha);
    }

    // translate the rendering context by a given amount
    export function translate(x: number, y: number): void {
        currentRenderer.translate(x, y);
    }

    // scale the rendering context by a given amount
    export function scale(x: number, y: number): void {
        currentRenderer.scale(x, y);
    }

    export function rotate(ang: number): void {
        currentRenderer.rotate(ang);
    }

    export function initResourceOnLoaded(): void {
        currentRenderer.initResourceOnLoaded();
    }

    export function createOffscreen(width: number, height: number): Offscreen {
        return currentRenderer.createOffscreen(width, height);
    }

    export function drawOffscreen(offscreen: Offscreen, x: number, y: number): void {
        currentRenderer.drawOffscreen(offscreen, x, y);
    }

    export function drawOffscreenSection(offscreen: Offscreen, x: number, y: number, sx: number, sy: number, width: number, height: number): void {
        currentRenderer.drawOffscreenSection(offscreen, x, y, sx, sy, width, height);
    }

    export function drawToOffscreen(offscreen: Offscreen): void {
        currentRenderer.drawToOffscreen(offscreen);
    }

    export function drawToMain(): void {
        currentRenderer.drawToMain();
    }

    export function clearRect(x: number, y: number, width: number, height: number): void {
        currentRenderer.clearRect(x, y, width, height);
    }

    export function getDrawCount(): number {
        return currentRenderer.getDrawCount();
    }
}