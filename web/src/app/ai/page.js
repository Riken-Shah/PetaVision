"use client"
import React, { useState, useRef, useEffect } from 'react';
import { Button, Slider, Card, CardBody, Progress, CircularProgress, Chip, Link, Tabs, Tab, Switch } from "@nextui-org/react";
import { fileUpload } from "../../../utils/upload";
import { fireTask, getCurrentTasks, getOrgUser, createOrgUser } from "../../../utils/helpers";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, toggleAnalytics } from "../../../utils/firebase";
import AuthModal from "@/app/components/AuthModal";
import OrganizationModal from "@/app/components/OrganizationModal";
import InsufficientModal from "@/app/components/InsufficientModal";
import NotOnWorkspaceModal from "@/app/components/NotOnWorkspace";
import { useSearchParams } from 'next/navigation';

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

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
  const [isManualMode, setIsManualMode] = useState(false);
  const [selectedColors, setSelectedColors] = useState(Array(6).fill('#FFFFFF'));
  const [activeColorIndex, setActiveColorIndex] = useState(null);
  const canvasRef = useRef(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

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

  useEffect(() => {
    if (activeTask && activeTask.extraParams && activeTask.extraParams.colors) {
      setSelectedColors(Object.values(activeTask.extraParams.colors).map(color => 
        rgbToHex(color[0], color[1], color[2])
      ));
    }
  }, [activeTask]);

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

  const handleModeToggle = (isSelected) => {
    setIsManualMode(isSelected);
    if (!isSelected && isImageLoaded) {
      selectAutomaticColors();
    }
  };

  useEffect(() => {
    const imageToLoad = activeTask?.ref_image || uploadedURL;
    if (imageToLoad) {
      console.log("Attempting to load image from URL:", imageToLoad);
      setIsImageLoaded(false);
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageToLoad)}`;
      console.log("Proxy URL:", proxyUrl);
      drawImageOnCanvas(proxyUrl);
    }
  }, [uploadedURL, activeTask]);

  const drawImageOnCanvas = (url) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      setIsImageLoaded(true);
      console.log("Image loaded and drawn on canvas");
      if (!isManualMode) {
        selectAutomaticColors();
      }
    };
    img.onerror = (error) => {
      console.error("Error loading image:", error);
      setIsImageLoaded(false);
    };
    img.src = url;
  };

  const handleCanvasClick = (event) => {
    console.log("Canvas clicked");

    const canvas = canvasRef.current;
    if (!canvas) {
      console.log("Canvas ref is null");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
  
    // Calculate the scale of the canvas
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
  
    // Apply the scale to get the actual coordinates on the canvas
    const canvasX = Math.floor(x * scaleX);
    const canvasY = Math.floor(y * scaleY);

    console.log("Click coordinates on canvas:", canvasX, canvasY);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log("Unable to get 2D context");
      return;
    }

    try {
      const imageData = ctx.getImageData(canvasX, canvasY, 1, 1).data;
      console.log("Raw image data:", imageData);
      const hexColor = rgbToHex(imageData[0], imageData[1], imageData[2]);
      console.log("Clicked color:", hexColor);

      if (isManualMode && activeColorIndex !== null && isImageLoaded) {
        setSelectedColors(prevColors => {
          const newColors = [...prevColors];
          newColors[activeColorIndex] = hexColor;
          return newColors;
        });
        setActiveColorIndex(null);
      }
    } catch (error) {
      console.error("Error getting image data:", error);
    }
  };

  const selectAutomaticColors = () => {
    if (!canvasRef.current || !isImageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Simple color quantization
    const colorMap = {};
    for (let i = 0; i < pixels.length; i += 4) {
      const r = Math.floor(pixels[i] / 32) * 32;
      const g = Math.floor(pixels[i + 1] / 32) * 32;
      const b = Math.floor(pixels[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      colorMap[key] = (colorMap[key] || 0) + 1;
    }

    const sortedColors = Object.entries(colorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return rgbToHex(r, g, b);
      });

    setSelectedColors(sortedColors);
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;

    setIsSubmitting(true);
    setTaskProgress(0);
    setIsProcessing(true);
    setIsCooldownActive(true);
    try {
      if (activeTab === "layering") {
        const extraParams = {
          n_layers: -1,
          manual_mode: isManualMode,
        };
        if (isManualMode) {
          extraParams.colors = selectedColors.reduce((acc, color, index) => {
            const [r, g, b] = color.slice(1).match(/.{2}/g).map(x => parseInt(x, 16));
            acc[index + 1] = [r, g, b, 255];
            return acc;
          }, {});
        }
        extraParams.image_size = { width: canvasRef.current.width, height: canvasRef.current.height };
        await fireTask("layering", orgUser.org_id, {
          count: 1,
          refImage: uploadedURL,
          extraParams: extraParams
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
    } else {
      console.error("Download URL is not available");
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
    const imageToShow = activeTask?.ref_image || uploadedURL;

    return (
      <div className="w-full aspect-square relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            cursor: isManualMode ? 'crosshair' : 'default',
            width: '100%',
            height: '100%',
            display: imageToShow ? 'block' : 'none'
          }}
        />
        {!imageToShow && (
          <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white">
            No image uploaded
          </div>
        )}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <CircularProgress aria-label="Loading..." />
          </div>
        )}
        {!isImageLoaded && imageToShow && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
            Loading image...
          </div>
        )}
      </div>
    );
  };

  const renderResult = () => {
    if (!downloadUrl || !activeTask || activeTask.type !== activeTab) return null;

    if (activeTab === 'layering') {
      return (
        <div className="mt-4 flex flex-col items-center">
          <p className="text-green-500 mb-2">Process completed!</p>
          <Button 
            color="primary" 
            onPress={handleDownload}
          >
            Download PSD
          </Button>
        </div>
      );
    } else if (activeTab === 'upscale') {
      return (
        <div className="w-full mt-4">
          <p className="text-green-500 text-center mb-2">Process completed!</p>
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
        <CardBody className="flex flex-col items-center">
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

              {activeTab === "layering" && (
                <div className="w-full flex flex-col items-center mt-4">
                  <div className="flex items-center mb-2">
                    <span>Automatic</span>
                    <Switch isSelected={isManualMode} onValueChange={handleModeToggle} className="mx-2" />
                    <span>Manual</span>
                  </div>
                  
                  {(isManualMode || (activeTask && activeTask.extraParams && activeTask.extraParams.colors)) && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {selectedColors.map((color, index) => (
                        <div key={index} className="flex items-center">
                          <Button
                            auto
                            size="sm"
                            color={activeColorIndex === index ? "primary" : "default"}
                            onPress={() => setActiveColorIndex(index)}
                          >
                            {index + 1}
                          </Button>
                          <div
                            className="w-6 h-6 border border-gray-300 ml-2"
                            style={{ backgroundColor: color }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
