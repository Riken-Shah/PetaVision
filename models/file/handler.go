package file

import (
	"SyncEngine/utils"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
)

func CreateCollectionIfNotExists(syncID string) error {
	// Parameterized query for creating the table
	createTableQuery := `
		CREATE TABLE IF NOT EXISTS files (
			file_path TEXT UNIQUE,
			last_synced INTEGER,
			thumbnail_generated INTEGER DEFAULT 0,
			thumbnail_path TEXT,
			synced_to_vector_db INTEGER DEFAULT 0
		);`

	// Execute the parameterized query
	if _, err := utils.DBClient.DBClient.Exec(createTableQuery); err != nil {
		return fmt.Errorf("error creating table: %v", err)
	}

	// Print the SQL statement
	fmt.Println("Create table SQL:", createTableQuery)

	// Create an index for FilePath
	indexQuery := `CREATE INDEX IF NOT EXISTS idx_file_path ON files (file_path);`
	if _, err := utils.DBClient.DBClient.Exec(indexQuery); err != nil {
		return fmt.Errorf("error creating index: %v", err)
	}

	// Print the index creation SQL statement
	fmt.Println("Create index SQL:", indexQuery)

	return nil
}

func CheckFileScanned(filePath string) (int, error) {
	query := `SELECT * FROM files WHERE file_path = '` + string(filePath) + `';`
	rows, err := utils.DBClient.DBClient.Query(query)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	// Count the number of rows
	count := 0
	for rows.Next() {
		count++
	}

	// Check for any errors encountered during iteration
	if err := rows.Err(); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Number of rows: %d for %s \n", count, filePath)

	return count, err
}

func InsertMany(syncID string, files []File) error {
	// Prepare the SQL query
	query := `INSERT OR IGNORE INTO files (file_path, last_synced, thumbnail_generated, thumbnail_path, synced_to_vector_db) VALUES (?, ?, ?, ?, ?)`

	for _, file := range files {
		// query += ""
		values := []interface{}{}
		values = append(values, file.FilePath, file.LastSynced, file.ThumbnailGenerated, file.ThumbnailPath, file.SyncedToVectorDB)
		// fmt.Println(query)
		_, err := utils.DBClient.DBClient.Exec(query, values...)
		if err != nil {
			return err
		}

	}

	// Trim the trailing comma
	// query = query[:len(query)-1]

	// Execute the query
	// _, err := utils.DBClient.DBClient.Exec(query, values...)
	return nil
}

func FetchAllForGeneratingThumbnails(syncID string) ([]string, error) {
	q := `SELECT (file_path) FROM files  WHERE ` + string(ThumbnailGenerated) + ` = 0;`
	fmt.Println(q)
	rows, err := utils.DBClient.DBClient.Query(q)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []string
	index := 0
	for rows.Next() {
		//var file File
		var file string
		err := rows.Scan(&file)
		files = append(files, file)
		index++
		if err != nil {
			return nil, err
		}
		//files = append(files, file)
	}

	return files, nil
}

func FetchAllForGeneratingEmbedding(syncID string, skip, limit int) ([]File, error) {
	q := `SELECT * FROM files` //  WHERE ` + string(SyncedToVectorDB) + ` = 9;`
	rows, err := utils.DBClient.DBClient.Query(q)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var file File
		err := rows.Scan(&file.FilePath, &file.LastSynced, &file.ThumbnailGenerated, &file.ThumbnailPath, &file.SyncedToVectorDB)
		if err != nil {
			return nil, err
		}
		files = append(files, file)
	}
	fmt.Println("len: ", len(files), "skip", skip, "limit", limit)

	return files[skip:int(math.Min(float64(skip+limit), float64(len(files))))], nil
}

func FetchAllForSync(syncID string, skip, limit int) ([]File, error) {
	q := `SELECT * FROM files WHERE synced_to_vector_db = false AND thumbnail_generated = true   LIMIT ? OFFSET ?;`
	rows, err := utils.DBClient.DBClient.Query(q, limit, skip)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var file File
		err := rows.Scan(&file.FilePath, &file.LastSynced, &file.ThumbnailGenerated, &file.ThumbnailPath, &file.SyncedToVectorDB)
		if err != nil {
			return nil, err
		}
		files = append(files, file)
	}

	return files, nil
}

func Reset() {
	utils.DBClient.DBClient.Exec(`UPDATE files SET synced_to_vector_db = false`)
}

type Row struct {
	ThumbnailPath string                 `json:"thumbnail_path"`
	Metadata      map[string]interface{} `json:"metadata"`
}

func DocumentsToRow(files []File) []Row {
	var rows = make([]Row, 0)
	rmap := map[string]bool{}
	for _, file := range files {
		// f := filepath.Join(".local\\thumbnails2", strings.TrimSuffix(filepath.Base(file.FilePath), path.Ext(file.FilePath))+".jpeg")
		hasher := sha1.New()
		hasher.Write([]byte(file.FilePath))
		hash := hex.EncodeToString(hasher.Sum(nil))
		x := filepath.Join(".local", "thumbnails3", hash+".jpeg")
		// fmt.Println("fikle", f)
		// x := strings.TrimSuffix(filepath.Base(file.FilePath), path.Ext(file.FilePath)) + ".jpeg"
		if _, ok := rmap[x]; ok {
			continue
		}
		if _, err := os.Stat(x); err != nil {
			log.Println("thumbnail doesn't exists: ", x)
			continue
		}
		row := Row{
			ThumbnailPath: x,
			Metadata: map[string]interface{}{
				string(LastSynced): file.LastSynced,
				string(FilePath):   "",
			},
		}
		rmap[x] = true
		rows = append(rows, row)
	}
	return rows
}

func ThumbnailGeneratedCompleted(filePath string) error {

	// args := make([]interface{}, len(filePaths))
	// for i, v := range filePaths {
	// 	args[i] = v
	// }
	// fmt.Printf("fpath", filePath)

	_, err := utils.DBClient.DBClient.Exec(fmt.Sprintf("UPDATE files SET thumbnail_generated = 1 WHERE file_path = '%s'", filePath))
	return err
}

func ThumbnailEmbeddingCompleted(filePaths []string) error {

	args := make([]interface{}, len(filePaths))
	for i, v := range filePaths {
		args[i] = v
	}

	_, err := utils.DBClient.DBClient.Exec(`UPDATE files SET synced_to_vector_db = 1 WHERE file_path IN (?`+strings.Repeat(", ?", len(args)-1)+`)`, args...)
	return err
}
