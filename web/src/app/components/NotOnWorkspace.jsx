import {
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    useDisclosure
} from "@nextui-org/react";
import {useEffect} from "react";

async function getClientIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const ipAddress = data.ip;
    console.log('Client IP Address:', ipAddress);
    return ipAddress
  } catch (error) {
    console.error('Error fetching IP address:', error);
  }
  return ""
}


export default function NotOnWorkspaceModal() {

        const { isOpen: authModelOpen, onOpen: modelOnOpen, onClose } = useDisclosure();


        useEffect(() => {
            modelOnOpen();
 getClientIP().then((ipAddress) => {
     // TODO: Move this to ORG model
     if (["122.187.218.226", "49.36.81.95", "27.56.180.95", "103.240.79.198"].includes(ipAddress)) {
         console.log(ipAddress)
         onClose();
     }

 })

    }, []);


return         (      <Modal isOpen={authModelOpen}  backdrop="blur">
    <ModalContent className="text-white">
        {(onClose) => (
            <>
                <ModalHeader className="flex flex-col gap-1">Insufficient Permission</ModalHeader>
                <ModalBody>
            <p>
                Please ask your master (or admin) to upgrade your privileges
            </p>
                    <Button color="danger" onPress={() => location.reload()}>
                        Reload
                    </Button>
                </ModalBody>
            </>
        )}
    </ModalContent>
</Modal>)

}