"use client"
import React, { useState, useRef, useEffect } from 'react';
import { Button, Slider, Card, CardBody, Progress, CircularProgress, Chip, Link, Tabs, Tab } from "@nextui-org/react";
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

export default function AIComponent() {
  const [uploadedURL, setUploadedURL] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const [activeTask, setActiveTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [orgUser, setOrgUser] = useState(null);
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
  const [activeTab, setActiveTab] = useState("layering");
  const [isQueuedAfterCooldown, setIsQueuedAfterCooldown] = useState(false);

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
            if (isProcessing) {
              setIsQueuedAfterCooldown(true);
            }
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [cooldownTimer, isProcessing]);

  useEffect(() => {
    if (!isProcessing) {
      setIsQueuedAfterCooldown(false);
    }
  }, [isProcessing]);

  useEffect(() => {
    let interval;
    if (orgUser && (isProcessing || cooldownTimer > 0)) {
      interval = setInterval(() => {
        checkExistingTask();
      }, 5000); // Check every 5 seconds
    }
    return () => clearInterval(interval);
  }, [orgUser, isProcessing, cooldownTimer]);

  useEffect(() => {
    if (user && orgUser) {
      checkExistingTask();
    }
  }, [user, orgUser, activeTab]);

  const checkExistingTask = async () => {
    try {
      console.log("Checking for existing tasks...");
      getCurrentTasks((task) => {
        if (task && orgUser && task.org_id === orgUser.org_id) {
          console.log(`Found task:`, task);
          
          setActiveTask(task);
          setTaskStatus(task.status || 'unknown');
          setTaskImage(task.ref_image);

          if (task.status === 'completed' && task.results && task.results.length > 0) {
            setDownloadUrl(task.results[0]);
            setIsProcessing(false);
            setIsCooldownActive(false);
            setCooldownTimer(0); // Reset cooldown timer when task is completed
          } else if (task.status === 'failed') {
            setIsProcessing(false);
            setIsCooldownActive(false);
            setCooldownTimer(0); // Reset cooldown timer when task fails
          } else if (task.status === 'processing') {
            setIsProcessing(true);
          }

          if (task.progress !== undefined) {
            setTaskProgress(task.progress);
          }
        } else {
          setActiveTask(null);
          setTaskStatus(null);
          setTaskImage(null);
          setDownloadUrl(null);
          setIsProcessing(false);
          setIsCooldownActive(false);
          setTaskProgress(0);
        }
      });
    } catch (error) {
      console.error("Error fetching existing task:", error);
      setIsProcessing(false);
      setIsCooldownActive(false);
    }
  };

  const getComponentState = () => {
    if (isLoading) return 'uploading';
    if (isProcessing) return 'processing';
    if (isCooldownActive) return 'cooldown';
    return 'ready';
  };

  const componentState = getComponentState();

  const isUploadDisabled = componentState === 'processing' || componentState === 'uploading';
  const isSubmitDisabled = componentState !== 'ready' || !uploadedURL;

  const getButtonText = (action) => {
    if (action === 'upload') {
      if (componentState === 'processing') {
        return "Processing...";
      }
      if (componentState === 'uploading') {
        return "Uploading...";
      }
      return taskImage ? "Change Image" : "Upload Image";
    }
    if (action === 'submit') {
      if (cooldownTimer > 0) {
        return `Cooldown: ${cooldownTimer}s`;
      }
      if (isProcessing) {
        return "Processing...";
      }
    }
    return "Submit";
  };

  const handleImageUpload = async (event) => {
    if (isUploadDisabled) return;

    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const imageURL = await fileUpload("", file.name, file);
      setUploadedURL(imageURL);
      setTaskImage(imageURL);
      setIsProcessing(false);
      setActiveTask(null);
      setDownloadUrl(null);
      setTaskStatus(null);
      setTaskProgress(0);
      setCooldownTimer(0);
      setIsCooldownActive(false);

      console.log("Uploaded image URL:", imageURL);
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;

    setIsSubmitting(true);
    setTaskProgress(0);
    setIsProcessing(true);
    setIsCooldownActive(true);
    try {
      if (activeTab === "layering") {
        await fireTask("layering", orgUser.org_id, {
          count: 1,
          refImage: uploadedURL,
          extraParams: {
            n_layers: -1,
          }
        });
      } else {
        await fireTask("upscale", orgUser.org_id, {
          count: 1,
          refImage: uploadedURL,
          extraParams: {
            scale_factor: scaleFactor,
            creativity: creativity
          }
        });
      }
      setCooldownTimer(60 * 5); // Set cooldown to 5 minutes
    } catch (error) {
      console.error("Error submitting task:", error);
      setIsCooldownActive(false);
      setIsProcessing(false);
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

  const handleTabChange = (key) => {
    if (!isProcessing) {
      setActiveTab(key);
      if (activeTask && activeTask.type !== key) {
        setTaskProgress(0);
        setDownloadUrl(null);
      }
    }
  };

  const tabStyles = {
    base: "flex-1 py-2 px-4 text-center focus:outline-none transition-colors",
    selected: "bg-blue-500 text-white",
    disabled: "opacity-50 cursor-not-allowed",
  };

  const renderTaskImage = () => {
    let imageToShow = uploadedURL;
    
    if (activeTask) {
      if (activeTask.type === activeTab) {
        imageToShow = activeTask.ref_image || uploadedURL;
      } else {
        // If there's an active task but it's not for the current tab, don't show an image
        imageToShow = null;
      }
    }

    return (
      <div className="w-full aspect-square relative">
        {imageToShow ? (
          <img
            src={imageToShow}
            alt="Task image"
            className="w-full h-full object-contain"
            onError={(e) => {
              console.error("Error loading task image:", e);
              e.target.src = "https://via.placeholder.com/400?text=Task+Image+Load+Error";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white">
            {activeTask ? "Switch tabs to view the active task image" : "No image uploaded"}
          </div>
        )}
        {isProcessing && activeTask?.type === activeTab && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <CircularProgress aria-label="Loading..." />
          </div>
        )}
      </div>
    );
  };

  const renderResult = () => {
    if (!downloadUrl || !activeTask || activeTask.type !== activeTab) return null;

    if (activeTab === 'layering') {
      return (
        <Button 
          color="primary" 
          onPress={handleDownload}
          className="mt-4"
        >
          Download PSD
        </Button>
      );
    } else if (activeTab === 'upscale') {
      return (
        <div className="w-full mt-4">
          <img
            src={downloadUrl}
            alt="Result image"
            className="w-full h-auto object-contain cursor-pointer"
            onClick={handleDownload}
          />
          <p className="text-small text-center mt-2">Click the image to open in a new tab</p>
        </div>
      );
    }

    return null;
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

              <div className="w-full flex mb-4">
                <button
                  className={`${tabStyles.base} ${activeTab === 'layering' ? tabStyles.selected : ''} ${isProcessing ? tabStyles.disabled : ''}`}
                  onClick={() => handleTabChange('layering')}
                  disabled={isProcessing}
                >
                  Layering
                  {activeTask?.type === 'layering' && <span className="ml-2">🖼️</span>}
                </button>
                <button
                  className={`${tabStyles.base} ${activeTab === 'upscale' ? tabStyles.selected : ''} ${isProcessing ? tabStyles.disabled : ''}`}
                  onClick={() => handleTabChange('upscale')}
                  disabled={isProcessing}
                >
                  Upscale
                  {activeTask?.type === 'upscale' && <span className="ml-2">🖼️</span>}
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={isUploadDisabled}
              />
              <Button
                color="primary"
                onPress={() => {
                  if (!isUploadDisabled) {
                    fileInputRef.current.click();
                  }
                }}
                disabled={isUploadDisabled}
              >
                {getButtonText('upload')}
              </Button>

              {renderTaskImage()}

              {activeTab === "upscale" && (
                <>
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
                </>
              )}

              {isProcessing && activeTask?.type === activeTab && (
                <Progress
                  aria-label="Processing Progress"
                  size="sm"
                  value={taskProgress}
                  color="primary"
                  className="w-full mb-2"
                />
              )}

              {isProcessing && activeTask?.type === activeTab && (
                <p className="text-small text-center">
                  Processing: {taskProgress}%
                </p>
              )}

              {isCooldownActive && (
                <Progress
                  aria-label="Cooldown Progress"
                  size="sm"
                  value={(300 - cooldownTimer) / 3} // Assuming 5 minutes cooldown
                  color="warning"
                  className="w-full mb-2"
                />
              )}

              {isCooldownActive && (
                <p className="text-small text-warning text-center">
                  Cooldown: {cooldownTimer}s remaining
                </p>
              )}

              {isQueuedAfterCooldown && (
                <p className="text-small text-warning text-center">
                  Task is still in queue. You can upload a new image if you'd like.
                </p>
              )}

              <p className="text-small text-gray-400 text-center">
                {activeTab === "layering" ? "2 credits" : "1 credit"} will be used for this operation
              </p>

              <Button 
                color="warning" 
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {getButtonText('submit')}
              </Button>

              {renderResult()}

              {taskStatus && activeTask?.type === activeTab && (
                <p className="text-small text-center mt-2">
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
