import potpack from "potpack";
import { graphics } from "./graphics";
import { resources } from "./resources";

let canvas: HTMLCanvasElement;
let transformCanvas: HTMLCanvasElement;
let transformCtx: CanvasRenderingContext2D;
let gl: WebGLRenderingContext;
let extension: ANGLE_instanced_arrays;
let arrayBuffer: ArrayBuffer;
let shaderProgram: WebGLProgram | undefined;
let glBuffer: WebGLBuffer | null;
let maxDraws = 10000;
let positions: Int16Array;
let rotations: Float32Array;
let rgbas: Uint32Array;
let draws: number = 0;
let atlasTextures: WebGLTexture[] | null = null;
let currentTexture: WebGLTexture | null = null;
let uniforms: Record<string, WebGLUniformLocation> = {};
let texWidth = 0;
let texHeight = 0;
let saves = 0;
let drawsPerFrame = 0;
let lastDrawsPerFrame = 0;

const floatsPerImageRotation = 1;
const shortsPerImagePosition = 2
const shortsPerImageSize = 2
const shortsPerImageTexPos = 4
const bytesPerImageRgba = 4

let textureSizeOverride = 0;

const bytesPerImage = shortsPerImagePosition * 2 +
    shortsPerImageSize * 2 +
    shortsPerImageTexPos * 2 +
    bytesPerImageRgba + 4 * floatsPerImageRotation;


let currentContextState: RenderState = {
    alpha: 255,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
}
let renderStates: RenderState[] = [];

let bitmaps: WebGLBitmap[] = [];

interface WebGLOffscreen extends graphics.Offscreen {
    texture: WebGLTexture | null;
    fb: WebGLFramebuffer | null;
}

interface WebGLBitmap extends graphics.GameImage {
    texX: number;
    texY: number;
    texIndex: number;
    width: number;
    height: number;
    image?: HTMLImageElement;
    smooth?: boolean;
}

interface RenderState {
    alpha: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
}

let pixelatedRendering = false;
let texturePaddingSize = 2;

export const webglRenderer: graphics.Renderer = {
    init(c: HTMLCanvasElement, pixelatedRenderingEnabled: boolean, textureSize: number, texturePadding: number = 2): graphics.Renderer {
        pixelatedRendering = pixelatedRenderingEnabled;
        textureSizeOverride = textureSize;
        canvas = c;
        transformCanvas = document.createElement("canvas");
        transformCtx = transformCanvas.getContext("2d")!;
        texturePaddingSize = texturePadding;

        c.addEventListener("webglcontextlost", (event) => {
            lostContext();
            event.preventDefault();
        }, false);

        c.addEventListener("webglcontextrestored", (event) => {
            recoverContext();
        }, false);

        gl = c.getContext('experimental-webgl', { powerPreference: "high-performance" }) as WebGLRenderingContext;
        initGlResources();
        _initResourceOnLoaded();
        return webglRenderer;
    },
    loadImage(url: string, track: boolean, id?: string, smooth?: boolean): graphics.GameImage {
        if (track) {
            resources.resourceRequested(url);
        }

        const bitmap: WebGLBitmap = {
            id: "",
            width: 0,
            height: 0,
            texIndex: 0,
            texX: 0,
            texY: 0,
            smooth
        };

        bitmaps.push(bitmap);
        const image = new Image();

        image.crossOrigin = "anonymous";
        image.onerror = () => {
            console.log("Failed to load: " + url);
        };
        image.onload = () => {
            bitmap.width = image.width;
            bitmap.height = image.height;
            bitmap.image = image;
            bitmap.id = id ?? url;

            newResourceLoaded();
            if (track) {
                resources.resourceLoaded(url);
            }
        };
        image.src = url;

        return bitmap;
    },
    loadTileSet(url: string, tw: number, th: number, id?: string): graphics.TileSet {
        resources.resourceRequested(url);
        const bitmap: WebGLBitmap = {
            id: "",
            width: 0,
            height: 0,
            texIndex: 0,
            texX: 0,
            texY: 0
        };

        bitmaps.push(bitmap);
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onerror = () => {
            console.log("Failed to load: " + url);
        };
        image.onload = () => {
            bitmap.width = image.width;
            bitmap.height = image.height;
            bitmap.image = image;
            bitmap.id = id ?? url;

            newResourceLoaded();
            resources.resourceLoaded(url);
        };
        image.src = url;

        const tileset: graphics.TileSet = {
            image: bitmap,
            tileWidth: tw,
            tileHeight: th,
            tiles: []
        };

        return tileset;
    },

    drawTile(tiles: graphics.TileSet, x: number, y: number, tile: number, width?: number, height?: number, c?: string): void {
        const bitmap = tiles.image as WebGLBitmap;

        if (!bitmap.image) {
            return;
        }

        const scanLine = Math.floor(bitmap.image.width / tiles.tileWidth);
        const tx = tile % scanLine;
        const ty = Math.floor(tile / scanLine);
        const texX = bitmap.texX + (tx * tiles.tileWidth);
        const texY = bitmap.texY + (ty * tiles.tileHeight);
        const texIndex = bitmap.texIndex;
        let col: number = c ? colToNumber(c) : 0xFFFFFF00;

        let a = currentContextState.alpha;
        if ((col % 256)) {
            a = ((currentContextState.alpha / 255) * ((col % 256) / 255)) * 255;
            if (a < 255) {
                col = (col & 0xFFFFFF00) | a;
            }
        }

        _drawImage(texIndex, texX, texY, tiles.tileWidth, tiles.tileHeight, x, y, width ?? tiles.tileWidth, height ?? tiles.tileHeight, col, a);
    },

    preRender(): void {
        drawsPerFrame = 0;

        currentContextState = {
            alpha: 255,
            scaleX: 1,
            scaleY: 1,
            rotation: 0
        };
        renderStates = [];

        renderStart();
    },

    getDrawCount(): number {
        return lastDrawsPerFrame;
    },

    postRender(): void {
        renderEnd();
        if (drawsPerFrame !== 0) {
            lastDrawsPerFrame = drawsPerFrame;
        }
    },

    drawRect(x: number, y: number, width: number, height: number, col: string): void {
        webglRenderer.fillRect(x, y, width, 1, col);
        webglRenderer.fillRect(x, y + height - 1, width, 1, col);
        webglRenderer.fillRect(x, y, 1, height, col);
        webglRenderer.fillRect(x + width - 1, y, 1, height, col);
    },

    fillRect(x: number, y: number, width: number, height: number, col: string): void {
        let rgba = colToNumber(col);
        const a = ((currentContextState.alpha / 255) * ((rgba % 256) / 255)) * 255;
        if (a < 255) {
            rgba = (rgba & 0xFFFFFF00) | a;
        }
        _drawImage(0, 0, 0, 1, 1, x, y, width, height, rgba, a)
    },

    drawImage(image: graphics.GameImage, x: number, y: number, width?: number, height?: number, c?: string): void {
        const bitmap = image as WebGLBitmap;

        width = width ? Math.floor(width) : image.width;
        height = height ? Math.floor(height) : image.height;

        const col: number = c ? colToNumber(c) : 0xFFFFFF00;

        _drawImage(bitmap.texIndex, bitmap.texX, bitmap.texY, bitmap.width, bitmap.height, x, y, width, height, col, currentContextState.alpha);
    },
    push(): void {
        saves++;
        transformCtx.save();
        renderStates.push({ ...currentContextState });
    },
    pop(): void {
        saves--;
        transformCtx.restore();
        currentContextState = renderStates.splice(renderStates.length - 1, 1)[0];
        resetState();
    },
    alpha(alpha: number): void {
        currentContextState.alpha = Math.floor(alpha * 255);
    },
    translate(x: number, y: number): void {
        transformCtx.translate(x, y);
    },
    scale(x: number, y: number): void {
        transformCtx.scale(x, y);
        currentContextState.scaleX = x;
        currentContextState.scaleY = y;
    },
    rotate(ang: number): void {
        currentContextState.rotation = ang;
    },
    initResourceOnLoaded: function (): void {
        _initResourceOnLoaded();
    },

    createOffscreen(width: number, height: number): graphics.Offscreen {
        const offscreen: WebGLOffscreen = {
            width,
            height,
            texture: null,
            fb: null
        };
        createFrameBuffer(offscreen);

        return offscreen;
    },


    drawOffscreenSection(o: graphics.Offscreen, x: number, y: number, sx: number, sy: number, width: number, height: number): void {
        const offscreen: WebGLOffscreen = o as WebGLOffscreen;

        glCommitContext();

        glStartContext();
        gl.uniform2f(getUniformLoc("uTexSize"), offscreen.width, offscreen.height);
        gl.bindTexture(gl.TEXTURE_2D, offscreen.texture);
        _drawImage(-100, sx, offscreen.height - sy, width, -height, x, y, width, height, 0xFFFFFF00, currentContextState.alpha);
        glCommitContext();

        gl.uniform2f(getUniformLoc("uTexSize"), texWidth, texHeight);
        gl.bindTexture(gl.TEXTURE_2D, currentTexture);
        glStartContext();
    },

    drawOffscreen(o: graphics.Offscreen, x: number, y: number): void {
        const offscreen: WebGLOffscreen = o as WebGLOffscreen;

        glCommitContext();

        glStartContext();
        gl.uniform2f(getUniformLoc("uTexSize"), offscreen.width, offscreen.height);
        gl.bindTexture(gl.TEXTURE_2D, offscreen.texture);
        _drawImage(-100, 0, offscreen.height, offscreen.width, -offscreen.height, x, y, offscreen.width, offscreen.height, 0xFFFFFF00, currentContextState.alpha);
        glCommitContext();

        gl.uniform2f(getUniformLoc("uTexSize"), texWidth, texHeight);
        gl.bindTexture(gl.TEXTURE_2D, currentTexture);
        glStartContext();

    },

    drawToOffscreen(offscreen: graphics.Offscreen): void {
        useFrameBuffer(offscreen as WebGLOffscreen);
    },

    drawToMain(): void {
        unuseFrameBuffer();
    },

    ready(): boolean {
        return !!atlasTextures;
    },

    clearRect(x: number, y: number, width: number, height: number): void {
        glCommitContext();

        glStartContext();
        gl.blendFunc(gl.ZERO, gl.ZERO);
        webglRenderer.fillRect(x, y, width, height, "rgba(0,0,0,0)");
        glCommitContext();
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        glStartContext();
    },

    resize(): void {
        resize();
    },
}

function initGlResources(): void {
    extension = gl.getExtension('ANGLE_instanced_arrays') as ANGLE_instanced_arrays

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    arrayBuffer = new ArrayBuffer(maxDraws * bytesPerImage)
    positions = new Int16Array(arrayBuffer)
    rotations = new Float32Array(arrayBuffer);
    rgbas = new Uint32Array(arrayBuffer)

    const vertCode = "\
        attribute vec2 aSizeMult;\
        attribute vec2 aPos;\
        attribute vec2 aSize;\
        attribute vec4 aTexPos;\
        attribute vec4 aRgba;\
        attribute float aRotation;\
        \
        varying vec2 fragTexturePos;\
        varying vec4 fragAbgr;\
        \
        uniform vec2 uCanvasSize;\
        uniform vec2 uTexSize;\
        \
        void main(void){\
            vec2 drawPos;\
            if (aRotation != 0.0){\
                float goX = cos(aRotation);\
                float goY = sin(aRotation);\
                vec2 cornerPos = aSize * (aSizeMult);\
                drawPos = (aPos + vec2(goX*cornerPos.x - goY*cornerPos.y, goY*cornerPos.x + goX*cornerPos.y)) / uCanvasSize;\
            } else {\
                drawPos = (aPos + aSize*aSizeMult) / uCanvasSize;\
            }\
            gl_Position = vec4(drawPos.x - 1.0, 1.0 - drawPos.y, 0.0, 1.0);\
            gl_Position.z = 0.0; \
            gl_Position.w = 1.0; \
            \
            fragTexturePos = (aTexPos.xy + aTexPos.zw * aSizeMult) / uTexSize;\
            \
            fragAbgr.x = aRgba.w/255.0; \
            fragAbgr.y = aRgba.z/255.0; \
            fragAbgr.z = aRgba.y/255.0; \
            fragAbgr.w = aRgba.x/255.0; \
        }\
    "

    // Create a vertex shader object with code.
    const vertShader = gl.createShader(gl.VERTEX_SHADER) as WebGLShader
    gl.shaderSource(vertShader, vertCode)
    gl.compileShader(vertShader)
    let output = gl.getShaderInfoLog(vertShader);
    if (output) {
        console.log(output);
    }
    // Fragment shader source code.
    const fragCode = "\
        varying highp vec2 fragTexturePos;\
        varying highp vec4 fragAbgr;\
        uniform sampler2D uSampler;\
        \
        void main(void){\
            gl_FragColor = texture2D(uSampler, fragTexturePos) * fragAbgr;\
        }\
    "

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER) as WebGLShader;
    gl.shaderSource(fragShader, fragCode);
    gl.compileShader(fragShader);
    output = gl.getShaderInfoLog(fragShader);
    if (output) {
        console.log(output);
    }

    shaderProgram = gl.createProgram() as WebGLProgram
    gl.attachShader(shaderProgram, vertShader);
    gl.attachShader(shaderProgram, fragShader);
    gl.linkProgram(shaderProgram);
    gl.useProgram(shaderProgram);
    output = gl.getProgramInfoLog(shaderProgram);
    if (output) {
        console.log(output);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([0, 1, 2, 2, 1, 3]), gl.STATIC_DRAW)

    // Our multiplier array for width/height so we can get to each corner of the image drawn.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW)

    const attribute = gl.getAttribLocation(shaderProgram, "aSizeMult")
    gl.enableVertexAttribArray(attribute)
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)

    glBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, arrayBuffer, gl.DYNAMIC_DRAW)

    let byteOffset = 0;

    const setupAttribute = (name: string, dataType: number, amount: number) => {
        if (shaderProgram) {
            const attribute = gl.getAttribLocation(shaderProgram, name)
            if (attribute !== -1) {
                gl.enableVertexAttribArray(attribute)
                gl.vertexAttribPointer(attribute, amount, dataType, false, bytesPerImage, byteOffset)
                extension.vertexAttribDivisorANGLE(attribute, 1)
                if (dataType == gl.SHORT)
                    amount *= 2
                if (dataType == gl.FLOAT)
                    amount *= 4
                byteOffset += amount
            } else {
                console.log("Attribute not found: " + name);
            }
        }
    }

    setupAttribute("aPos", gl.SHORT, shortsPerImagePosition);
    setupAttribute("aSize", gl.SHORT, shortsPerImageSize);
    setupAttribute("aTexPos", gl.SHORT, shortsPerImageTexPos);
    setupAttribute("aRgba", gl.UNSIGNED_BYTE, bytesPerImageRgba);
    setupAttribute("aRotation", gl.FLOAT, floatsPerImageRotation)
}

function parseColor(input: string): number[] {
    let mm;
    let m;
    // Obviously, the numeric values will be easier to parse than names.So we do those first.
    mm = input.match(/^#?([0-9a-f]{3})$/i);
    if (mm) {
        m = mm[1];
        // in three-character format, each value is multiplied by 0x11 to give an
        // even scale from 0x00 to 0xff
        return [
            parseInt(m.charAt(0), 16) * 0x11,
            parseInt(m.charAt(1), 16) * 0x11,
            parseInt(m.charAt(2), 16) * 0x11,
            1
        ];
    }
    // That's one. Now for the full six-digit format: 
    mm = input.match(/^#?([0-9a-f]{6})$/i);
    if (mm) {
        m = mm[1];
        return [
            parseInt(m.substr(0, 2), 16),
            parseInt(m.substr(2, 2), 16),
            parseInt(m.substr(4, 2), 16),
            1
        ];
    }
    // And now for rgb() format:
    mm = input.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([+-]?([0-9]*[.])?[0-9]+)\s*\)$/i);
    if (mm) {
        return [Number.parseInt(mm[1]), Number.parseInt(mm[2]), Number.parseInt(mm[3]), Number.parseFloat(mm[4])];
    }
    mm = input.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (mm) {
        return [Number.parseInt(mm[1]), Number.parseInt(mm[2]), Number.parseInt(mm[3]), 1];
    }
    // https://www.w3schools.com/colors/colors_names.asp
    // https://en.wikipedia.org/wiki/Web_colors
    // http://www.colors.commutercreative.com/grid/
    var webColors: Record<string, string> = {
        "AliceBlue": "#F0F8FF",
        "AntiqueWhite": "#FAEBD7",
        "Aqua": "#00FFFF",
        "Aquamarine": "#7FFFD4",
        "Azure": "#F0FFFF",
        "Beige": "#F5F5DC",
        "Bisque": "#FFE4C4",
        "Black": "#000000",
        "BlanchedAlmond": "#FFEBCD",
        "Blue": "#0000FF",
        "BlueViolet": "#8A2BE2",
        "Brown": "#A52A2A",
        "BurlyWood": "#DEB887",
        "CadetBlue": "#5F9EA0",
        "Chartreuse": "#7FFF00",
        "Chocolate": "#D2691E",
        "Coral": "#FF7F50",
        "CornflowerBlue": "#6495ED",
        "Cornsilk": "#FFF8DC",
        "Crimson": "#DC143C",
        "Cyan": "#00FFFF",
        "DarkBlue": "#00008B",
        "DarkCyan": "#008B8B",
        "DarkGoldenRod": "#B8860B",
        "DarkGray": "#A9A9A9",
        "DarkGrey": "#A9A9A9",
        "DarkGreen": "#006400",
        "DarkKhaki": "#BDB76B",
        "DarkMagenta": "#8B008B",
        "DarkOliveGreen": "#556B2F",
        "DarkOrange": "#FF8C00",
        "DarkOrchid": "#9932CC",
        "DarkRed": "#8B0000",
        "DarkSalmon": "#E9967A",
        "DarkSeaGreen": "#8FBC8F",
        "DarkSlateBlue": "#483D8B",
        "DarkSlateGray": "#2F4F4F",
        "DarkSlateGrey": "#2F4F4F",
        "DarkTurquoise": "#00CED1",
        "DarkViolet": "#9400D3",
        "DeepPink": "#FF1493",
        "DeepSkyBlue": "#00BFFF",
        "DimGray": "#696969",
        "DimGrey": "#696969",
        "DodgerBlue": "#1E90FF",
        "FireBrick": "#B22222",
        "FloralWhite": "#FFFAF0",
        "ForestGreen": "#228B22",
        "Fuchsia": "#FF00FF",
        "Gainsboro": "#DCDCDC",
        "GhostWhite": "#F8F8FF",
        "Gold": "#FFD700",
        "GoldenRod": "#DAA520",
        "Gray": "#808080",
        "Grey": "#808080",
        "Green": "#008000",
        "GreenYellow": "#ADFF2F",
        "HoneyDew": "#F0FFF0",
        "HotPink": "#FF69B4",
        "IndianRed ": "#CD5C5C",
        "Indigo ": "#4B0082",
        "Ivory": "#FFFFF0",
        "Khaki": "#F0E68C",
        "Lavender": "#E6E6FA",
        "LavenderBlush": "#FFF0F5",
        "LawnGreen": "#7CFC00",
        "LemonChiffon": "#FFFACD",
        "LightBlue": "#ADD8E6",
        "LightCoral": "#F08080",
        "LightCyan": "#E0FFFF",
        "LightGoldenRodYellow": "#FAFAD2",
        "LightGray": "#D3D3D3",
        "LightGrey": "#D3D3D3",
        "LightGreen": "#90EE90",
        "LightPink": "#FFB6C1",
        "LightSalmon": "#FFA07A",
        "LightSeaGreen": "#20B2AA",
        "LightSkyBlue": "#87CEFA",
        "LightSlateGray": "#778899",
        "LightSlateGrey": "#778899",
        "LightSteelBlue": "#B0C4DE",
        "LightYellow": "#FFFFE0",
        "Lime": "#00FF00",
        "LimeGreen": "#32CD32",
        "Linen": "#FAF0E6",
        "Magenta": "#FF00FF",
        "Maroon": "#800000",
        "MediumAquaMarine": "#66CDAA",
        "MediumBlue": "#0000CD",
        "MediumOrchid": "#BA55D3",
        "MediumPurple": "#9370DB",
        "MediumSeaGreen": "#3CB371",
        "MediumSlateBlue": "#7B68EE",
        "MediumSpringGreen": "#00FA9A",
        "MediumTurquoise": "#48D1CC",
        "MediumVioletRed": "#C71585",
        "MidnightBlue": "#191970",
        "MintCream": "#F5FFFA",
        "MistyRose": "#FFE4E1",
        "Moccasin": "#FFE4B5",
        "NavajoWhite": "#FFDEAD",
        "Navy": "#000080",
        "OldLace": "#FDF5E6",
        "Olive": "#808000",
        "OliveDrab": "#6B8E23",
        "Orange": "#FFA500",
        "OrangeRed": "#FF4500",
        "Orchid": "#DA70D6",
        "PaleGoldenRod": "#EEE8AA",
        "PaleGreen": "#98FB98",
        "PaleTurquoise": "#AFEEEE",
        "PaleVioletRed": "#DB7093",
        "PapayaWhip": "#FFEFD5",
        "PeachPuff": "#FFDAB9",
        "Peru": "#CD853F",
        "Pink": "#FFC0CB",
        "Plum": "#DDA0DD",
        "PowderBlue": "#B0E0E6",
        "Purple": "#800080",
        "RebeccaPurple": "#663399",
        "Red": "#FF0000",
        "RosyBrown": "#BC8F8F",
        "RoyalBlue": "#4169E1",
        "SaddleBrown": "#8B4513",
        "Salmon": "#FA8072",
        "SandyBrown": "#F4A460",
        "SeaGreen": "#2E8B57",
        "SeaShell": "#FFF5EE",
        "Sienna": "#A0522D",
        "Silver": "#C0C0C0",
        "SkyBlue": "#87CEEB",
        "SlateBlue": "#6A5ACD",
        "SlateGray": "#708090",
        "SlateGrey": "#708090",
        "Snow": "#FFFAFA",
        "SpringGreen": "#00FF7F",
        "SteelBlue": "#4682B4",
        "Tan": "#D2B48C",
        "Teal": "#008080",
        "Thistle": "#D8BFD8",
        "Tomato": "#FF6347",
        "Turquoise": "#40E0D0",
        "Violet": "#EE82EE",
        "Wheat": "#F5DEB3",
        "White": "#FFFFFF",
        "WhiteSmoke": "#F5F5F5",
        "Yellow": "#FFFF00",
        "YellowGreen": "#9ACD32",
        "Transparent": "rgba(0,0,0,0)",
    };
    for (var p in webColors) {
        webColors[p.toLowerCase()] = webColors[p];
    }
    var wc = webColors[input.toLowerCase()];
    if (wc != null)
        return parseColor(wc);
    throw Error("'" + input + "' is not a valid color...");
}

export function colToNumber(input: string): number {
    let result = COL_CACHE[input];
    if (result === undefined) {
        const rgba = parseColor(input);
        const value = (rgba[0] * (256 * 256 * 256)) + (rgba[1] * (256 * 256)) + (rgba[2] * 256) + Math.floor(rgba[3] * 255);
        COL_CACHE[input] = value;
        result = value;

        if (Object.keys(COL_CACHE).length === 2000) {
            alert("2000 color caches have been created");
        }
    }

    return result;
}

const COL_CACHE: Record<string, number> = {
};

export function getMaxTextureSize(): number {
    if (window.WebGLRenderingContext === undefined) {
        return 0;
    }

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext('experimental-webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true }) as WebGLRenderingContext
    if (!gl) {
        return 0;
    }
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
}


function newResourceLoaded(): void {
    if (atlasTextures) {
        _initResourceOnLoaded();
    }
}

function _initResourceOnLoaded(): void {
    const textureSize = textureSizeOverride > 0 ? textureSizeOverride : Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096 * 2);

    let list = [...bitmaps];
    list.sort((a, b) => a.height > b.height ? -1 : 1);

    let records = list.map(image => { return { image: image, w: image.width + texturePaddingSize, h: image.height + texturePaddingSize, smooth: image.smooth } });
    const tooBig = records.filter(r => r.w > textureSize || r.h > textureSize);
    tooBig.forEach(r => console.log(r.image.id + " is too big for small textures: " + r.w + "x" + r.h));

    records = records.filter(r => r.w <= textureSize && r.h <= textureSize);

    const nonSmooth = records.filter(r => !r.smooth);
    const smooth = records.filter(r => r.smooth);

    let base = 0;
    let textureCount = 0;

    for (let i = 0; i < nonSmooth.filter(r => !r.smooth).length; i++) {
        let { w, h, fill } = potpack(nonSmooth.slice(base, i));
        if (w > textureSize || h > textureSize) {
            let { w, h, fill } = potpack(nonSmooth.slice(base, i - 1));
            nonSmooth.slice(base, i - 1).forEach(record => record.image.texIndex = textureCount);
            base = i - 1;
            textureCount++;
        }
    }
    let { w, h, fill } = potpack(nonSmooth.slice(base, nonSmooth.length));
    nonSmooth.slice(base, nonSmooth.length).forEach(record => record.image.texIndex = textureCount);
    textureCount++;

    const smoothedTextures: number[] = [];
    if (smooth.length > 0) {
        let base = 0;
        for (let i = 0; i < smooth.length; i++) {
            let { w, h, fill } = potpack(smooth.slice(base, i));
            if (w > textureSize || h > textureSize) {
                let { w, h, fill } = potpack(smooth.slice(base, i - 1));
                smooth.slice(base, i - 1).forEach(record => record.image.texIndex = textureCount);
                base = i - 1;
                smoothedTextures.push(textureCount);
                textureCount++;
            }
        }
        let { w, h, fill } = potpack(smooth.slice(base, smooth.length));
        smooth.slice(base, smooth.length).forEach(record => record.image.texIndex = textureCount);
        smoothedTextures.push(textureCount);
        textureCount++;
    }

    console.log("[WEBGL] Reloading textures (packed into " + textureCount + " textures - size " + textureSize + " - max: " + getMaxTextureSize() + ")");
    for (const record of records) {
        record.image.texX = (record as any).x + 1;
        record.image.texY = (record as any).y;
    }

    if (atlasTextures) {
        for (const texture of atlasTextures) {
            gl.deleteTexture(texture);
        }
    }
    atlasTextures = [];

    for (let i = 0; i < textureCount; i++) {
        const texture = gl.createTexture();
        if (texture) {
            atlasTextures.push(texture);

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.activeTexture(gl.TEXTURE0);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSize, textureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

            const whitePixel = document.createElement("canvas");
            const ctx = whitePixel.getContext("2d")!;
            ctx.fillStyle = '#FFF';
            ctx.fillRect(0, 0, 1, 1);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, whitePixel);

            for (const image of list.filter(lImage => lImage.texIndex === i)) {
                if (image.image) {
                    image.texIndex = i;
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, image.texX, image.texY, gl.RGBA, gl.UNSIGNED_BYTE, image.image);
                }
            }

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            if (pixelatedRendering && !smoothedTextures.includes(i)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            } else {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            }

            texWidth = textureSize;
            texHeight = textureSize;
            if (shaderProgram) {
                gl.uniform2f(getUniformLoc("uTexSize"), texWidth, texHeight);
            }
        }
    }

    resize();
}

function getUniformLoc(name: string): WebGLUniformLocation {
    let result: WebGLUniformLocation = uniforms[name];
    if (!result && shaderProgram) {
        const loc = gl.getUniformLocation(shaderProgram, name);
        if (loc) {
            uniforms[name] = result = loc;
        }
    }

    return result;
}

function resize() {
    // Resize the gl viewport to be the new size of the canvas.
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Update the shader variables for canvas size.
    // Sending it to gl now so we don't have to do the math in JavaScript on every draw,
    // since gl wants to draw at a position from 0 to 1, and we want to do drawImage with a screen pixel position.
    if (shaderProgram) {
        gl.uniform2f(getUniformLoc("uCanvasSize"), canvas.width / 2, canvas.height / 2);
    }
}

function resetState(): void {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function getError(): string | undefined {
    const error = gl.getError();
    if (error !== 0) {
        switch (error) {
            case WebGLRenderingContext.INVALID_ENUM:
                return "Invalid Enum";
            case WebGLRenderingContext.INVALID_VALUE:
                return "Invalid Value";
            case WebGLRenderingContext.INVALID_OPERATION:
                return "Invalid Operation";
            case WebGLRenderingContext.INVALID_FRAMEBUFFER_OPERATION:
                return "Invalid Framebuffer Operation";
            case WebGLRenderingContext.OUT_OF_MEMORY:
                return "Out of Memory";
            // in this case we're expecting our handler to pop up
            // and restore it - so don't return an error since
            // that'll stop the rendering thread
            case WebGLRenderingContext.CONTEXT_LOST_WEBGL:
                return undefined;

        }

        return "Unknown error - " + gl.getError();
    }

    return undefined;
}

function glStartContext(): void {
}

function glCommitContext(): void {
    if (draws > 0 && rgbas && extension) {
        drawsPerFrame += draws;
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, rgbas.subarray(0, draws * 6));
        extension.drawElementsInstancedANGLE(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, draws);
        draws = 0;
    }
}

function _drawImage(texIndex: number, texX: number, texY: number, texWidth: number, texHeight: number,
    drawX: number, drawY: number, width: number, height: number, rgba: number, alpha: number) {
    if (!atlasTextures) {
        return;
    }
    if (!rgbas || !positions) {
        return;
    }

    if ((texIndex >= 0) && (atlasTextures![texIndex] !== currentTexture)) {
        glCommitContext();
        currentTexture = atlasTextures![texIndex];
        gl.bindTexture(gl.TEXTURE_2D, currentTexture);
        glStartContext();
    }

    let i = draws * 6;

    // clamp alpha to prevent overflow
    if (alpha > 255) {
        alpha = 255;
    }

    rgbas[i + 4] = rgba | alpha;
    rotations[i + 5] = currentContextState.rotation * Math.sign(currentContextState.scaleX) * Math.sign(currentContextState.scaleY);
    i *= 2;

    if (currentContextState.rotation) {
        const dist = Math.sqrt(drawX * drawX + drawY * drawY);
        const angle = Math.atan2(drawY, drawX);
        drawX = Math.cos(angle + currentContextState.rotation) * dist;
        drawY = Math.sin(angle + currentContextState.rotation) * dist;
    }

    let drawX2 = drawX + width;
    let drawY2 = drawY + height;
    const t1 = transformCtx.getTransform().transformPoint({ x: drawX, y: drawY });
    const t2 = transformCtx.getTransform().transformPoint({ x: drawX2, y: drawY2 });

    drawX = t1.x;
    drawY = t1.y;
    drawX2 = t2.x;
    drawY2 = t2.y;

    drawX = Math.floor(drawX);
    drawY = Math.floor(drawY);
    drawX2 = Math.floor(drawX2);
    drawY2 = Math.floor(drawY2);

    texX = Math.floor(texX);
    texY = Math.floor(texY);
    texWidth = Math.floor(texWidth);
    texHeight = Math.floor(texHeight);

    width = drawX2 - drawX;
    height = drawY2 - drawY;

    positions[i] = drawX;
    positions[i + 1] = drawY;
    positions[i + 2] = width;
    positions[i + 3] = height;

    positions[i + 4] = texX;
    positions[i + 5] = texY;
    positions[i + 6] = texWidth;
    positions[i + 7] = texHeight;

    draws++
}


function renderStart(): void {
    if ((transformCtx as any).reset) {
        (transformCtx as any).reset();
    } else {
        // old way of reset all the state
        canvas.width += 0;
    }

    draws = 0;
    resetState();

    glStartContext();
}


function renderEnd(): void {
    glCommitContext();
}

function lostContext(): void {
    console.log("LOST GL CONTEXT");
    shaderProgram = undefined;
    atlasTextures = null;
}

function recoverContext(): void {
    console.log("RECOVERED GL CONTEXT");
    initGlResources();
    _initResourceOnLoaded();
    resize();
    console.log("RECREATE GL RESOURCES");
}

function createFrameBuffer(offscreen: WebGLOffscreen): void {
    offscreen.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, offscreen.texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        offscreen.width, offscreen.height, border,
        format, type, data);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    offscreen.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, offscreen.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, offscreen.texture, level);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
}

function useFrameBuffer(offscreen: WebGLOffscreen): void {
    glCommitContext();

    gl.bindFramebuffer(gl.FRAMEBUFFER, offscreen.fb);
    gl.uniform2f(getUniformLoc("uCanvasSize"), Math.floor(offscreen.width / 2), Math.floor(offscreen.height / 2));
    gl.viewport(0, 0, offscreen.width, offscreen.height);

    webglRenderer.push();
    currentContextState = {
        alpha: 255,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
    };
    transformCtx.resetTransform();

    glStartContext();
}

function unuseFrameBuffer(): void {
    glCommitContext();
    gl.flush();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(getUniformLoc("uCanvasSize"), canvas.width / 2, canvas.height / 2);

    webglRenderer.pop();
    glStartContext();
}