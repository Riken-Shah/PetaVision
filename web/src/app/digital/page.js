"use client"
import React, { useState, useRef, useEffect } from 'react';
import { Button, Slider, Switch, Card, CardBody, Progress, CircularProgress, Chip, Link } from "@nextui-org/react";
import { fileUpload } from "../../../utils/upload";
import {fireTask, getCurrentTasks, getOrgUser, getStyles, createOrgUser} from "../../../utils/helpers";
import {onAuthStateChanged, signOut} from "firebase/auth";
import {auth, toggleAnalytics} from "../../../utils/firebase";
import AuthModal from "@/app/components/AuthModal";
import OrganizationModal from "@/app/components/OrganizationModal";
import InsufficientModal from "@/app/components/InsufficientModal";
import NotOnWorkspaceModal from "@/app/components/NotOnWorkspace";
import { useSearchParams } from 'next/navigation';

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

export default function LayeringComponent() {
  // console.log("org user: ", orgUser)
  const [uploadedURL, setUploadedURL] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const [activeTask, setActiveTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [orgUser, setOrgUser] = useState(null);
  const [isDisabled, setIsDisabled] = useState(false);
  const [taskImage, setTaskImage] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [user, setUser] = useState(null);
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [org, setOrg] = useState("");
  const [loadingModelOpen, setLoadingModelOpen] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    const orgFromParams = searchParams.get('org');
    if (orgFromParams) {
      setOrg(orgFromParams);
    }
  }, [searchParams]);

  useEffect(() => {
    if(user !== null) {
      fetchInitPostAuthenticated(org, setOrgUser, () => setOrgModalOpen(true))
    }
  }, [user, org]);

  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        const devUsers = ["rikenshah.02@gmail.com", "rikenshah2002@gmail.com"];
        toggleAnalytics(!devUsers.includes(user.email));
      } else {
        console.log("User is logged out");
        setUser(null);
        setOrgUser(null);
      }
    });
  }, []);

  useEffect(() => {
    let interval;
    if (cooldownTimer > 0) {
      interval = setInterval(() => {
        setCooldownTimer((prevTime) => prevTime - 1);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [cooldownTimer]);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const imageURL = await fileUpload("", file.name, file);
      setUploadedURL(imageURL);
      console.log("Uploaded image URL:", imageURL);
      // Auto-submit after successful upload
      await handleSubmit(imageURL);
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (uploadedImageURL) => {
    if (isSubmitting || cooldownTimer > 0 || !uploadedImageURL) return;

    setIsSubmitting(true);
    try {
      await fireTask("layering", orgUser.org_id, {
        count: 1,
        refImage: uploadedImageURL,
        extraParams: {
          n_layers: -1, // Always use auto layers
        }
      });
      setCooldownTimer(60 * 5); // Set cooldown to 10 seconds
    } catch (error) {
      console.error("Error submitting task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTaskRunning = activeTask && activeTask.status !== "completed";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setOrgUser(null);
      // You might want to reset other state variables here
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-900 p-4">
      <Card className="w-full max-w-md mx-auto bg-gray-800 text-white">
        <CardBody className="flex flex-col items-center gap-4">
          {user ? (
            <>
              <div className="w-full flex justify-between items-center mb-4">
                <Chip className="self-end mb-2">Credits: {orgUser?.org?.credits ?? 0}</Chip>
                <Button color="danger" size="sm" onPress={handleLogout}>
                  Logout
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                color="primary"
                onPress={() => fileInputRef.current.click()}
                disabled={isDisabled || isLoading || (cooldownTimer > 0 && isTaskRunning)}
              >
                {isLoading ? "Uploading..." : 
                 (cooldownTimer > 0 && isTaskRunning) ? `Cooldown: ${cooldownTimer}s` : "Upload Image"}
              </Button>

              <div className="w-full aspect-square relative">
                {taskImage ? (
                  <img
                    src={taskImage}
                    alt="Task image"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error("Error loading task image:", e);
                      e.target.src = "https://via.placeholder.com/400?text=Task+Image+Load+Error";
                    }}
                  />
                ) : uploadedURL ? (
                  <img
                    src={uploadedURL}
                    alt="Uploaded image"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error("Error loading image:", e);
                      e.target.src = "https://via.placeholder.com/400?text=Image+Load+Error";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white">
                    No image uploaded or task in progress
                  </div>
                )}
                {isTaskRunning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <CircularProgress aria-label="Loading..." />
                  </div>
                )}
              </div>

              {(cooldownTimer > 0 || isTaskRunning) && (
                <Progress
                  aria-label="Cooldown or Task Progress"
                  size="sm"
                  value={isTaskRunning ? activeTask.progress || 0 : 100 - (cooldownTimer / 10) * 100}
                  color={isTaskRunning ? "primary" : "warning"}
                  className="w-full"
                />
              )}

              {isTaskRunning && cooldownTimer === 0 && (
                <p className="text-small text-warning text-center">
                  Task is still processing. You can upload a new image if you'd like.
                </p>
              )}

              <p className="text-small text-gray-400 text-center">
                2 credits will be used for this operation
              </p>

              {downloadUrl && (
                <Link href={downloadUrl} isExternal>
                  <Button color="success">
                    Download PSD
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <Button color="primary" onPress={() => setOrgModalOpen(true)}>
              Login
            </Button>
          )}
        </CardBody>
      </Card>

      <AuthModal />
      <NotOnWorkspaceModal />
      <OrganizationModal 
        isOpen={orgModalOpen && !orgUser} 
        onOpenChange={setOrgModalOpen}  
        org={org}  
        setOrg={setOrg} 
        setOrgUser={setOrgUser} 
        startLoading={() => setLoadingModelOpen(true)} 
        endLoading={() => setLoadingModelOpen(false)}
      />
      <InsufficientModal isOpen={orgUser && orgUser.role === 4} />
    </div>
  );
}