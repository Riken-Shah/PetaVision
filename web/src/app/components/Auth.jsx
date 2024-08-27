import React, { useEffect, useState } from "react";
import StyledFirebaseAuth from "react-firebaseui/StyledFirebaseAuth";
import {auth} from "../../../utils/firebase"
import { GoogleAuthProvider } from "firebase/auth";


const firebaseAuthConfig = {
    signInFlow: "popup",
    // Auth providers
    // https://github.com/firebase/firebaseui-web#configure-oauth-providers
    signInOptions: [
        {
            provider: GoogleAuthProvider.PROVIDER_ID,
            customParameters: {
                // Forces account selection even when one account
                // is available.
                prompt: "select_account",
            },
        },
    ],
    signInSuccessUrl: "/ai",
    credentialHelper: "none",
    callbacks: {
        // https://github.com/firebase/firebaseui-web#signinsuccesswithauthresultauthresult-redirecturl
        signInSuccessWithAuthResult: (authResult) => {
            // remove this if you don't want to save in user's collection
            if (authResult.additionalUserInfo.isNewUser) {
                // registerUser(authResult.user.uid);
            }

            // Don't automatically redirect. We handle redirecting based on
            // auth state in withAuthComponent.js.
            // return false;
            // location.
            return "/ai"
            // return false;
        },
    },
};

const FirebaseAuth = () => {
    // Do not SSR FirebaseUI, because it is not supported.
    // https://github.com/firebase/firebaseui-web/issues/213

    const [renderAuth, setRenderAuth] = useState(false);
    useEffect(() => {
        if (typeof window !== "undefined") {
            setRenderAuth(true);
        }
    }, []);
    return (
        <div>
            { renderAuth ? (
                <StyledFirebaseAuth
                    uiConfig={{...firebaseAuthConfig, signInSuccessUrl: "/ai" + (new URL(document.location)).search}}
                    firebaseAuth={auth}
                />
            ) : null}
        </div>
    );
};

export default FirebaseAuth;
