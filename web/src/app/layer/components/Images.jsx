import {Button, Image} from "@nextui-org/react";

export default function Images({ task }) {
    return (
        <div className="m-5">
            <div className="block">
                <div className="flex w-full justify-between align-middle">
        <span className="align-middle flex self-center mb-2">
          {task.type === "img2img" || task.type === "text2img"
              ? "Searching for"
              : "Upscaling for"}


        </span>
                    <Button color="red" className="capitalize my-2 flex" isLoading={task.status !== "completed"}>
                        {task.status}
                    </Button>
                </div>
                {task.ref_image ? (
                    <Image src={task.ref_image} loading="eager" width={400} height={400} />
                ) : (
                    <span className="text-gray-500">
            "{task.prompt}"
          </span>
                )}


            </div>

            <div className="columns-2 gap-4 sm:columns-3 xl:columns-4 2xl:columns-5 mt-5">
                {Array.from({ length: task.count }).map((_, i) => {
                    const resultSrc = task && task.results && task.results.length > 0? task.results[i] :"";
                    return (
                        <div className="pb-4">
                            <Image
                                key={i}
                                alt="Woman listening to music"
                                className="object-cover"
                                height={400}
                                src={resultSrc}
                                isLoading={!resultSrc}
                                width={400}
                                loading="eager"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
