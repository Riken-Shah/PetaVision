package engine

import (
	"SyncEngine/models/dir"
	"SyncEngine/models/file"
	"SyncEngine/utils"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	maxSliceLength      = 10000
	filePaths           []file.File
	newDirsTravelled    []dir.Dir
	dirAlreadyTravelled map[string]bool
	mutex               sync.Mutex
	collectionName      = "p0"
	fileExtMap          = make(map[string]int, 0)
	infoFileTypes       = false
)

func isSymlink(info os.FileInfo) bool {
	return info.Mode()&os.ModeSymlink == os.ModeSymlink
}

func processFile(filePath string, wg *sync.WaitGroup) {
	defer wg.Done()

	ext := strings.ToLower(filepath.Ext(filePath))

	// Check file extensions here
	if strings.HasPrefix(ext, ".png") || strings.HasPrefix(ext, ".jpg") || strings.HasPrefix(ext, ".jpeg") || strings.HasPrefix(ext, ".tif") {
		// Add the f path to the slice
		mutex.Lock()
		f := file.File{}
		f.FilePath = filePath
		// if count, _ := file.CheckFileScanned(f.FilePath); count == 0 {
		// 	filePaths = append(filePaths, f)
		// }
		filePaths = append(filePaths, f)

		length := len(filePaths)
		fmt.Printf("Length is :", length)
		mutex.Unlock()

		// Dump to CloverDB if the slice reaches a certain length
		if length >= maxSliceLength {
			dumpToCloverDB()
		}
	}
}

func walkDir(rootDir string, wg *sync.WaitGroup) {
	defer wg.Done()
	filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Println("error while walking dir: ", path, err)
			return nil
		}

		_, exists := dirAlreadyTravelled[path]
		if exists {
			return nil
		}

		// Skip symbolic links
		if isSymlink(info) {
			return nil
		}

		if !info.IsDir() {
			// Process the file concurrently
			wg.Add(1)
			go processFile(path, wg)
			mutex.Lock()
			// Keeping track of d already travelled
			d := dir.Dir{}
			d.Path = path
			newDirsTravelled = append(newDirsTravelled, d)
			dirAlreadyTravelled[path] = true
			ext := filepath.Ext(path)
			if infoFileTypes {
				if val, ok := fileExtMap[ext]; ok {
					fileExtMap[ext] = val + 1
				} else {
					fileExtMap[ext] = 0
				}
			}
			mutex.Unlock()
		}

		return nil
	})
}

func dumpToCloverDB() {
	mutex.Lock()
	defer mutex.Unlock()

	//// Insert file paths into CloverDB
	err := file.InsertMany(collectionName, filePaths)
	if err != nil {
		log.Printf("err insersting recrods: %v", err)
		return
	}
	//dir.InsertMany(collectionName, newDirsTravelled)

	log.Printf("Flushed files %d to files\n", len(filePaths))

	// Clear the slice
	filePaths = nil
	newDirsTravelled = []dir.Dir{}
	if infoFileTypes {
		printFileExtInfo()
	}
}

func printFileExtInfo() {
	for key, val := range fileExtMap {
		log.Printf("%s : %v\n", key, val)
	}
}

func ProcessDirs(rootFilePath, collection string, filePathsSynced map[string]bool, infoFileType bool) {
	collectionName = collection
	dirAlreadyTravelled = filePathsSynced
	infoFileTypes = infoFileType
	defer utils.Timer("process dir")()
	var wg sync.WaitGroup
	// Start the recursive file processing
	wg.Add(1)
	go walkDir(rootFilePath, &wg)

	// Wait for all goroutines to finish
	wg.Wait()

	// Dump any remaining file paths to CloverDB
	dumpToCloverDB()

	if infoFileTypes {
		printFileExtInfo()
	}
}
