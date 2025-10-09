const fs = require('fs');
const { generateFractal } = require('./fractal');

const options = {
    width: 1920,
    height: 1080,
    maxIterations: 3000,
    power: 2,
    c: { real: 0.285, imag: 0.01 },
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    colourScheme: 'rainbow'
};



const startTime = Date.now();

const buffer = generateFractal(options);

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

fs.writeFileSync('test_fractal.png', buffer);
