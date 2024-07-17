# Heavily Inspired from https://github.com/brunodoamaral/clip-search/blob/master/indexer.py
import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from itertools import chain
from pathlib import Path
from queue import Queue

import numpy as np
import open_clip
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision.transforms import Compose, Normalize
from tqdm import tqdm
from torchvision import transforms


def to_rgb(image):
    return image.convert("RGB")


def collate_fn(batch):
    batch = list(filter(lambda x: x is not None, batch))
    return torch.utils.data.dataloader.default_collate(batch)


class ImagesDataset(Dataset):
    def __init__(self, images_path, images_files, preprocess, input_resolution):
        super().__init__()
        self.images_files = images_files
        self.preprocess = preprocess
        self.empty_image = torch.zeros(3, input_resolution, input_resolution)
        self.images_path = images_path

    def __len__(self):
        return len(self.images_files)

    def __getitem__(self, index):
        raw_fname = self.images_files[index]
        # fname = Path(self.images_path, raw_fname)
        fname= raw_fname
        
        try:
            image = self.preprocess(Image.open(fname))
        except Exception as e:
            print(f"error reading {fname}, error as {e}")
            image = None
            return None
            # raise e
        # print("retur", str(raw_fname), "index: ", index, "lenL ", len(image))
        return image, str(raw_fname)


class ImagesIndexer:
    def __init__(self, do_rotate_images=False, cache_dir=".cache", device="cpu"):
        self.images_path = None
        self.cache_dir = cache_dir
        self.rotations = [0, 1, 2, 3] if do_rotate_images else [0]
        # CLIP
        self.device = device

        self.model = None

        self.input_resolution = 512

        self.context_length = None

        self.preprocess_image = None

        self.normalize_image = Compose(
            [
                Normalize(
                    (0.48145466, 0.4578275, 0.40821073),
                    (0.26862954, 0.26130258, 0.27577711),
                ),
            ]
        )

        self.load_if_not_loaded()

    def extra_pre_process(self, image):
        return self.preprocess_image(image)

    def load_if_not_loaded(self):
        if self.model is None:
            print("Loading CLIP model...")
            model, _, preprocess = open_clip.create_model_and_transforms('hf-hub:laion/CLIP-ViT-H-14-laion2B-s32B-b79K',
                                                                         cache_dir=self.cache_dir, device=self.device)
            # model, _, preprocess = open_clip.create_model_and_transforms("ViT-L-14", pretrained="openai", cache_dir=self.cache_dir, device=self.device)
            # ViT - L - 14 / openai
            print("loaded model")
            self.model = model.to(self.device)
            self.model.eval()
            self.context_length = self.model.context_length
            self.preprocess_image = preprocess

    def release_the_model(self):
        if self.model is not None:
            del self.model
            self.model = None

    # def add_bulk(self, images_files, create_record, generate_thumbnail):
    #     # Build index
    #     ds = ImagesDataset(
    #         self.images_path, images_files, self.preprocess_image, self.input_resolution
    #     )
    #     dl = DataLoader(
    #         ds, batch_size=32, shuffle=False, num_workers=os.cpu_count() // 4
    #     )
    #     print("Building index with CLIP. It may take a while...")
    #     q_thread = Queue(256)
    #     records = []
    #     for images, fnames in tqdm(dl, file=sys.stdout, bar_format="{l_bar}{bar}{r_bar}"):
    #         # Normalize images before input
    #         images = self.normalize_image(images).to(self.device)
    #         index = 0
    #         with torch.no_grad():
    #             # Rotate images and then storing the mean of the embeddings
    #             emb_images = torch.stack([
    #                 self.model.encode_image(
    #                     torch.rot90(images, rotation, [-2, -1])
    #                 )
    #                 for rotation in self.rotations
    #             ], 0).mean(0).cpu().float().numpy()
    #
    #         emb_images /= np.linalg.norm(emb_images, axis=-1, keepdims=True)
    #         for fname in fnames:
    #             image = Image.open(self.images_path / fname)
    #             generate_thumbnail(fname, image)
    #             width, height = image.size
    #             records.append(create_record(fname, width, height, emb_images[index]))
    #
    #         # Signal thread to finish
    #         q_thread.put((None, None))
    #
    #     return records
    def add_bulk(self, images_path, images_files, create_record, generate_thumbnail, get_caption_and_tags, embedding_folder):
        self.images_path = images_path
        # Build index
        ds = ImagesDataset(
            self.images_path, images_files, self.preprocess_image, self.input_resolution)
        dl = DataLoader(
            ds,collate_fn=collate_fn, batch_size=32, shuffle=False, num_workers=os.cpu_count() // 4
        )
        print("Building index with CLIP. It may take a while...")

        def process_batch(batch):
            images, fnames = batch

            with torch.no_grad():
                images = images.to(self.device)
                emb_images = torch.stack([
                    self.model.encode_image(torch.rot90(images, rotation, [-2, -1]))
                    for rotation in self.rotations
                ], 0).mean(0).cpu().float().numpy()

            # emb_images = em.concatenate(self.index)
            emb_images /= np.linalg.norm(emb_images, axis=-1, keepdims=True)

            # to_pil_transform = transforms.ToPILImage()

            batch_records = []
            i = 0
            
            for fname, image_tensor, emb in zip(fnames, images, emb_images):
                image = Image.open(self.images_path / fname)
                # image = to_pil_transform(image_tensor)
            #     # asyncio.run(generate_thumbnail(fname, image))
                caption, tags = get_caption_and_tags(image)
                width, height = image.size
                batch_records.append(create_record(fname, width, height, emb, caption, tags))
                save_path = os.path.join(embedding_folder, f"{os.path.basename(fname).split('.')[0]}.npy")
                i += 1
                np.save(save_path, emb)


            return batch_records

        records = []
        for batch in tqdm(dl, file=sys.stdout, bar_format="{l_bar}{bar}{r_bar}"):
            if batch is None:
                continue
            else:
                # preds = model(batch)
                records.extend(process_batch(batch))
        print("Total records: ", len(records))
        # with ThreadPoolExecutor() as executor:
        #     futures = []
        #     for batch in tqdm(dl, file=sys.stdout, bar_format="{l_bar}{bar}{r_bar}"):
        #         future = executor.submit(process_batch, batch)
        #         futures.append(future)
        #
        #     for future in tqdm(futures, file=sys.stdout, bar_format="{l_bar}{bar}{r_bar}"):
        #         records.extend(future.result())

        return records

    def _rglob_extension(self, extension):
        for fname in chain.from_iterable(
                [self.images_path.rglob(extension), self.images_path.rglob(extension.upper())]):
            yield fname.relative_to(self.images_path)

    def encode_prompt(self, prompt, normalize=False):
        # tokenizer = open_clip.get_tokenizer('ViT-L-14')
        tokenizer = open_clip.get_tokenizer('hf-hub:laion/CLIP-ViT-H-14-laion2B-s32B-b79K')
        text = tokenizer([prompt]).to(self.device)
        with torch.no_grad():
            emb_text = self.model.encode_text(text).float()

            if normalize:
                emb_text /= emb_text.norm(dim=-1, keepdim=True)

        return emb_text.cpu().numpy()

    def encode_image(self, img, normalize=False):
        image = self.normalize_image(self.preprocess_image(img)).to(self.device)

        # Apply rotation
        images_rot = torch.stack([
            torch.rot90(image, rotation, [-2, -1])
            for rotation in self.rotations
        ], 0)

        with torch.no_grad():
            image_features = self.model.encode_image(images_rot).float().mean(0)

        if normalize:
            image_features /= image_features.norm(dim=-1, keepdim=True)

        return image_features.cpu().numpy()
