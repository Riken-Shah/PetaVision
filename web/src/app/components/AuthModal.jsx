import {Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure} from "@nextui-org/react";
import Auth from "@/app/components/Auth";
import {getAuth, onAuthStateChanged} from "firebase/auth";
import {useEffect} from "react";

const AuthModal= function () {
    const { isOpen: authModelOpen, onOpen: authModelOnOpen } = useDisclosure();

        useEffect(() => {
        onAuthStateChanged(getAuth(), (user) => {
            console.log("user: ", user)
            if (user) {

            } else {
                console.log("open auth model")
                authModelOnOpen();
                console.log("User is logged out");
            }
        });
    }, []);

    return(
            <Modal isOpen={authModelOpen} onOpenChange={authModelOnOpen} backdrop={"blur"}>
                <ModalContent className="text-white">
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
            </Modal>)

}

export default AuthModal