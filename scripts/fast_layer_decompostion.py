import os.path
import pathlib
from multiprocessing import Pool
import numpy as np
import time
from scipy.spatial import ConvexHull
from functools import partial
from fscs_layeering import create_dir_if_not_exists
import fast_layer_decompostion_core
from fast_layer_decompostion_core import Additive_mixing_layers_extraction, pyopencl_example

# fast_layer_decompostion_core.Additive_mixing_layers_extraction.DEMO = False
### Define Variables
models_dir = pathlib.Path("layering", "models")
test_imgs_dir = pathlib.Path("layering", "runs")
output_dir = pathlib.Path("layering", "runs", "outputs")
processing_dir = pathlib.Path("layering", "old_runs")

create_dir_if_not_exists(test_imgs_dir)
create_dir_if_not_exists(output_dir)
create_dir_if_not_exists(processing_dir)


def save_weights(img, palette_rgb, mixing_weights, output_prefix):
    mixing_weights = mixing_weights.reshape((img.shape[0], img.shape[1], -1)).clip(0, 1)
    # temp = (mixing_weights.reshape((img.shape[0], img.shape[1], -1, 1)) * palette_rgb.reshape((1, 1, -1, 3))).sum(
    #     axis=2)
    # img_diff = temp * 255 - img * 255
    # diff = np.square(img_diff.reshape((-1, 3))).sum(axis=-1)
    # print('max diff: ', np.sqrt(diff).max())
    # print('median diff', np.median(np.sqrt(diff)))
    # rmse = np.sqrt(diff.sum() / diff.shape[0])
    # print('RMSE: ', np.sqrt(diff.sum() / diff.shape[0]))

    # import json
    # mixing_weights_filename = os.path.join(output_prefix, "palette_size-" + str(len(palette_rgb)) + "-mixing_weights.js")
    # with open(mixing_weights_filename, 'w') as myfile:
    #     json.dump({'weights': mixing_weights.tolist()}, myfile)

    for i in range(mixing_weights[::-1].shape[-1]):
        # mixing_weights_map_filename = os.path.join(output_prefix, "palette_size-" + str(len(palette_rgb)) + "-mixing_weights-%02d.png" % i)
        mixing_weights_map_filename = os.path.join(output_prefix, "img-%02d_layer-%02d.png" % (0, i))
        alpha_weights = (mixing_weights[:, :, i] * 255).round().clip(0, 255).astype(np.uint8)
        # Image.fromarray((mixing_weights[:,:,i]*255).round().clip(0,255).astype(np.uint8)).save(mixing_weights_map_filename)

        layer_rgba = np.zeros((img.shape[0], img.shape[1], 4), dtype=np.uint8)
        layer_rgba[:, :, :3] = (palette_rgb[i] * 255).round().clip(0, 255)  # Set RGB values from palette
        print(palette_rgb[i])
        layer_rgba[:, :, 3] = alpha_weights

        Image.fromarray(layer_rgba).save(mixing_weights_map_filename)
    # return rmse


def get_bigger_palette_to_show(palette):
    ##### palette shape is M*3
    c = 50
    palette2 = np.ones((1 * c, len(palette) * c, 3))
    for i in range(len(palette)):
        palette2[:, i * c:i * c + c, :] = palette[i, :].reshape((1, 1, -1))
    return palette2


USE_OPENCL = False
try:
    # from scripts.fast_layer_decompostion_core import pyopencl_example

    if len(pyopencl_example.cl.get_platforms()) > 0:
        USE_OPENCL = True
except:
    pass
print("Using OpenCL:", USE_OPENCL)


def get_layers(filepath, palette_rgb):
    ######### for RGBXY RGB black star triangulation.
    M = len(palette_rgb)
    img = np.asfarray(Image.open(filepath).convert('RGB')) / 255.0
    X, Y = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    XY = np.dstack((X * 1.0 / img.shape[0], Y * 1.0 / img.shape[1]))
    data = np.dstack((img, XY))

    start = time.time()
    data_hull = ConvexHull(data.reshape((-1, 5)))
    start2 = time.time()
    print("convexhull on 5D time: ", start2 - start)
    mixing_weights_1 = Additive_mixing_layers_extraction.Get_ASAP_weights_using_Tan_2016_triangulation_and_then_barycentric_coordinates(
        img.reshape((-1, 3))[data_hull.vertices].reshape((-1, 1, 3)), palette_rgb, None, order=0).reshape((-1, M))

    mixing_weights_2 = Additive_mixing_layers_extraction.recover_ASAP_weights_using_scipy_delaunay(
        data_hull.points[data_hull.vertices], data_hull.points, option=3)

    if USE_OPENCL:
        w_rgbxy_values = mixing_weights_2.data
        w_rgbxy_values = w_rgbxy_values.reshape((-1, 6))
        w_rgbxy_indices = mixing_weights_2.indices.reshape((-1, 6))

        mult, _ = pyopencl_example.prepare_openCL_multiplication(mixing_weights_1, w_rgbxy_values, w_rgbxy_indices)
        final_mixing_weights = mult(mixing_weights_1)
    else:
        final_mixing_weights = mixing_weights_2.dot(mixing_weights_1)
    #
    mixing_weights = final_mixing_weights

    # mixing_weights = mixing_weights_2.dot(mixing_weights_1.reshape((-1, M)))

    end = time.time()
    print("total time: ", end - start)

    mixing_weights = mixing_weights.reshape((img.shape[0], img.shape[1], -1)).clip(0, 1)
    print("shape of mixing weights: ", mixing_weights.shape)  # (585, 480, 1)

    # output_prefix = filepath[:-4] + '-RGBXY_RGB_black_star_ASAP'
    output_prefix = os.path.join(str(filepath[:-4]), "results")
    if not os.path.exists(output_prefix):
        os.makedirs(output_prefix)

    save_weights(img, palette_rgb, mixing_weights, output_prefix)
    return output_prefix


### Create Dir
def create_dir_if_not_exists(directory_path):
    if not os.path.exists(directory_path):
        # Create the directory if it doesn't exist
        os.makedirs(directory_path)
        print(f"Directory '{directory_path}' created.")
    else:
        print(f"Directory '{directory_path}' already exists.")


from PIL import Image


def create_tile(image, tile_size):
    """
    Create tiles from the given image.

    Args:
    image (PIL.Image.Image): The input image.
    tile_size (tuple): The size of the tile (width, height).

    Returns:
    list: A list of tile images.
    """
    width, height = image.size
    tiles = []

    # Check if image size is smaller than tile size
    if width < tile_size[0] or height < tile_size[1]:
        # Return the original image as a tile
        tiles.append(image)
        return tiles

    for y in range(0, height, tile_size[1]):
        for x in range(0, width, tile_size[0]):
            box = (x, y, x + tile_size[0], y + tile_size[1])
            tiles.append(image.crop(box))
    return tiles


def merge_tiles(tile_paths, image_size):
    """
    Merge the tiles into a single image.

    Args:
    tile_paths (list): A list of file paths to the tiles.
    image_size (tuple): The size of the original image (width, height).

    Returns:
    PIL.Image.Image: The merged image.
    """
    merged_image = Image.new("RGBA", image_size)
    x_offset = 0
    y_offset = 0
    for tile_path in tile_paths:
        tile = Image.open(tile_path)
        merged_image.paste(tile, (x_offset, y_offset))
        x_offset += tile.size[0]
        if x_offset >= image_size[0]:
            x_offset = 0
            y_offset += tile.size[1]
    return merged_image


def process_tile(temp_img_path, palette_rgb):
    output_folder = get_layers(temp_img_path, palette_rgb)
    return output_folder


def generate_psd(all_layers_folder):
    # !npm install ag-psd canvas image-size

    psd_path = pathlib.Path(all_layers_folder, "output.psd")
    outputFolder = pathlib.Path(all_layers_folder)
    js_code = """
  const fs = require('fs');
  const { createCanvas, loadImage } = require('canvas');
  const { initializeCanvas, writePsd, readPsd } = require('ag-psd');
  const { promisify } = require('util');
  const sizeOf = promisify(require('image-size'));""" + f"""const psdFilePath = '{psd_path.as_posix()}';""" + f"""const outputFolder = '{outputFolder.as_posix()}';""" + """
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
  """

    # Write the JavaScript code to a file
    js_file_path = 'generate_psd.js'
    with open(js_file_path, 'w') as js_file:
        js_file.write(js_code)

    # Execute the JavaScript code using Node.js
    import subprocess

    node_command = f'node {js_file_path}'
    process = subprocess.Popen(node_command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()

    # Print the output and error messages
    print("Output:", stdout.decode())
    print("Error:", stderr.decode())
    return psd_path


def perform_layering(test_imgs_dir, img_name,layers_num = -1):
    _, file_extension = os.path.splitext(img_name.lower())
    valid_image_formats = ['.jpg', '.jpeg', '.png', '.gif', '.bmp']  # Add more if needed

    if file_extension in valid_image_formats:
        # Process the image file
        # Your existing code for handling the image file goes here
        print(f"Processing image: {img_name}")
    else:
        print(f"Ignoring non-image file: {img_name}")
        return
        # continue
    # Open the image
    img_path = os.path.join(test_imgs_dir, img_name)
    original_image = Image.open(img_path)

    tile_size = [5000, 5000]

    # print("#####################")
    # print(img_path)
    img = np.asfarray(Image.open(img_path).convert('RGB')) / 255.0
    # X, Y = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    # XY = np.dstack((X * 1.0 / img.shape[0], Y * 1.0 / img.shape[1]))
    # data = np.dstack((img, XY))
    # print(len(data.reshape((-1, 5))))

    start = time.time()
    # palette_rgb = Additive_mixing_layers_extraction.Hull_Simplification_determined_version(img, filepath[
    #                                                                                             :-4] + "-convexhull_vertices")

    if layers_num == -1:
        palette_rgb = Additive_mixing_layers_extraction.Hull_Simplification_determined_version(img, "", SAVE=False)
    else:
        palette_rgb = Additive_mixing_layers_extraction.Hull_Simplification_old(img, layers_num,
                                                                                os.path.join(test_imgs_dir,
                                                                                             img_name + "-conveshull_vertices"))
    end = time.time()
    M = len(palette_rgb)
    print("palette size: ", M)
    print("palette extraction time: ", end - start)

    # palette_img = get_bigger_palette_to_show(palette_rgb)
    # Image.fromarray((palette_img * 255).round().astype(np.uint8)).save(filepath[:-4] + "-convexhull_vertices.png")

    # Create tiles from the original image
    tiles = create_tile(original_image, tile_size)
    index = 0
    all_outputs = []

    # Number of processes to run in parallel
    # numprocesses = 2  # Adjust as needed

    # Create a pool of processes
    # pool = Pool(processes=num_processes)
    #
    # Partial function to pass additional arguments to process_tile
    # partial_process_tile = partial(process_tile, palette_rgb=palette_rgb)

    async_results = []

    for tile in tiles:
        temp_img_path = os.path.join(test_imgs_dir, f"temp_{index}.png")
        tile.convert("RGBA").save(temp_img_path)
        output_folder = get_layers(temp_img_path, palette_rgb)
        all_outputs.append(output_folder)
        # async_result = pool.apply_async(partial_process_tile, args=(temp_img_path))
        # async_results.append(async_result)
        index += 1

    # Parallel processing of tiles
    # results = pool.map(partial_process_tile, enumerate(tiles))

    # Close the pool of processes
    # pool.close()
    # pool.join()

    # Collect all outputs
    # all_outputs = results
    # all_outputs = [async_result.get() for async_result in async_results]

    merged_output = os.path.join(output_dir, img_name)
    create_dir_if_not_exists(merged_output)
    index = 0
    original_image.convert("RGBA").save(os.path.join(merged_output, f"{index}.png"))
    index += 1

    for i in range(0, len(palette_rgb)):
        layer_paths = []
        for output_folder in all_outputs:
            layer_paths.append(pathlib.Path(output_folder, "img-%02d_layer-%02d.png" % (0, i)))
        merged_image = merge_tiles(layer_paths, original_image.size)
        merged_image.save(os.path.join(merged_output, f"{index}.png"))
        index += 1

    generate_psd(merged_output)

    psd_path = generate_psd(merged_output)
    return psd_path

# if __name__ == "__main__":
#     start = time.time()
#     # perform_layering("./test", "25227-ALL-VH.jpg")
#     # perform_layering("./test", "turquoise.png")
#     perform_layering("./test", "Pizigani_1367_Chart_10MB.jpg")
#     end = time.time()
#     # 9:27
#
#     print(f"Time taken: {end - start}")
