import {Button, Image} from "@nextui-org/react";
import {useEffect, useState} from "react";

export default function Images({ task }) {
    const [text, setText] = useState("Searching for")

    useEffect(() => {
        switch (task.type) {
        case "text2img":
        case "img2img":
            setText("Searching for")
            break
        case "upscale":
            setText("Upscaling for")
            break
        case "layering":
            setText("Layering for")
            break
    }

    }, []);



    return (
        <div className="m-5">
            <div className="block">
                <div className="flex w-full justify-between align-middle">
        <span className="align-middle flex self-center mb-2">
          {text}
        </span>
                    <Button color="red" className="capitalize my-2 flex" isLoading={task.status !== "completed"}>
                        {task.status}
                    </Button>
                </div>
                {task.ref_image ? (
                    <Image src={task.ref_image} loading="eager" width={400} height={400}/>
                ) : (
                    <span className="text-gray-500">
            "{task.prompt}"
          </span>
                )}


            </div>

            <div className="columns-2 gap-4 sm:columns-3 xl:columns-4 2xl:columns-5 mt-5 border">
                <br/>
                {Array.from({length: task.count}).map((_, i) => {
                    const resultSrc = task && task.results && task.results.length > 0 ? task.results[i] : "";
                    return (
                        <div className="pb-4 group relative group">
                            <a href={resultSrc} download>
                                <Image
                                    key={i}
                                    alt="Woman listening to music"
                                    className="object-cover"
                                    height={400}
                                    src={task.type === "layering" ? task.ref_image : resultSrc}
                                    isLoading={!resultSrc}
                                    width={400}
                                    loading="eager"
                                />
                                <div
                                    className="absolute inset-0 bg-black opacity-0 group-hover:opacity-50 transition-opacity flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none"
                                         viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                              d="M15 19l-7-7 7-7"/>
                                    </svg>
                                </div>
                            </a>
                        </div>

                    );
                })}
            </div>
            <span className="text-yellow-300 text-2xl">[Click on Image to download]</span>
        </div>
    );
}
