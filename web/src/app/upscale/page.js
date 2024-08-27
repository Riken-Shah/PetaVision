"use client"
import React, { useState, useRef, useEffect } from 'react';
import { Button, Slider, Card, CardBody, Progress, CircularProgress, Chip, Link } from "@nextui-org/react";
import { fileUpload } from "../../../utils/upload";
import { fireTask, getCurrentTasks, getOrgUser, createOrgUser } from "../../../utils/helpers";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, toggleAnalytics } from "../../../utils/firebase";
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
    if(orgID) {
      try {
        const orgUser = await createOrgUser(orgID)
        setOrgUser(orgUser)
        return
      } catch (e){
        console.error("something went wrong while creating org user: ", e)
      }
    }
    orgModalOnOpen();
  }
}

export default function UpscaleComponent() {
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
  const [scaleFactor, setScaleFactor] = useState(2);
  const [creativity, setCreativity] = useState(0.35);
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskStatus, setTaskStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCooldownActive, setIsCooldownActive] = useState(false);

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
      setIsCooldownActive(true);
      interval = setInterval(() => {
        setCooldownTimer((prevTime) => {
          if (prevTime <= 1) {
            setIsCooldownActive(false);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [cooldownTimer]);

  const isTaskRunning = activeTask && activeTask.status !== "completed";

  useEffect(() => {
    let interval;
    if (orgUser && (isTaskRunning || cooldownTimer > 0 || isProcessing)) {
      interval = setInterval(() => {
        checkExistingTask();
      }, 5000); // Check every 5 seconds
    }
    return () => clearInterval(interval);
  }, [orgUser, isTaskRunning, cooldownTimer, isProcessing]);

  const checkExistingTask = async () => {
    try {
      console.log("Checking for existing tasks...");
      getCurrentTasks((task) => {
        if (task.type === "upscale") {
          console.log("Found upscale task:", task);
          setActiveTask(task);
          setTaskStatus(task.status || 'unknown');
          setTaskImage(task.ref_image);

          if (task.status === 'completed' && task.results && task.results.length > 0) {
            setDownloadUrl(task.results[0]); // Use the first result URL
            setIsProcessing(false);
            setIsCooldownActive(false);
          } else if (task.status === 'failed') {
            setIsProcessing(false);
            setIsCooldownActive(false);
          } else {
            setIsProcessing(true);
          }

          if (task.progress !== undefined) {
            setTaskProgress(task.progress);
          }
        }
      });
    } catch (error) {
      console.error("Error fetching existing task:", error);
      setIsProcessing(false);
      setIsCooldownActive(false);
    }
  };

  useEffect(() => {
    if (orgUser) {
      console.log("OrgUser changed, checking for existing tasks");
      checkExistingTask();
    }
  }, [orgUser]);

  useEffect(() => {
    if (user && orgUser) {
      checkExistingTask();
    }
  }, [user, orgUser]);

  const getComponentState = () => {
    if (isLoading) return 'uploading';
    if (isProcessing) return 'processing';
    if (isCooldownActive) return 'cooldown';
    return 'ready';
  };

  const componentState = getComponentState();

  const isUploadDisabled = componentState !== 'ready';
  const isSubmitDisabled = componentState !== 'ready' || !uploadedURL;

  const getButtonText = (action) => {
    if (action === 'upload') {
      if (componentState !== 'ready') {
        return "Processing...";
      }
      return taskImage ? "Change Image" : "Upload Image";
    }
    if (action === 'submit' && cooldownTimer > 0) {
      return `Cooldown: ${cooldownTimer}s`;
    }
    return "Submit";
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const imageURL = await fileUpload("", file.name, file);
      setUploadedURL(imageURL);
      setTaskImage(imageURL);  // Update the displayed image
      setIsProcessing(false);  // Stop showing processing UI
      setActiveTask(null);     // Clear the active task
      setDownloadUrl(null);    // Clear any previous download URL
      setTaskStatus(null);     // Clear the task status
      setTaskProgress(0);      // Reset task progress
      console.log("Uploaded image URL:", imageURL);
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || isProcessing || !uploadedURL) return;

    setIsSubmitting(true);
    setTaskProgress(0);
    setIsProcessing(true);
    setIsCooldownActive(true);
    try {
      await fireTask("upscale", orgUser.org_id, {
        count: 1,
        refImage: uploadedURL,
        extraParams: {
          scale_factor: scaleFactor,
          creativity: creativity
        }
      });
      setCooldownTimer(60);
    } catch (error) {
      console.error("Error submitting task:", error);
      setIsCooldownActive(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setOrgUser(null);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
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
                disabled={isUploadDisabled}
              >
                {getButtonText('upload')}
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
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white">
                    No image uploaded
                  </div>
                )}
                {isTaskRunning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <CircularProgress aria-label="Loading..." />
                  </div>
                )}
              </div>

              <div className="w-full mb-4">
                <label className="w-full flex flex-col gap-2 p-2">
                  Scale Factor: {scaleFactor}x
                </label>
                <Slider 
                  aria-label="Scale Factor"
                  color="foreground"
                  step={0.5}
                  maxValue={4}
                  minValue={1}
                  value={scaleFactor}
                  onChange={setScaleFactor}
                  className="max-w-md"
                />
              </div>
              <div className="w-full mb-4">
                <label className="w-full flex flex-col gap-2 p-2">
                  Creativity: {creativity} - 0.35 is the default value
                </label>
                <Slider 
                  aria-label="Creativity"
                  color="foreground"
                  step={0.05}
                  maxValue={1}
                  minValue={0}
                  value={creativity}
                  onChange={setCreativity}
                  className="max-w-md"
                />
              </div>

              {isProcessing && (
                <Progress
                  aria-label="Processing Progress"
                  size="sm"
                  value={taskProgress}
                  color="primary"
                  className="w-full mb-2"
                />
              )}

              {isProcessing && (
                <p className="text-small text-center">
                  Processing: {taskProgress}%
                </p>
              )}

              <p className="text-small text-gray-400 text-center">
                1 credit will be used for this operation
              </p>

              <Button 
                color="warning" 
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {getButtonText('submit')}
              </Button>

              {downloadUrl && (
                <div className="w-full mb-4">
                  <img
                    src={downloadUrl}
                    alt="Upscaled image"
                    className="w-full h-auto object-contain cursor-pointer"
                    onClick={handleDownload}
                  />
                  <p className="text-small text-center mt-2">Click the image to open in a new tab</p>
                </div>
              )}

              {taskStatus && (
                <p className="text-small text-center">
                  Task Status: {taskStatus.charAt(0).toUpperCase() + taskStatus.slice(1)}
                </p>
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