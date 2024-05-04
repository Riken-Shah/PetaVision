import {Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader} from "@nextui-org/react";
import {createOrgUser, getOrg} from "../../../utils/helpers";


export default function OrganizationModal({isOpen, onOpenChange, org, setOrg, setOrgUser, startLoading, endLoading}) {
    const syncWithOrg = async (org) => {
startLoading()
        try {
            const orgResp = await createOrgUser(org)
            if (orgResp) {
                setOrgUser(orgResp)
            }
        } catch (e){
            console.error("failed to create org user: ", e)
        } finally {
            endLoading()
        }
    }

return         (      <Modal isOpen={isOpen}   onOpenChange={onOpenChange}  backdrop="blur">
    <ModalContent className="text-white">
        {(onClose) => (
            <>
                <ModalHeader className="flex flex-col gap-1">Org setup</ModalHeader>
                <ModalBody>
                    <Input
                        isRequired
                        type="text"
                        label="Org"
                        value={org ?? ""}
                        onChange={(e) => {
                            setOrg(e.target.value);
                        }}
                    />
                    <Button color="danger" onPress={() => syncWithOrg(org)}>
                        Done
                    </Button>
                </ModalBody>
            </>
        )}
    </ModalContent>
</Modal>)

}