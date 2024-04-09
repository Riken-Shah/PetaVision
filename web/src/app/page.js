"use client";

import { useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {  auth, toggleAnalytics } from "../../utils/firebase";
import { SearchBar } from "./components/SearchBar";
import { ImageGrid } from "./components/ImageGrid";
import { getOrgUser, createOrgUser} from "../../utils/helpers";
import axios from "axios";
import { SettingIcon } from "@/app/components/SettingIcon";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    useDisclosure,
    Input,
    CircularProgress,
} from "@nextui-org/react";
import { useSearchParams } from "next/navigation";
import Auth from "@/app/components/Auth";
import OrganizationModal from "@/app/components/OrganizationModal";
import InsufficientModal from "@/app/components/InsufficientModal";

function isValidURL(string) {
    const res = string.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
    return res !== null;
}

function setupDefaultVisibleImages() {
    const isDesktop = window.innerWidth >= 1024;
    return isDesktop ? 20 : 6;
}


async function performSearch(inferenceAPI, search, searchPrompt, setResult, setSearchPrompt, loadingModelOnOpen, loadingModelOnClose) {
    const type = isValidURL(search) ? "image" : "text";
    const body = {
        "text": searchPrompt,
        [type === "text" ? "text" : "fileUrl"]: search,

    };
    // Avoid reseting the search prompt cuz image search can use tags to minimize the search
    // type  === "text" ? setSearchPrompt(search): setSearchPrompt("")

    const headers = {
        "Content-Type": "application/json",
    };

    try {
        loadingModelOnOpen();
        const response = await axios.post(inferenceAPI + "/search", JSON.stringify(body), { headers });

        if (response.status === 200) {
            setResult(response.data);
        } else {
            console.log("Something went wrong in search call:", response.data);
        }
    } catch (error) {
        console.log("Error in search call:", error);
    } finally {
        loadingModelOnClose();
    }
}

async function updateTags(inferenceAPI, fname, tags, loadingModelOnOpen, loadingModelOnClose) {
    const body = {
        fname,
        tags
    }
    const headers = {
        "Content-Type": "application/json",
    };


    try {
        loadingModelOnOpen();
        const response = await axios.post(inferenceAPI + "/tags", JSON.stringify(body), { headers });

        if (response.status === 200) {
        } else {
            console.log("Something went wrong in search call:", response.data);
        }
    } catch (error) {
        console.log("Error in search call:", error);
    } finally {
        loadingModelOnClose();
    }

}


async function fetchInitPostAuthenticated(orgID, setOrgUser, orgModalOnOpen) {
    const orgUserExists = await getOrgUser()
    setOrgUser(orgUserExists)
    console.log(orgUserExists)
    if(!orgUserExists) {
        // Create initial org user, if valid org id is detected
        if(orgID) {
            try {
                const orgUser = await createOrgUser(orgID)
                setOrgUser(orgUser)
                return
            } catch (e){
                console.error("something went wrong while creating org user: ", e)
            }
        }

        // Open the org setup popup
        orgModalOnOpen();
    }
}
function Home() {
    // Search
    const searchParams = useSearchParams();
    const search = searchParams.get("search");
    const orgSearchParam = searchParams.get("org")

    // For modals
    const { isOpen: settingsModalOpen, onOpen: settingsModalOnOpen, onOpenChange: settingsModalOnOpenChange } = useDisclosure();
    const { isOpen: authModelOpen, onOpen: authModelOnOpen } = useDisclosure();
    const { isOpen: loadingModelOpen, onOpen: loadingModelOnOpen, onClose: loadingModelOnClose } = useDisclosure();
    const { isOpen: orgModalOpen, onOpen:orgModelOnOpen, onClose: orgModelOnClose } = useDisclosure();

    // Global state
    const [inferenceAPI, setInferenceAPI] = useState("");
    const [imageAPI, setImageAPI] = useState("");
    const [user, setUser] = useState(null);
    const [orgUser, setOrgUser] = useState(null);
    const [nasDrive, setNasDrive] = useState("S");

    // Loader state
    const [loadingCompleted, setLoadingCompleted] = useState(0);

    // Used by SearchBar.jsx
    const [searchPrompt, setSearch] = useState("");
    const [images, setImages] = useState(null);

    // Used by ImageGrid.jsx
    const [visibleImages, setVisibleImages] = useState(10);

    // Used by OrganizationModal.jsx
    const [org,setOrg] = useState("")


    useEffect(() => {
        setOrg(orgSearchParam)
    }, [orgSearchParam])

    useEffect(() => {
        if(user !== null) {
            fetchInitPostAuthenticated(org, setOrgUser, orgModelOnOpen)
        }
    }, [user]);


    useEffect(() => {
        const interval = setInterval(() => {
            setLoadingCompleted((v) => (v >= 100 ? 0 : v + 10));
        }, 500);

        return () => clearInterval(interval);
    }, []);

    // Perform Search
    useEffect(() => {
        if (search !== null && inferenceAPI && user) {
            setVisibleImages(setupDefaultVisibleImages())
            performSearch(inferenceAPI, search, searchPrompt, setImages, setSearch, loadingModelOnOpen, loadingModelOnClose);
        }
    }, [search, inferenceAPI, user]);

    useEffect(() => {
        onAuthStateChanged(getAuth(), (user) => {
            if (user) {
                setUser(user);
                const devUsers = ["rikenshah.02@gmail.com", "rikenshah2002@gmail.com"];
                toggleAnalytics(!devUsers.includes(user.email));
            } else {
                authModelOnOpen();
                console.log("User is logged out");
            }
        });
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            const liveAPI = " https://4468-122-187-218-226.ngrok-free.app";
            // // let inferenceAPI = localStorage.getItem('inferenceAPI') || "https://wrn6yr-ip-122-187-218-226.tunnelmole.net";
            // // let imageAPI = localStorage.getItem('imageAPI') || "https://wrn6yr-ip-122-187-218-226.tunnelmole.net";
            setInferenceAPI(liveAPI);
            setImageAPI(liveAPI);
            let nasStorage = localStorage.getItem("nasDrive") || "S"
            setNasDrive(nasStorage)
        }
    }, []);

    const handleReset = () => {
        localStorage.clear();
        auth.signOut();
        location.reload();
    };


    return (
        <main className="mx-auto max-w-[1960px] p-4 relative">
            <div className="flex w-full items-center">
                <SearchBar searchPrompt={searchPrompt}  setSearchPrompt={setSearch} user={user} imageAPI={imageAPI} loadingModalOnOpen={loadingModelOnOpen}  search={search}/>
                <Button className="m-2 mb-6" isIconOnly color="warning" variant="faded" aria-label="Take a photo" onPress={settingsModalOnOpen}>
                    <SettingIcon />
                </Button>
            </div>

            <ImageGrid user={user} search={search} nasDrive={nasDrive}  loadingModalOnOpen={loadingModelOnOpen} visibleImages={visibleImages} setVisibleImages={setVisibleImages} images={images} imageAPI={imageAPI} updateTags={(photo_url, tags) => updateTags(inferenceAPI, photo_url, tags, loadingModelOnOpen, loadingModelOnClose)} />

            {/* Auth Modal */}
            <Modal isOpen={authModelOpen} onOpenChange={authModelOnOpen} backdrop={"blur"}>
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">Login to continue</ModalHeader>
                            <ModalBody>
                                <div className="bg-white p-10 rounded-lg block">
                                    <span className="text-black text-2l">Please Sign In to Continue</span>
                                    <Auth />
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="danger" variant="light" onPress={onClose}>
                                    Close
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Settings Modal */}
            <Modal isOpen={settingsModalOpen} onOpenChange={settingsModalOnOpen}  backdrop="blur">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">Settings</ModalHeader>
                            <ModalBody>
                                <Input
                                    isRequired
                                    type="text"
                                    label="Backend API"
                                    value={inferenceAPI}
                                    onChange={(e) => {
                                        setInferenceAPI(e.target.value);
                                        localStorage.setItem("inferenceAPI", e.target.value);
                                    }}
                                />
                                <Input
                                    isRequired
                                    type="text"
                                    label="Image API"
                                    value={imageAPI}
                                    onChange={(e) => {
                                        setImageAPI(e.target.value);
                                        localStorage.setItem("imageAPI", e.target.value);
                                    }}
                                />
                                <Input
                                    isRequired
                                    type="text"
                                    label="User ID"
                                    value={user?.uid || ""}
                                    disabled
                                />
                                <Input
                                    isRequired
                                    type="text"
                                    label="NAS Drive"
                                    value={nasDrive}
                                    onChange={(e) => {
                                        setNasDrive(e.target.value)
                                        localStorage.setItem("nasDrive", e.target.value);

                                    }}
                                />
                                <Button color="danger" onPress={handleReset}>
                                    Reset Everything
                                </Button>
                                <Button color="warning" onPress={auth.signOut}>
                                    Logout
                                </Button>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="danger" variant="light" onPress={onClose}>
                                    Close
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* Loading Modal */}
            <Modal isOpen={loadingModelOpen} onOpenChange={loadingModelOnOpen} backdrop={"blur"} placement={"center"}>
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalBody>
                                <CircularProgress aria-label="Loading..." size="lg" value={loadingCompleted} color="warning" showValueLabel={true} />
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>

            <OrganizationModal isOpen={orgModalOpen && !orgUser} onOpenChange={orgModelOnOpen}  org={org}  setOrg={setOrg} setOrgUser={setOrgUser} startLoading={loadingModelOnOpen} endLoading={loadingModelOnClose}/>
            <InsufficientModal isOpen={orgUser && orgUser.role === 4} />
        </main>
    );
}

export default Home;
