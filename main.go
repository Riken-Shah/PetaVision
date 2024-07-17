package main

import (
	"SyncEngine/engine"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

var logsDir = filepath.Join(".local", "logs")

const (
	timeFormat   = "2006-01-02T15:04:05Z07:00"
	logFilePerm  = 0666
	syncFilePath = ".local/last_synced.json"
)

type SyncInfo struct {
	IsRunning    bool      `json:"is_running"`
	LastSyncedAt time.Time `json:"last_synced_at"`
}

func setupLogging() *os.File {
	logDir := filepath.Join(".", logsDir)
	err := os.Mkdir(logDir, os.ModePerm)
	if err != nil {
		// log.Fatal("Error creating logs directory: ", err)
	}

	logFilePath := filepath.Join(logDir, time.Now().Format(timeFormat)+".log")
	fmt.Println("Log file path:", logFilePath)

	logFile, err := os.OpenFile(logFilePath, os.O_RDWR|os.O_CREATE|os.O_APPEND, logFilePerm)
	if err != nil {
		log.Fatal("Error opening logfile: ", err)
	}
	log.SetOutput(logFile)
	log.SetFlags(log.LstdFlags | log.Lshortfile | log.Lmicroseconds)
	return logFile
}

func parseFlags() (string, bool, bool) {
	rootFilePath := flag.String("rootFilePath", "", "Path to the file")
	force := flag.Bool("force", false, "Force flag")
	syncFlag := flag.Bool("sync", false, "Sync flag - checks last_synced and runs if greater than 6 hours and is_running is false")
	flag.Parse()

	if *rootFilePath == "" {
		log.Fatal("Error: rootFilePath is required.")
	}

	return *rootFilePath, *force, *syncFlag
}

func checkLastSynced(filePath string) (bool, bool, error) {
	fileContent, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			// File does not exist, return false for both conditions
			return true, true, nil
		}
		// Other errors are returned
		return false, false, err
	}

	var syncInfo SyncInfo
	err = json.Unmarshal(fileContent, &syncInfo)
	if err != nil {
		return false, false, err
	}

	lastSyncedDuration := time.Since(syncInfo.LastSyncedAt)
	return lastSyncedDuration > 6*time.Hour, !syncInfo.IsRunning, nil
}

func createOrUpdateSyncFile(filePath string) error {
	syncInfo := SyncInfo{
		IsRunning:    true,
		LastSyncedAt: time.Now(),
	}

	data, err := json.Marshal(syncInfo)
	if err != nil {
		return err
	}

	// Check if the file already exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// File does not exist, create it
		err = os.WriteFile(filePath, data, os.ModePerm)
		if err != nil {
			return err
		}
	} else {
		// File exists, update it
		err = os.WriteFile(filePath, data, os.ModePerm)
		if err != nil {
			return err
		}
	}

	return nil
}

func closeSyncFile(filePath string) error {
	syncInfo := SyncInfo{
		IsRunning:    false,
		LastSyncedAt: time.Now(),
	}

	data, err := json.Marshal(syncInfo)
	if err != nil {
		return err
	}

	err = os.WriteFile(filePath, data, os.ModePerm)

	if err != nil {
		return err
	}
	return nil
}

func runProcess(rootFilePath string, force, syncFlag bool) {
	if syncFlag {
		// Logic to check last_synced and run if greater than 6 hours and is_running is false
		fmt.Println("Sync flag is set. Checking last_synced and is_running...")
		isLastSyncedGreater, isNotRunning, err := checkLastSynced(syncFilePath)
		if err != nil {
			log.Fatal("Error checking last_synced: ", err)
		}

		if isNotRunning && isLastSyncedGreater {
			fmt.Println("is_running is false and last_synced is greater than 6 hours. Running sync...")
			// Add your sync logic here

			// Update the sync file with the current timestamp
			err := createOrUpdateSyncFile(syncFilePath)
			if err != nil {
				log.Fatal("Error updating sync file: ", err)
			}
		} else {
			if !isNotRunning {
				log.Printf("is_running is true. SKIPPING THIS")
				return
			}
			if !isLastSyncedGreater {
				log.Printf("last_synced is within the acceptable time frame.  SKIPPING THIS")
				return
			}
		}
	}

	err := engine.Init(rootFilePath)
	if err != nil {
		log.Fatal("Error in init: ", err)
	}

	if err := engine.BeginOrResume(rootFilePath); err != nil {
		log.Fatal("Error in begin or resume: ", err)
	}

	if syncFlag {
		if err := closeSyncFile(syncFilePath); err != nil {
			log.Println("error updating the file")
			log.Fatal("error updating the file")
		}
	}

	// Additional logic based on rootFilePath, force, and syncFlag parameters
	log.Printf("Command-line arguments - rootFilePath: %s, force: %t, sync: %t\n", rootFilePath, force, syncFlag)
}

func watchDir(rootFilePath string, force, syncFlag bool) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer watcher.Close()

	done := make(chan bool)
	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Create == fsnotify.Create {
					log.Println("New file detected:", event.Name)
					runProcess(rootFilePath, force, syncFlag)
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	err = watcher.Add(rootFilePath)
	if err != nil {
		log.Fatal(err)
	}
	<-done
}

func main() {
	logFile := setupLogging()
	defer logFile.Close()

	rootFilePath, force, syncFlag := parseFlags()

	// Initial run
	runProcess(rootFilePath, force, syncFlag)

	// Watch for new files
	watchDir(rootFilePath, force, syncFlag)
}
