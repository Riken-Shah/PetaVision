"use client"
import {Slider, Button} from "@nextui-org/react";
import {useRef, useState} from "react";
import {fileUpload} from "../../../../utils/upload";
import {fireTask} from "../../../../utils/helpers"

export default function Upscale({orgUser,startLoading, endLoading, isDisabled}) {
    const fileRef = useRef();
    const [scaleFactor, setScaleFactor] = useState(2);
    const [uploadedURL, setUploadedURL] = useState();
    const [creativity, setCreativity] = useState(0.35);

    const handleOnImageInputChange = async (e) => {
        const blob = e.target.files[0];
        startLoading();
        const imageURL = await fileUpload("", blob.name, blob)
        setUploadedURL(imageURL)
        console.log(imageURL)

        // await fireTask("upscale", orgUser.org_id, {
        //     count: 1, refImage: imageURL, extraParams: {
        //       scale_factor: scaleFactor,
        //       creativity: creativity
        //     }
        // });
        endLoading();
    };

    const submitTask = async function () {
        console.log("submitting task")
        // const dominatColorsInRGB = dominantColors.map((x) => hexToRgb(x))
        await fireTask("upscale", orgUser.org_id, {
            count: 1, refImage: uploadedURL, extraParams: {
                    scale_factor: scaleFactor,
                    creativity: creativity
                }
        }
        );

        // set60secsTimer()
    }

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
        <span className="flex my-2">{1} credits will be used</span>
        <div className="w-full mb-4">
            <label className="w-full flex flex-col gap-2 p-10">
                Scale Factor: {scaleFactor}x
            </label>
            <Slider 
                aria-label="Scale Factor"
                color="foreground"
                step={0.5}
                showSteps={true}
                maxValue={4}
                minValue={1}
                value={scaleFactor}
                onChange={setScaleFactor}
                className="max-w-md"
            />
        </div>
        <div className="w-full mb-4">
            <label className="w-full flex flex-col gap-2 p-10">
                Creativity: {creativity} - 0.35 is the default value
            </label>
            <Slider 
                aria-label="Creativity"
                color="foreground"
                step={0.05}
                showSteps={true}
                maxValue={2}
                minValue={0}
                value={creativity}
                onChange={setCreativity}
                className="max-w-md"
        />
            </div>

            <Button className={`flex w-20`} isIconOnly color="warning" variant="faded" aria-label="Take a photo" 
                onPress={submitTask}>Submit</Button>

    </div>
)
}
