package engine

import (
	"SyncEngine/models/dir"
	"SyncEngine/models/file"
	"SyncEngine/models/syncs"
	"fmt"
	"log"
	"path/filepath"

	ini "gopkg.in/ini.v1"
)

var SyncProcess = syncs.Sync{}
var SyncProcessID = ""

func Init(rootFilePath string) error {
	if err := syncs.CreateCollectionIfNotExists(); err != nil {
		return err
	}

	if sync, err := syncs.CreateSyncProcessIfNotExists(rootFilePath); err != nil {
		return err
	} else {
		SyncProcess = sync
		SyncProcessID = fmt.Sprintf("%d", sync.ID)
	}
	return nil
}

func BeginOrResume(rootFilePath string) error {
	config, err := ini.Load("config.ini")
	if err != nil {
		log.Printf("Fail to read config.ini file: %v", err)
		return err
	}

	milvus, err := config.NewSection("milvus")
	if err != nil {
		log.Printf("Fail to read milvus in config.ini file: %v", err)
		return err
	}
	milvusUri := milvus.Key("uri").String()
	milvusUsername := milvus.Key("user").String()
	milvusPassword := milvus.Key("password").String()
	collectionName := milvus.Key("collection").String()

	if err := file.CreateCollectionIfNotExists(SyncProcessID); err != nil {
		log.Printf("err in CreateCollectionIfNotExists")
		return err
	}
	//if err := dir.CreateCollectionIfNotExists(SyncProcessID); err != nil {
	//	return err
	//}

	// if !SyncProcess.DirScanned {
	if files, err := dir.FetchAll(SyncProcessID); err != nil {
		return err
	} else {
		filePathsExits := map[string]bool{}
		for _, document := range files {
			filePathsExits[document.Get(string(dir.Path)).(string)] = true

		}
		log.Println("------- Processing Dirs --------")
		ProcessDirs(rootFilePath, SyncProcessID, filePathsExits, false)
		log.Println("------- Processing Dirs Completed --------")
		err := syncs.DirScannedCompleted(SyncProcess.ID)
		if err != nil {
			return err
		}
	}
	// }
	log.Println("------- Generate Thumbnails --------")
	thumbnailPath := filepath.Join(".local", "thumbnails3")
	err = GenerateThumbnails(SyncProcessID, thumbnailPath)
	if err != nil {
		log.Printf("err in thumbnail generations: %v", err)
		return err
	}
	log.Println("------- Generate Thumbnails Completed --------")
	log.Println("------- Generate Embeddings --------")
	cacheFolder := filepath.Join(".cache")
	// file.Reset()
	err = GenerateEmbeddings(SyncProcessID, collectionName, milvusUri, milvusUsername, milvusPassword, cacheFolder)
	if err != nil {
		return err
	}
	log.Println("------- Generate Embeddings Completed --------")
	log.Println("------- Sync Milvus --------")
	// file.Reset()
	// embFolder := filepath.Join(".local", "embs3")
	// err = SyncMilvus(SyncProcessID, milvusUri, milvusUsername, milvusPassword, collectionName, embFolder)
	log.Println("------- Sync Milvus Completed --------")
	log.Println("------- All Process Completed --------")

	return nil
}
