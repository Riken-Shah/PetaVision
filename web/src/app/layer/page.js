"use client"
import React, {useEffect, useRef, useState} from "react";
import {
    Tabs,
    Tab,
    Slider,
    Input,
    Button,
    Modal,
    ModalContent,
    ModalBody,
    CircularProgress,
    useDisclosure, Chip, ModalHeader
} from "@nextui-org/react";
import {GalleryIcon} from "./GalleryIcon";
import {MusicIcon} from "./MusicIcon";
import { getCurrentTasks, getOrgUser, getRoles, getStyles} from "../../../utils/helpers";
import Img2Img from "@/app/layer/components/Img2Img";
import { onAuthStateChanged} from "firebase/auth";
import {auth, toggleAnalytics} from "../../../utils/firebase";
import Images from "@/app/gen/components/Images";
import Text2Img from "@/app/gen/components/Text2Img";
import Upscale from "@/app/gen/components/Upscale";


export default function App() {
    const [styles, setStyles] = useState([]);
    const [orgUser, setOrgUser] = useState(null);
    const [count, setCount] = useState(1);
    const [extraParams, setExtraParams] = useState({});
    const { isOpen: loadingModelOpen, onOpen: loadingModelOnOpen, onClose: loadingModelOnClose } = useDisclosure();
    const [activeTask, setTask] = useState(null);
    const [isDisabled, setIsDisabled] = useState(false);
    const [selectedKey, setSelectedKey] = useState("img2img")

    const handleSearch = () => {
        setTask({
            type: "text2img",
            count,
            extraParams,
            prompt,
        })
    };


    useEffect(() => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                const devUsers = ["rikenshah.02@gmail.com", "rikenshah2002@gmail.com"];
                // toggleAnalytics(!devUsers.includes(user.email))

                (async function () {
                    const styles = await getStyles();
                    const orgUsers = await getOrgUser();
                    setOrgUser(orgUsers)
                    setStyles(styles)
                    getCurrentTasks(setTask)
                })(

                )

            } else {
                // authModelOnOpen();
                console.log("User is logged out");
            }
        });
    }, []);

    useEffect(() => {
        if(activeTask && activeTask.type) {
                    setSelectedKey(activeTask.type)
        }
        // setIsDisabled(!(activeTask && (activeTask.status === "completed" || activeTask.status === "failed") && orgUser.org.credits > 0))
          getOrgUser().then((orgUsers) => setOrgUser(orgUsers))
    }, [activeTask])

    useEffect(() => {
        if(!orgUser?.org?.credits) {
            // setIsDisabled(true)
        }
    }, [orgUser?.org?.credits]);

    const fileRef = useRef()
    return (
        <div className="flex w-full flex-col m-4">
            {/* Add orgs credits here */}
            <Chip className="absolute top-2 right-2">Credits: {orgUser?.org?.credits ?? 0}</Chip>

                <div
                    key="img2img"
                    title={
                        <div className="flex items-center space-x-2">
                            <GalleryIcon/>
                            <span>Img2Img</span>
                        </div>
                    }
                >
                    <Img2Img isDisabled={isDisabled} orgUser={orgUser} startLoading={loadingModelOnOpen} endLoading={loadingModelOnClose}/>
                </div>



            {/* Loading Modal */}
            <Modal isOpen={loadingModelOpen} onOpenChange={loadingModelOnOpen} backdrop={"blur"} placement={"center"}>
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalBody>
                                <CircularProgress aria-label="Loading..." size="lg" value={100} color="warning" showValueLabel={true} />
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Insufficient Credits */}
            <Modal isOpen={orgUser?.org?.credits <= 0}  backdrop={"blur"} placement={"center"}>
                <ModalContent>
                    {(onClose) => (
                        <><ModalHeader>
                            Insufficient Creditsa
                        </ModalHeader>
                            <ModalBody className="flex justify-center">
                                <p className="pb-2">
                                    Please contact your admin to refill your credits.
                                </p>
                                <Button color="danger" onPress={() => location.reload()}> Reload</Button>
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}
