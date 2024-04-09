import React, {useState} from "react";
import {Select, SelectItem, Avatar} from "@nextui-org/react";

export default function App({styles, setExtraParams}) {


    return (
        <Select
            items={styles}
            label="Style"
            className="max-w-xs"
            variant="bordered"
            onChange={(e) => setExtraParams((prevProps) => ({...prevProps, style: e.target.value}))}
            classNames={{
                label: "group-data-[filled=true]:-translate-y-5",
                trigger: "min-h-unit-16",
                listboxWrapper: "max-h-[400px]",
            }}
            listboxProps={{
                itemClasses: {
                    base: [
                        "rounded-md",
                        "text-default-500",
                        "transition-opacity",
                        "data-[hover=true]:text-foreground",
                        "data-[hover=true]:bg-default-100",
                        "dark:data-[hover=true]:bg-default-50",
                        "data-[selectable=true]:focus:bg-default-50",
                        "data-[pressed=true]:opacity-70",
                        "data-[focus-visible=true]:ring-default-500",
                    ],
                },
            }}
            popoverProps={{
                classNames: {
                    base: "before:bg-default-200",
                    content: "p-0 border-small border-divider bg-background",
                },
            }}
            renderValue={(items) => {
                return items.map((item) => (

                    <div key={item.data.id} className="flex items-center gap-2">

                        <Avatar
                            alt={item.data.id}
                            className="flex-shrink-0"
                            size="sm"
                            src={item.data.img}
                        />
                        <div className="flex flex-col">
                            <span>{item.data.id}</span>
                        </div>
                    </div>
                ));
            }}
        >
            {(user) => (
                <SelectItem key={user.id} textValue={user.id}>
                    <div className="flex gap-2 items-center">
                        <Avatar alt={user.id} className="flex-shrink-0" size="sm" src={user.img} />
                        <div className="flex flex-col">
                            <span className="text-small">{user.id}</span>
                        </div>
                    </div>
                </SelectItem>
            )}
        </Select>
    );
}
