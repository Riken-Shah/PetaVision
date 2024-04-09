"use client"
import {Button, Slider} from "@nextui-org/react";
import {useEffect, useRef, useState} from "react";
import {fileUpload} from "../../../../utils/upload";
import {fireTask} from "../../../../utils/helpers"
import {getDominantColors, hexToRgb, rgbToHex} from "color-supreme";
import { getImageFromUrl } from "pixel-paradise";
import {hexHash} from "next/dist/shared/lib/hash";


function drawImageOnCanvas(base64String, canvasRef) {
    // Create an Image object
    const img = new Image();

    // When the image is loaded, draw it onto the canvas
    img.onload = function() {
        // Get canvas reference
        const canvas = canvasRef.current

        // Set canvas size to match the image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the image onto the canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
    };

    // Set the source of the Image object to the Base64 string
    img.src = base64String;
}



export default function Img2Img({orgUser,startLoading, endLoading, isDisabled}) {
    const fileRef = useRef();
    const canvasRef = useRef();
    const [uploadedURL, setUploadedURL] = useState();
    const [dominantColors, setDominantColors] = useState([]);


    const handleOnImageInputChange = async (e) => {
        const blob = e.target.files[0];
        startLoading();
        console.log("uploading image")
        const imageURL = await fileUpload("", blob.name, blob)
        setUploadedURL(uploadedURL)
        console.log(imageURL)

        // Step 1: Create a FileReader object
        const reader = new FileReader();

        // Step 2: Define what to do when the file is loaded
        reader.onload = async function(event) {
            // 'event.target.result' contains the Base64 string representing the Blob
            const base64String = event.target.result;
            drawImageOnCanvas(base64String, canvasRef);
            const colors = getDominantColors(await getImageFromUrl(base64String), 7)
            setDominantColors(colors.hex)
            console.log(colors)
            endLoading();

        };

        // Step 3: Read the Blob as a Base64 string
        reader.readAsDataURL(blob);


    };

    const submitTask = function () {
        fireTask("layering", orgUser.org_id, {
            count: 1, refImage: imageURL,
        });
    }

    useEffect(() => {
        if (canvasRef.current) {
            canvasRef.current.addEventListener('click', function (event) {
                const ctx = canvasRef.current.getContext('2d');


                // Get coordinates of the click relative to the canvas
                const x = event.offsetX;
                const y = event.offsetY;

                // Get the color data of the pixel at the clicked position
                const pixelData = ctx.getImageData(x, y, 1, 1).data;

                // Extract the RGB components from the pixel data
                const red = pixelData[0];
                const green = pixelData[1];
                const blue = pixelData[2];

                const hex =rgbToHex({red, blue, green})

                // Display the color information
                console.log('Clicked color (RGB):', red, green, blue);
                setDominantColors((prevState) => {
                        const newDominantColors = [...prevState]
                        if (newDominantColors.length < 7) {
                            newDominantColors.push(`#${hex.red}${hex.green}${hex.blue}`)
                        }
                            return newDominantColors

                })

            });
        }

    }, [])
return (
    <div className="flex flex-col items-center">
        <div>
            <input
                ref={fileRef}
                className="p-4 border border-gray-300 rounded-md shadow-md mb-4"
                type="file"
                accept="image/*"
                disabled={isDisabled}
                onChange={handleOnImageInputChange}
            />
        </div>
        <span className="flex my-2">2 credits will be used</span>

        <canvas ref={canvasRef}/>

        {dominantColors.length ? <div className="flex w-full">
        {dominantColors.map((dominantColor, index) =>
            <div style={{backgroundColor: dominantColor}} className="flex w-10 h-10" onClick={() => {
                    setDominantColors((prevState) => {
                    const newDominantColor = [...prevState]
                    newDominantColor.splice(index, 1)
                    return newDominantColor
                })
            }}>
        </div>)}
            {dominantColors.length < 7 && <div className="flex w-10 h-10 text-white text-2xl" onClick={() => {

            }}>+</div>}

        </div>: <></>}

        <Button className="flex w-20" isIconOnly color="warning" variant="faded" aria-label="Take a photo" onPress={submitTask}>Submit</Button>
    </div>
)
}