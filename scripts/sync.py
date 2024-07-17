import json
import os
from datetime import datetime
from itertools import chain

import torch
import argparse
import timeit
from pathlib import Path

from caption import ImageCaption
from clip import ImagesIndexer
from milvus import Milvus
from PIL import ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True


EXTENSIONS_LIST = ["*.jpeg"]


class SyncDir:
    def __init__(self, thumbnail_dir, embedding_folder, json_file, cache_dir, collection_name, milvus_uri, milvus_username,
                 milvus_password):
        self.embedding_folder = Path(embedding_folder)
        # Cache Dir for models
        self.cache_dir = cache_dir
        self.images_dir = Path(thumbnail_dir)
        # assert os.path.exists(self.images_dir), "Images file not found"
        self.device = "mps" if torch.has_mps else "cuda" if torch.cuda.is_available() else "cpu"
        # self.device = "cpu"
        print(f"Torch will use self.device: {self.device}")

        self.rows_dict = {}
        if json_file != "":
            with open(json_file, 'r',encoding="utf-8") as f:
                r = f.read()
                rows = json.loads(r.replace('\\"', '"').replace('\\\\"', '\\"'))
                print(f"rows is {len(rows)}")
                for row in rows:
                    # file_name = Path(".local\\thumbnails2", os.path.basename(row["metadata"]["file_path"].split(".")[0] + ".jpeg"))
                    # thumbnail_path = file_name
                    thumbnail_path = row["thumbnail_path"]
                    # thumbnail_path = ".local\\thumbnails2\\" + row["thumbnail_path"]
                    metadata = row["metadata"]
                    self.rows_dict[thumbnail_path] = metadata

        # Indexer
        self.indexer = ImagesIndexer(do_rotate_images=False, cache_dir=cache_dir, device=self.device)
        # Captioner
        self.captioner = ImageCaption(self.indexer.model, self.indexer.preprocess_image, cache_dir=self.cache_dir,
                                      device=self.device)

        # VectorDB which acts as the index for the images
        self.milvus = Milvus(milvus_uri, milvus_username, milvus_password, collection_name=collection_name)

    def _rglob_extension(self, extension):
        for fname in chain.from_iterable(
                [self.images_path.rglob(extension), self.images_path.rglob(extension.upper())]):
            yield fname.relative_to(self.images_path)

    def empty_function(self, *args, **kwargs):
        return

    def create_record(self, thumbnail_path, width, height, emb, caption, tags):
        aspect_ratio = width / height
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return {
            "thumbnail_path": thumbnail_path,
            "width": width,
            "height": height,
            "emb": emb,
            "aspect_ratio": aspect_ratio,
            "last_synced_on": now,
            "caption": caption,
            "tags": tags
        }

    def create_records_for_milvus(self, records):
        records_for_db = []
        for record in records:
            record = {
                "embedding": record["emb"],
                "fname": str(self.rows_dict[record["thumbnail_path"]]["file_path"]),
                "keywords": "",
                "manual_keywords": "",
                "metadata":{
                    "width": record["width"],
                    "height": record["height"],
                    "caption": record["caption"],
                    "tags": record["tags"],
                    "thumbnail": record["thumbnail_path"],
                    "last_synced_on": record["last_synced_on"]
                }
            }
            # print("event: ", self.rows_dict[record["fname"]])
            records_for_db.append(record)
        return records_for_db

    def add_bulk(self):
        # images_files = sorted(
        #     map(str,  chain(*map(self._rglob_extension, EXTENSIONS_LIST)))
        # )
        # images_files = os.scandir(self.images_path)

        # print("{} images found".format(len(images_files)))

        bulk = 30000
        images_files = []
        print("Total ros: ", len(self.rows_dict.items()))
        for thumbnail_path, metadata in self.rows_dict.items():
            # if entry.name.endswith(".jpeg"):
            #     images_files.append(entry.path)
            
            # try:
            #     print('thum: ', thumbnail_path, end='\r')
            # except Exception as e:
            #     print("error wheil reafin", "excp: ", e)
            #     continue
            images_files.append(thumbnail_path)

            if len(images_files) >= bulk:
                records = self.indexer.add_bulk(self.images_dir, images_files, self.create_record, self.empty_function,
                                                self.captioner.get_caption_and_tags, self.embedding_folder)
                # insert into milvus
                    
                self.milvus.upsert(self.create_records_for_milvus(records))
                images_files = []

        if len(images_files) > 0:
            records = self.indexer.add_bulk(self.images_dir, images_files, self.create_record, self.empty_function,
                                            self.captioner.get_caption_and_tags, self.embedding_folder)
            # insert into milvus
            self.milvus.upsert(self.create_records_for_milvus(records))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-file", help="Path to JSON file")
    parser.add_argument("--collection-name", help="Collection Name")
    parser.add_argument("--milvus-uri", help="Milvus URI")
    parser.add_argument("--milvus-username", help="Milvus Username")
    parser.add_argument("--milvus-password", help="Milvus Password")
    parser.add_argument("--cache-dir", help="Cache Dir", default="")
    parser.add_argument("--emb-dir", help="Emb Dir", required=True)
    parser.add_argument('--rotation-invariant', help='Average embeddings of 4 rotations on image inputs', default=False,
                        action='store_true')
    parser.add_argument("--force-sync", help="Force sync to milvus", default=False, action="store_true")

    args = parser.parse_args()
    rotation_invariant = args.rotation_invariant

    start = timeit.default_timer()

    syncEngine = SyncDir("",args.emb_dir, args.json_file,  collection_name=args.collection_name,
                         cache_dir=args.cache_dir,
                         milvus_uri=args.milvus_uri, milvus_username=args.milvus_username,
                         milvus_password=args.milvus_password)
    syncEngine.add_bulk()
    stop = timeit.default_timer()
    total_time = stop - start
    mins, secs = divmod(total_time, 60)
    hours, mins = divmod(mins, 60)

    print(f"Indexing took {hours} hours, {mins} minutes, {secs} seconds")
