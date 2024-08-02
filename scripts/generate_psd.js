
  const fs = require('fs');
  const { createCanvas, loadImage } = require('canvas');
  const { initializeCanvas, writePsd, readPsd } = require('ag-psd');
  const { promisify } = require('util');
  const sizeOf = promisify(require('image-size'));const psdFilePath = 'layering/runs/outputs/cad6a777-fe8a-49c5-98b7-748aa68d2062.png/output.psd';const outputFolder = 'layering/runs/outputs/cad6a777-fe8a-49c5-98b7-748aa68d2062.png';
  async function generatePSD() {
    const imageFiles = fs.readdirSync(outputFolder).map(file => `${outputFolder}/${file}`);

    if (imageFiles.length === 0) {
      console.error('No images found in the folder.');
      return;
    }

    // Get dimensions from the first image
    const { width, height } = await sizeOf(imageFiles[0]);

    // Initialize the main canvas
    const mainImageCanvas = createCanvas(width, height);
    const mainImageContext = mainImageCanvas.getContext('2d');

    // Initialize the PSD children array
    const psdChildren = [];

    let i = 1;
    for (const imagePath of imageFiles) {
      const image = await loadImage(imagePath);

      // Create a canvas with the same dimensions as the image
      const canvas = createCanvas(image.width, image.height);

      // Draw the image onto the canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);

      // Create a layer for each image and add it to the PSD children
      const layer = {
        name: `layer-${i++}`,
        left: 0, // Adjust as needed
        top: 0, // Adjust as needed
        blendMode: "normal",
        opacity: 1, // Adjust as needed
        mask: null, // Adjust as needed
        type: "layer",
        compressionMethod: 1,
        canvas: canvas,
      };

      psdChildren.push(layer);
    }
     
     
     psdChildren.push({...psdChildren[0]})
     psdChildren[psdChildren.length -1].blendMode = "luminosity";

    // Create the PSD object
    const psd = {
      width: width,
      height: height,
      channels: 3,
      bitsPerChannel: 8,
      colorMode: 3,
      children: psdChildren,
      canvas: mainImageCanvas,
    };

    // Write the PSD to a file
    // const psdBuffer = writePsd(psd);
  // fs.writeFileSync(psdFilePath, psdBuffer);
      const arrayBuffer = writePsd(psd, { generateThumbnail: false });



  // Write the arrayBuffer to a file
  fs.writeFileSync(psdFilePath, Buffer.from(arrayBuffer));


    console.log(`PSD file generated with dimensions: ${width} x ${height}`);
  }

  generatePSD();
  