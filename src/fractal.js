const { createCanvas } = require('canvas');

function map(value, start1, stop1, start2, stop2) {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255];
}

function getColour(n, max, scheme) {
    if (n >= max) return [0, 0, 0, 255];
    const t = Math.sqrt(n / max);
    switch (scheme) {
        case "greyscale":
            const gray = Math.floor(t * 255);
            return [gray, gray, gray, 255];
        case "rainbow":
            const hueR = map(t, 0, 1, 0, 360);
            return hslToRgb(hueR, 100, 50);
        case "fire":
            return [Math.floor(map(t, 0, 1, 0, 255)), Math.floor(map(t, 0, 1, 0, 150)), 0, 255];
        default: // HSL
            const hue = map(t, 0, 1, 0, 360);
            const light = map(t, 0, 1, 20, 70);
            return hslToRgb(hue, 100, light);
    }
}

function iterate(z, c, power) {
    const r = Math.sqrt(z.real * z.real + z.imag * z.imag);
    const theta = Math.atan2(z.imag, z.real);
    const rP = Math.pow(r, power);
    return {
        real: rP * Math.cos(power * theta) + c.real,
        imag: rP * Math.sin(power * theta) + c.imag
    };
}

async function generateFractal({
    width = 800,
    height = 600,
    maxIterations = 500,
    power = 2,
    c = { real: 0.285, imag: 0.01 },
    scale = 1.5,
    offsetX = 0,
    offsetY = 0,
    colourScheme = "rainbow",
    maxTime = 120000,
    debugLog = null
}) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const startTime = Date.now();

    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {

            if (Date.now() - startTime > maxTime) {
                return null;
            }

            let z = {
                real: map(x, 0, width, -scale + offsetX, scale + offsetX),
                imag: map(y, 0, height, -scale + offsetY, scale + offsetY)
            };

            let n = 0;
            while (n < maxIterations) {
                z = iterate(z, c, power);
                if ((z.real * z.real + z.imag * z.imag) > 4) break;
                n++;
            }

            let mu = n;
            if (n < maxIterations) {
                mu = n + 1 - Math.log(Math.log(Math.sqrt(z.real * z.real + z.imag * z.imag))) / Math.log(power);
            }

            const colour = getColour(mu, maxIterations, colourScheme);
            const idx = (y * width + x) * 4;
            data[idx] = colour[0];
            data[idx + 1] = colour[1];
            data[idx + 2] = colour[2];
            data[idx + 3] = colour[3];
        }

        await new Promise(resolve => setImmediate(resolve));
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toBuffer('image/png');
}

module.exports = { generateFractal };