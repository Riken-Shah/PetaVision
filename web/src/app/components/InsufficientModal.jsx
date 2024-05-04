import {Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader} from "@nextui-org/react";
import {createOrgUser, getOrg} from "../../../utils/helpers";


export default function InsufficientModal({isOpen}) {

return         (      <Modal isOpen={isOpen}  backdrop="blur">
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