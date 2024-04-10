import {db, auth, realtimeDB} from "./firebase";
import { collection, doc, setDoc,getDoc, query, updateDoc, getDocs, where } from "firebase/firestore";
import {  ref, set, onValue } from "firebase/database";


const rolesMap = {}
export async function getRoles() {
    const roleRef = query(collection(db, "roles"))
    const rolesSnap = await getDocs(roleRef)
    rolesSnap.forEach((doc) => {
        rolesMap[doc.id] = doc.get("type")
    })
    console.log(rolesMap)
    return rolesMap
}



export async function getOrg(orgID) {
    if(!orgID) {return  false}
    console.log("orgpath", orgID)
    const orgRef = doc(db, "orgs", orgID)
    const orgSnap = await getDoc(orgRef)

    if (orgSnap.exists()) {
        return await getOrgUser(orgID)
    }
    return false
}

export async function getOrgUser(){
    if(!auth.currentUser) {
        return  false
    }
    const docID = auth.currentUser.uid

    const orgUserRef = doc(db, "org_users", docID);
    const orgUserSnap = await getDoc(orgUserRef)

    if (orgUserSnap.exists()) {
        const orgUserData = orgUserSnap.data()
        const role = orgUserData["role"]
        const orgID = orgUserData["org_id"]
        let orgRoleData = {}
        let org = {}
        if (role !== 4) {
            const orgRoleRef = doc(db, "orgs", orgID, "roles", role.toString())
            const orgRoleSnap = await getDoc(orgRoleRef)
            orgRoleData = orgRoleSnap.data()
            const orgRef = doc(db, "orgs", orgID)
            const orgSnap = await getDoc(orgRef)
            org = orgSnap.data()
        }

        return {...orgUserData, roleData: orgRoleData, org}
    }
    return false
}

export async function createOrgUser(orgID) {
    const snap = {
        org_id: orgID.trim(),
        user_id: auth.currentUser.uid,
        role: 4,
    }
    console.log("trying to create snap", snap)
    await setDoc(doc(db, "org_users", auth.currentUser.uid), snap)
    return await getOrgUser()
}

export async function getAllOrgUsers(orgID) {
    const orgUsersQuery = query(collection(db, "org_users"), where("org_id", "==", orgID));
    const orgUsersSnapshot = await getDocs(orgUsersQuery);

    const orgUsers = [];
    console.log("orgs: ", orgUsersSnapshot.docs)
    for (const doc of orgUsersSnapshot.docs) {
        const orgUserData = doc.data();
        const userId = orgUserData.user_id;

        // Fetch user details based on user_id
        const userQuery = query(collection(db, "users"), where("uid", "==", userId));
        const userSnapshot = await getDocs(userQuery);

        if (userSnapshot.docs.length > 0) {
            const userData = userSnapshot.docs[0].data();

            // Combine org user data with user details
            const combinedData = {
                ...orgUserData,
                ...userData
            };

            orgUsers.push(combinedData);
        }
    }

    console.log(orgUsers)

    return orgUsers;
}

export async function updateUserRole(uid, updatedRole) {
    const userDoc = doc(db, "org_users", uid)
    await updateDoc(userDoc, {
        role: parseInt(updatedRole)
    })
    console.log("updated user", userDoc)
}


export async function getStyles() {
    const stylesQuery = query(collection(db, "styles"))
    const stylesSnapshot = await getDocs(stylesQuery)
    console.log(stylesSnapshot.docs.map(d => ({...d.data(), id: d.id})))
    return stylesSnapshot.docs.map(d => ({...d.data(), id: d.id}))
}

function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}


export async function fireTask(type, orgID, {count, prompt, refImage, extraParams}) {
    const task = {
        type,
        created_at: new Date().toLocaleString(),
        org_id: orgID,
        status: "queued",
    }


    const taskID = uuidv4()
    switch (type) {
        case "text2img":
            task.credits = 1 * count;
            task.prompt = prompt.trim()
            task.count = count
            task.extra_params = extraParams;
            break;
        case "img2img":
            task.credits = 2 * count;
            task.ref_image = refImage;
            task.count = count;
            task.extra_params = extraParams;break;

        case "upscale":
            task.credits = 1 * count;
            task.ref_image = refImage;
            task.count = 1;
            task.extra_params = extraParams;
            break;
        case "layering":
            task.credits = 2 * count;
            task.ref_image = refImage;
            task.count = 1;
            task.extra_params = extraParams;
            break;
        default:
            console.log("invalid type")
            return;
    }

        try {
            await setDoc(doc(db, "tasks", taskID), task)
        } catch (e) {
            console.log(e,  task)
        }

//         Also insert to realtime db
    task.firestore_id = taskID
    await set(ref(realtimeDB, `tasks/${auth.currentUser.uid}`), task)
    return taskID
}

export async function getCurrentTasks(setTask) {
    const taskRef = ref(realtimeDB, `tasks/${auth.currentUser.uid}`);
    onValue(taskRef, (snapshot) => {
        const data = snapshot.val()
        setTask(data)
    })
}