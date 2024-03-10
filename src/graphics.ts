import { canvasRenderer } from "./canvasRenderer";
import { resources } from "./resources";
import { sound } from "./sound";
import { webglRenderer } from "./webglRenderer";
import { translate as tr } from "./translate";

// This is a very brute force simple renderer. It's just blitting images and text to 
// a canvas. It's wrapped with a view to replacing it with something decent

/**
 * A wrapper around graphics rendering and game loops. The graphics namespace provides
 * the interface to the underlying renderer implementation. At the moment there are 
 * two renderers, one for using pure Canvas and one for using WebGL.
 * 
 * To use the graphics library create a Game implementation. 
 * 
 * ```
 * class MyGame implements Game {
 *  image: GameImage;
 *  tileSet: TileSet;
 * 
 *  // load everything you want to use here
 *  constructor() {
 *      graphics.init(RendererType.WEBGL);
 *      image = graphics.loadImage("https://game.com/image.png");
 *      tileSet = graphics.loadTileSet("https://game.com/tiles.png", 32, 32);
 *  }
 * 
 *  // render everything in the game here
 *  render(): void {
 *      graphics.drawImage(image, 100, 100);
 *      graphics.drawTile(tileSet, 200, 200, 0);
 *  }
 * 
 *  // notification that resources that were requested have been loaded
 *  resourcesLoaded(): void {};
 * 
 *  // input event call backs - use to control the game
 *  mouseDown(): void {}
 *  mouseUp(): void {}
 *  mouseDragged(): void {}
 *  keyUp(): void {}
 *  keyDown(): void {}
 * }
 * ```
 */
export namespace graphics {
    const canvas = document.getElementById("gamecanvas") as HTMLCanvasElement;
    let eventListener: Game | undefined;
    let mouseDown = false;
    let scaling = false;
    let scaleStartDist = 0;
    let resourceLoadedReported = false;

    /** 
     * The width assigned to a set of characters in a font
     */
    export type FontCharacterWidth = [number, string];
    /**
     * The widths of each set of character in a font
     */
    export type FontCharacterWidths = FontCharacterWidth[];

    /**
     * An offscreen rendering context. Use to optimize rendering
     * of common pieces.
     */
    export interface Offscreen {
        /** The width of the offscreen canvas in pixels */
        width: number;
        /** The height of the offscreen canvas in pixels */
        height: number;
    }

    /**
     * A font generate in the graphics context. 
     */
    export interface GameFont {
        /** The vertical space to give each line */
        lineHeight: number;
        /** The tile set of images that is used to render the font  */
        tiles: TileSet;
        /** The widths of the characters in the font */
        widths: FontCharacterWidths;
        /** The collections of characters available in this font */
        chars: string;
        /** The offset from the top of the image to the font baseline where the character will be aligned */
        baseline: number;
    }

    /**
     * The type of renderer implementation to use 
     */
    export enum RendererType {
        /** Render using the raw Canvas and 2D context operations */
        CANVAS = "canvas",
        /** Render using the WebGL implementation */
        WEBGL = "webgl",
    }

    /**
     * An image loaded in this graphics context
     */
    export interface GameImage {
        /** The ID given to the image, normally the URL */
        id: string;
        /** The width of the image */
        width: number;
        /** The height of the image */
        height: number;
    }

    /**
     * A tile set loaded in this graphics context. A tile set is an
     * image that is cut into evenly spaced tiles for rendering.
     */
    export interface TileSet {
        /** The image loaded for this tile set */
        image: GameImage;
        /** The width of each tile */
        tileWidth: number;
        /** The height of each tile */
        tileHeight: number;
        /** The collection of images for each cut tile */
        tiles: GameImage[];
    }

    /**
     * Definition of a game that will use this graphics context. Events
     * are provided by the library and a call back for the render loop.
     */
    export interface Game extends resources.ResourceListener {
        /** 
         * Notification that the mouse has been pressed or the a finger
         * has been touched
         * 
         * @param x The x coordinate of the touch/press
         * @param y The y coordinate of the touch/press
         * @param index The mouse button or finger that was used
         * to make the touch/press 
         */
        mouseDown(x: number, y: number, index: number): void;

        /** 
         * Notification tat the mouse has been dragged or the a finger
         * has been moved
         * 
         * @param x The x coordinate of the touch/drag
         * @param y The y coordinate of the touch/drag
         * @param index The mouse button or finger that was used
         * to make the touch/drag 
         */
        mouseDrag(x: number, y: number, index: number): void;

        /** 
         * Notification that the mouse has been released or the a finger
         * has been lifted
         * 
         * @param x The x coordinate of the touch/release
         * @param y The y coordinate of the touch/release
         * @param index The mouse button or finger that was used
         * to make the touch/release 
         */
        mouseUp(x: number, y: number, index: number): void;

        /**
         * Notification that a key has been pressed on the keyboard
         * 
         * @param key The name of the key pressed
         */
        keyDown(key: string): void;

        /**
         * Notification that a key has been released on the keyboard
         * 
         * @param key The name of the key released
         */
        keyUp(key: string): void;

        /**
         * Notification that all tracked resources (images, sounds, etc) have
         * been loaded
         */
        resourcesLoaded(): void;

        /**
         * Callback for the render loop. It's important to only render to the
         * main context in this method so the underlying renderer can make 
         * assumptions about the graphics being used.
         */
        render(): void;

        zoomChanged?(delta: number): void;
    }

    document.addEventListener('contextmenu', event => {
        event.preventDefault();
    });

    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();
    });

    canvas.addEventListener("wheel", (event) => {
        sound.resumeAudioOnInput();

        if (eventListener?.zoomChanged) {
            eventListener?.zoomChanged(-event.deltaY);
        }

        event.stopPropagation();
        event.preventDefault();
    });

    canvas.addEventListener("touchstart", (event) => {
        sound.resumeAudioOnInput();
        canvas.focus();

        if (event.touches.length === 2) {
            scaling = true;
            scaleStartDist = Math.hypot(
                event.touches[0].pageX - event.touches[1].pageX,
                event.touches[0].pageY - event.touches[1].pageY);
        } else {
            for (const touch of event.changedTouches) {
                eventListener?.mouseDown(touch.clientX, touch.clientY, touch.identifier);
            }
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

        if (scaling) {
            scaling = false;
        } else {
            for (const touch of event.changedTouches) {
                eventListener?.mouseUp(touch.clientX, touch.clientY, touch.identifier);
            }
        }

        event.stopPropagation();
        event.preventDefault();
    });

    canvas.addEventListener("touchmove", (event) => {
        sound.resumeAudioOnInput();

        if (scaling) {
            const dist = Math.hypot(
                event.touches[0].pageX - event.touches[1].pageX,
                event.touches[0].pageY - event.touches[1].pageY);
            if (eventListener?.zoomChanged) {
                eventListener?.zoomChanged(scaleStartDist - dist);
                scaleStartDist = dist;
            }
        } else {
            for (const touch of event.changedTouches) {
                eventListener?.mouseDrag(touch.clientX, touch.clientY, touch.identifier);
            }
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

        if (!resourceLoadedReported && resources.resourcesRequested === 0) {
            resourceLoadedReported = true;
            eventListener?.resourcesLoaded();
        }
        requestAnimationFrame(() => { loop(game) });
    }

    /**
     * The description of an implementation that can provide rendering for the graphics context
     */
    export interface Renderer {
        /**
         * Initialize the renderer
         * 
         * @param canvas The canvas that will be rendered to 
         * @param pixelatedRenderingEnabled True if images will be scaled with nearest neighbor rather than
         * attempting to smooth
         * @param textureSize A hint to the max texture size to use. This is useful when you want to reduce
         * the graphics memory requirements.
         * @param texturePaddingSize A hint to help with texture artifacts. Add some padding around textures.
         * @returns The created renderer
         */
        init(canvas: HTMLCanvasElement, pixelatedRenderingEnabled: boolean, textureSize?: number, texturePaddingSize?: number): Renderer;

        /**
         * Load an image from a given URL
         * 
         * @param url The URL to the image to be loaded
         * @param track True if we want to track the resource loading and report it
         * @param id The ID to give the new image
         * @param smooth True if we want to override pixel based scaling and attempt to render scaled versions
         * smoothly
         * @returns The loaded tile image
         */
        loadImage(url: string, track: boolean, id?: string, smooth?: boolean): GameImage

        /**
         * Load an tile set from a given URL
         * 
         * @param url The URL of the image to load 
         * @param tw The width of each tile in the image
         * @param th The height of each tile int he image
         * @param id The ID to give the loaded image
         * @returns The loaded tile set
         */
        loadTileSet(url: string, tw: number, th: number, id?: string): TileSet;

        /**
         * Draw a tile to the graphics context
         * 
         * @param tiles The tile set containing the tile to draw
         * @param x The x coordinate to draw at
         * @param y The y coordinate to draw at 
         * @param tile The index of the tile to render
         * @param width The width to render the tile at in pixels
         * @param height The height to render the tile at in pixels
         */
        drawTile(tiles: TileSet, x: number, y: number, tile: number, width: number, height: number, col?: string): void;

        /**
         * Draw the outline of a rectangle to the graphics context
         * 
         * @param x The x coordinate to draw at
         * @param y The y coordinate to draw at 
         * @param width The width of the rectangle to draw
         * @param height The height of the rectangle to draw
         * @param col The color to draw the rectangle in - in CSS format
         */
        drawRect(x: number, y: number, width: number, height: number, col: string): void;

        /**
         * Draw a rectangle to the graphics context
         * 
         * @param x The x coordinate to draw at
         * @param y The y coordinate to draw at 
         * @param width The width of the rectangle to draw
         * @param height The height of the rectangle to draw
         * @param col The color to fill the rectangle in - in CSS format
         */
        fillRect(x: number, y: number, width: number, height: number, col: string): void;

        /**
         * Draw an image to the graphics context
         * 
         * @param image The image to be drawn
         * @param x The x coordinate to draw at
         * @param y The y coordinate to draw at 
         * @param width The width of the image to draw
         * @param height The height of the image to draw
         * @param col The color to tint the image - in CSS format
         */
        drawImage(image: GameImage, x: number, y: number, width?: number, height?: number, col?: string): void;

        /**
         * Store the current state of the context (transforms, alpha etc) to 
         * the stack.
         */
        push(): void;

        /**
         * Restore the state of the context (transforms, alpha etc) from
         * the stack.
         */
        pop(): void;

        /**
         * Set the alpha to apply when drawing
         * 
         * @param alpha The alpha to apply (0-1)
         */
        alpha(alpha: number): void;

        /**
         * Apply a translation transform to the current graphics context
         * 
         * @param x The amount to transform on the x axis
         * @param y The amount to transform on the y axis
         */
        translate(x: number, y: number): void;

        /**
         * Apply a rotation transform to the current graphics context
         * 
         * @param ang The angle to rotate the context by
         */
        rotate(ang: number): void;

        /**
         * Apply a scaling transform to the current graphics context
         * 
         * @param x The amount to scale on the x axis
         * @param y The amount to scale on the y axis
         */
        scale(x: number, y: number): void;

        /**
         * Re-initialize any renderer resources on load of new images
         */
        initResourceOnLoaded(): void;

        /**
         * Called before the game renders
         */
        preRender(): void;

        /**
         * Called after the game renders
         */
        postRender(): void;

        /**
         * Create an offscreen rendering context
         * 
         * @param width The width of the new context in pixels
         * @param height The height of the new context in pixels
         * @returns The newly created offscreen canvas
         */
        createOffscreen(width: number, height: number): Offscreen;

        /**
         * Draw an offscreen context to the current context
         * 
         * @param offscreen The offscreen context to draw
         * @param x The x coordinate to draw at
         * @param y The y coordinate to draw at
         */
        drawOffscreen(offscreen: Offscreen, x: number, y: number): void;

        /**
         * Draw a section of an offscreen context to the current context
         * 
         * @param offscreen The offscreen context to draw
         * @param x The x coordinate to draw at
         * @param y The y coordinate to draw at
         * @param sx The x coordinate in the offscreen canvas to start drawing from
         * @param sy The y coordinate in the offscreen canvas to start drawing from
         * @param width The width of the section to draw
         * @param height The height of the section to draw
         */
        drawOffscreenSection(offscreen: Offscreen, x: number, y: number, sx: number, sy: number, width: number, height: number): void;

        /**
         * Configure the graphics context to render to the offscreen canvas provided
         * 
         * @param offscreen The offscreen canvas that this context should render to
         */
        drawToOffscreen(offscreen: Offscreen): void;

        /**
         * Configure the graphics context to render to the screen
         */
        drawToMain(): void;

        /**
         * Check if this renderer is ready to draw
         * 
         * @returns True if the renderer is fully initialized 
         */
        ready(): boolean;

        /**
         * Clear a rectangle on the current graphics context. Resets pixels completely.
         * 
         * @param x The x coordinate of the rectangle to clear
         * @param y The y coordinate of the rectangle to clear
         * @param width The width of the rectangle to clear
         * @param height The height of the rectangle to clear
         */
        clearRect(x: number, y: number, width: number, height: number): void;

        /**
         * Get the number of draws thats have been applied in the last frame
         */
        getDrawCount(): number;

        /**
         * Notification that the screen has resized allowing the renderer to 
         * regenerate any resources.
         */
        resize(): void;
    }

    let currentRenderer: Renderer;
    let lastFPS: number = 0;
    let frameCount: number = 0;
    let fps: number = 0;

    /**
     * Initialize the graphics context
     * 
     * @param rendererType The type of renderer to use @see RendererType
     * @param pixelatedRenderingEnabled True if images will be scaled with nearest neighbor rather than
     * attempting to smooth
     * @param textureSize A hint to the max texture size to use. This is useful when you want to reduce
     * the graphics memory requirements.
     * @param texturePaddingSize A hint to help with texture artifacts. Add some padding around textures.
     * @returns The created renderer
     */
    export function init(rendererType: RendererType, pixelatedRenderingEnabled = false, textureSize: number = 0, texturePadding: number = 2): void {
        console.log("TOGL Renderer: " + rendererType + " (pixelated = " + pixelatedRenderingEnabled + ")");

        if (rendererType === RendererType.CANVAS) {
            currentRenderer = canvasRenderer.init(canvas, pixelatedRenderingEnabled);
        }
        if (rendererType === RendererType.WEBGL) {
            currentRenderer = webglRenderer.init(canvas, pixelatedRenderingEnabled, textureSize, texturePadding);
        }
    }

    /**
     * Start the rendering loop and event listening. Passes events to the given 
     * game instance.
     * 
     * @param game The game to receive events from the rendering and events processes
     */
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

    /**
     * Get the number of frames per second being rendered
     * 
     * @returns The number of frames per second rendered
     */
    export function getFPS(): number {
        return fps;
    }

    /**
     * Get the width of the context in pixels
     * 
     * @returns The width of the context in pixels 
     */
    export function width(): number {
        return canvas.width;
    }

    /**
     * Get the height of the context in pixels
     * 
     * @returns The height of the context in pixels 
     */
    export function height(): number {
        return canvas.height;
    }

    /**
     * Load an image from a given URL
     * 
     * @param url The URL to the image to be loaded
     * @param track True if we want to track the resource loading and report it
     * @param id The ID to give the new image
     * @param smooth True if we want to override pixel based scaling and attempt to render scaled versions
     * smoothly
     * @returns The loaded tile image
     */
    export function loadImage(url: string, track = true, id?: string, smooth?: boolean): GameImage {
        return currentRenderer.loadImage(url, track, id, smooth);
    }

    /**
     * Load an tile set from a given URL
     * 
     * @param url The URL of the image to load 
     * @param tw The width of each tile in the image
     * @param th The height of each tile int he image
     * @param id The ID to give the loaded image
     * @returns The loaded tile set
     */
    export function loadTileSet(url: string, tw: number, th: number, id?: string): TileSet {
        return currentRenderer.loadTileSet(url, tw, th, id);
    }

    /**
     * Generate an image that contains the glyphs from a font. It's considerably quicker
     * to render images than glyphs.
     * 
     * @param size The size in pixels of the font to render
     * @param col The color of the text to render
     * @param charset The list of characters to render
     * @returns A newly generate font that contains the character specified
     */
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

        tw += 1;
        th += 1;
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

    /**
     * Create a font from a tile set 
     * 
     * @param tiles The tiles for each glyph
     * @param lineHeight The height to use when rendering lines of text
     * @param widths The widths of the characters 
     * @param chars The characters included in the font
     * @param baseline The distance from the top of the tile to the base line for positioning
     * @returns The newly created font
     */
    export function createFont(tiles: TileSet, lineHeight: number, widths: FontCharacterWidths, chars: string, baseline: number): GameFont {
        return {
            tiles,
            lineHeight,
            widths,
            chars,
            baseline
        }
    }

    /**
     * Draw a tile to the graphics context
     * 
     * @param tiles The tile set containing the tile to draw
     * @param x The x coordinate to draw at
     * @param y The y coordinate to draw at 
     * @param tile The index of the tile to render
     * @param width The width to render the tile at in pixels
     * @param height The height to render the tile at in pixels
     */
    export function drawTile(tiles: TileSet, x: number, y: number, tile: number, width: number = tiles.tileWidth, height: number = tiles.tileHeight, col?: string): void {
        currentRenderer.drawTile(tiles, x, y, tile, width, height, col);
    }

    /**
     * Brute force drawing of outlined text
     * 
     * @param x The x coordinate to draw the text at
     * @param y The y coordinate to draw the text at
     * @param str The text to draw
     * @param font The font to use when drawing
     * @param outlineWidth The width of the outline
     * @param outlineFont The font to use drawing the outline
     */
    export function outlineText(x: number, y: number, str: string, font: GameFont, outlineWidth: number, outlineFont: GameFont): void {
        drawText(x - outlineWidth, y - outlineWidth, str, outlineFont);
        drawText(x + outlineWidth, y - outlineWidth, str, outlineFont);
        drawText(x - outlineWidth, y + outlineWidth, str, outlineFont);
        drawText(x + outlineWidth, y + outlineWidth, str, outlineFont);
        drawText(x, y, str, font);
    }

    /**
     * Draw text at the given position
     * 
     * @param x The x coordinate to draw the text at
     * @param y The y coordinate to draw the text at
     * @param text The text to draw
     * @param font The font to use when drawing
     * @param col The color tint to apply 
     */
    export function drawText(x: number, y: number, text: string, font: GameFont, col?: string): void {
        text = tr.translate(text);

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
            drawTile(font.tiles, x, 0, tile, font.tiles.tileWidth, font.tiles.tileHeight, col);
            const kern = font.widths.find((a: any) => (a[1] as string).includes(c));
            if (kern) {
                x += (kern[0] as number);
            }
        }

        pop();
    }
    
    /**
     * Draw the outline of a rectangle to the graphics context
     *
     * @param x The x coordinate to draw at
     * @param y The y coordinate to draw at 
     * @param width The width of the rectangle to draw
     * @param height The height of the rectangle to draw
     * @param col The color to draw the rectangle in - in CSS format
     */
    export function drawRect(x: number, y: number, width: number, height: number, col: string): void {
        currentRenderer.drawRect(x, y, width, height, col);
    }

    /**
     * Get the width in pixels of the text provided
     * 
     * @param text The text to measure
     * @param font The font to use when measuring
     * @returns The width in pixels of the text provided
     */
    export function textWidth(text: string, font: GameFont): number {
        text = tr.translate(text);

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

    /**
     * Draw text centered horizontally on the screen
     * 
     * @param text The text to draw
     * @param y The y coordinate to draw the text at
     * @param font The font to use rendering 
     * @param col The color tint to apply 
     */
    export function centerText(text: string, y: number, font: GameFont, col?: string): void {
        drawText(Math.floor((width() - textWidth(text, font)) / 2), y, text, font, col);
    }

    function update(): void {
        const screenWidth = Math.floor(window.innerWidth);
        const screenHeight = Math.floor(window.innerHeight);

        if (canvas.width !== screenWidth || canvas.height !== screenHeight) {
            canvas.width = screenWidth;
            canvas.height = screenHeight;
            currentRenderer.resize();
        }
    }

    /**
     * Draw a rectangle to the graphics context
     * 
     * @param x The x coordinate to draw at
     * @param y The y coordinate to draw at 
     * @param width The width of the rectangle to draw
     * @param height The height of the rectangle to draw
     * @param col The color to fill the rectangle in - in CSS format
     */
    export function fillRect(x: number, y: number, width: number, height: number, col: string) {
        currentRenderer.fillRect(x, y, width, height, col);
    }

    /**
     * Draw an image to the graphics context
     * 
     * @param image The image to be drawn
     * @param x The x coordinate to draw at
     * @param y The y coordinate to draw at 
     * @param width The width of the image to draw
     * @param height The height of the image to draw
     * @param col The color to tint the image - in CSS format
     */
    export function drawImage(image: GameImage, x: number, y: number, width?: number, height?: number, col?: string): void {
        currentRenderer.drawImage(image, x, y, width, height, col);
    }

    /**
     * Store the current state of the context (transforms, alpha etc) to 
     * the stack.
     */
    export function push() {
        currentRenderer.push();
    }

    /**
     * Restore the state of the context (transforms, alpha etc) from
     * the stack.
     */
    export function pop() {
        currentRenderer.pop();
    }

    /**
     * Set the alpha to apply when drawing
     * 
     * @param alpha The alpha to apply (0-1)
     */
    export function alpha(alpha: number): void {
        currentRenderer.alpha(alpha);
    }

    /**
     * Apply a translation transform to the current graphics context
     * 
     * @param x The amount to transform on the x axis
     * @param y The amount to transform on the y axis
     */
    export function translate(x: number, y: number): void {
        currentRenderer.translate(x, y);
    }

    /**
     * Apply a scaling transform to the current graphics context
     * 
     * @param x The amount to scale on the x axis
     * @param y The amount to scale on the y axis
     */
    export function scale(x: number, y: number): void {
        currentRenderer.scale(x, y);
    }

    /**
     * Apply a rotation transform to the current graphics context
     * 
     * @param ang The angle to rotate the context by
     */
    export function rotate(ang: number): void {
        currentRenderer.rotate(ang);
    }

    /**
     * Re-initialize any renderer resources on load of new images
     */
    export function initResourceOnLoaded(): void {
        currentRenderer.initResourceOnLoaded();
    }

    /**
     * Create an offscreen rendering context
     * 
     * @param width The width of the new context in pixels
     * @param height The height of the new context in pixels
     * @returns The newly created offscreen canvas
     */
    export function createOffscreen(width: number, height: number): Offscreen {
        return currentRenderer.createOffscreen(width, height);
    }

    /**
     * Draw an offscreen context to the current context
     * 
     * @param offscreen The offscreen context to draw
     * @param x The x coordinate to draw at
     * @param y The y coordinate to draw at
     */
    export function drawOffscreen(offscreen: Offscreen, x: number, y: number): void {
        currentRenderer.drawOffscreen(offscreen, x, y);
    }

    /**
     * Draw a section of an offscreen context to the current context
     * 
     * @param offscreen The offscreen context to draw
     * @param x The x coordinate to draw at
     * @param y The y coordinate to draw at
     * @param sx The x coordinate in the offscreen canvas to start drawing from
     * @param sy The y coordinate in the offscreen canvas to start drawing from
     * @param width The width of the section to draw
     * @param height The height of the section to draw
     */
    export function drawOffscreenSection(offscreen: Offscreen, x: number, y: number, sx: number, sy: number, width: number, height: number): void {
        currentRenderer.drawOffscreenSection(offscreen, x, y, sx, sy, width, height);
    }

    /**
     * Configure the graphics context to render to the offscreen canvas provided
     * 
     * @param offscreen The offscreen canvas that this context should render to
     */
    export function drawToOffscreen(offscreen: Offscreen): void {
        currentRenderer.drawToOffscreen(offscreen);
    }

    /**
     * Configure the graphics context to render to the screen
     */
    export function drawToMain(): void {
        currentRenderer.drawToMain();
    }

    /**
     * Clear a rectangle on the current graphics context. Resets pixels completely.
     * 
     * @param x The x coordinate of the rectangle to clear
     * @param y The y coordinate of the rectangle to clear
     * @param width The width of the rectangle to clear
     * @param height The height of the rectangle to clear
     */
    export function clearRect(x: number, y: number, width: number, height: number): void {
        currentRenderer.clearRect(x, y, width, height);
    }

    /**
     * Get the number of draws thats have been applied in the last frame
     */
    export function getDrawCount(): number {
        return currentRenderer.getDrawCount();
    }
}