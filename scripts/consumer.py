import os
import pathlib
import threading
from collections import defaultdict
from urllib.parse import urlparse, unquote

import firebase_admin
from firebase_admin import credentials, db, storage, firestore
import requests
import json
# from fscs_layeering import perform_layering
from fast_layer_decompostion import perform_layering
import base64
import time  # Added for simulating delay

# Initialize Firebase Admin SDK
cred = credentials.Certificate("./scripts/firebase_admin.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://ai-folder-default-rtdb.firebaseio.com',
    'storageBucket': 'ai-folder.appspot.com'
})

# Reference to the Realtime Database 
db_ref = db.reference('tasks')

# Reference to the consumer count
consumers_ref = db.reference('consumers')

# Reference to Firestore
firestore_db = firestore.client()

# Reference to Firebase Storage
bucket = storage.bucket()


def increment_consumer_count():
    current_count = consumers_ref.get()
    if current_count is None:
        current_count = 1
    else:
        current_count += 1
    consumers_ref.set(current_count)
    print(f"Consumer count incremented: {current_count}")


def update_task_state(task_id, state):
    db_ref.child(task_id).update({'status': state})


def simulate_api_call():
    # Simulate API call with a delay
    print("Simulating API call...")
    time.sleep(1)  # Simulating a 1-second delay

    # Dummy response for testing
    return {
        'images': [
            'https://firebasestorage.googleapis.com/v0/b/ai-folder.appspot.com/o/search%2Frikenshah.02%40gmail.com%2F1639%20DM.jpg?alt=media&token=41ea01a3-3668-4d6a-87de-17567092ccd8',
            'https://firebasestorage.googleapis.com/v0/b/ai-folder.appspot.com/o/search%2Frikenshah.02%40gmail.com%2F1639%20DM.jpg?alt=media&token=41ea01a3-3668-4d6a-87de-17567092ccd8']
    }


def upload_image(base64_string, firestore_id, index, task_type="layering", scale_factor=4, creativity=35, input_img_url: str= None):
    # Decode the base64 string to get the image content
    img_blob = base64.b64decode(base64_string)
    if task_type=="upscale":
        parsed_url = urlparse(input_img_url)

        # Extract the path from the URL
        path = parsed_url.path

        # Decode the path to handle any URL-encoded characters
        decoded_path = unquote(path)

        # Extract the filename from the path
        filename = (decoded_path.split('/')[-1]).replace(".jpeg","").replace(".jpg","").replace(".png","").replace(".tif","")
        img_filename = f"tasks/{firestore_id}/{filename}_upscaled_{scale_factor}_{creativity}.jpg"
    else:
        img_filename = f"tasks/{firestore_id}/{index + 1}.jpg"
    blob = bucket.blob(img_filename)

    # Set mimetype to 'image/jpeg' (modify accordingly based on your image type)
    blob.upload_from_string(img_blob, content_type='image/png')

    # Set the ACL to make the image publicly accessible
    blob.acl.all().grant_read()
    blob.acl.save()

    return blob.public_url


def upload_psd_from_path(psd_path, firestore_id):
    start = time.time()

    # with open(psd_path, 'rb') as psd_file:
    #     psd_content = psd_file.read()


    psd_filename = f"tasks/{firestore_id}/{os.path.basename(psd_path)}"
    CHUNK_SIZE = 1024 * 1024 * 30
    blob = bucket.blob(psd_filename, chunk_size=CHUNK_SIZE)

    # Set mimetype to 'image/vnd.adobe.photoshop' for PSD files
    # blob.upload_from_string(psd_content, content_type='image/vnd.adobe.photoshop')
    blob.upload_from_filename(psd_path, content_type='application/octet-stream', num_retries=5, timeout=300)

    # Set the ACL to make the PSD file publicly accessible
    blob.acl.all().grant_read()
    blob.acl.save()
    end = time.time()
    print("Uploading PSD time: ", end - start)
    return blob.public_url


def update_final_status_in_firestore(task_id, firestore_id, success):
    if firestore_id:
        # Assuming you have a 'tasks' collection in Firestore
        firestore_ref = firestore_db.collection('tasks').document(firestore_id)
        firestore_ref.update({'status': 'completed' if success else "failed"})


def deduct_credits(org_id, deducted_credits=1):
    if org_id:
        org_ref = firestore_db.collection('orgs').document(org_id)
        org_snapshot = org_ref.get()
        print("org", org_snapshot.to_dict())
        current_credits = org_snapshot.get("credits")
        new_credits = current_credits - deducted_credits
        org_ref.update({'credits': new_credits})


# AUTOMATIC1111_URL = "https://11d2-34-123-151-87.ngrok-free.app/"
AUTOMATIC1111_URL = "http://localhost:7861"

def text2img(firestore_id, prompt, negative_prompt, count, extra_params):
    headers = {'Content-Type': 'application/json'}
    payload = {
        "prompt": prompt,
        "sampler_name": "DPM++ 2M",
        "batch_size": count,
        "n_iter": 1,
        "steps": 10,
        "cfg_scale": 3.5,
        "width": 512,
        "height": 512,
        "restore_faces": True,
        "negative_prompt": negative_prompt,
        "send_images": True,
        "save_images": False,
    }

    response = requests.post(f'{AUTOMATIC1111_URL}sdapi/v1/txt2img', headers=headers,
                             data=json.dumps(payload), timeout=900)
    if response.status_code != 200:
        print("Failed to generate image with following error", response.json())
        raise Exception("Failed to generate image")

    images = response.json()['images']

    # Upload images to Firebase Storage
    img_urls = [upload_image(img_url, firestore_id, i, "txt2img") for i, img_url in enumerate(images)]
    return img_urls


def convert_img_to_base64(img_url):
    # Fetch the image content from the URL
    img_response = requests.get(img_url)

    if img_response.status_code == 200:
        # Convert the image content to base64
        base64_string = base64.b64encode(img_response.content).decode('utf-8')
        return base64_string
    else:
        # Handle the case where fetching the image failed
        raise Exception(f"Failed to fetch image from {img_url}. Status code: {img_response.status_code}")


def download_img_to_folder(img_url, folder_name, name):
    img_response = requests.get(img_url)
    if img_response.status_code == 200:
        if not os.path.exists(folder_name):
            os.makedirs(folder_name)
        img_name = f"{name}.png"
        with open(f'{folder_name}/{img_name}', 'wb') as img_file:
            img_file.write(img_response.content)
        print(f"Image downloaded successfully to '{folder_name}/{img_name}'.")
        return img_name
    else:
        print("Failed to download image. Status code:", img_response.status_code)

    return ""


def download(url, folder_name, name, attempts=2):
    """Downloads a URL content into a file (with large file support by streaming)

    :param url: URL to download
    :param file_path: Local file name to contain the data downloaded
    :param attempts: Number of attempts
    :return: New file path. Empty string if the download failed
    """
    # if not file_path:
    #     file_path = os.path.realpath(os.path.basename(url))


    img_name = f"{name}.png"
    save_path = os.path.join(folder_name, img_name)
    print(f'Downloading {url} content to {save_path}')
    url_sections = urlparse(url)
    if not url_sections.scheme:
        print('The given url is missing a scheme. Adding http scheme')
        url = f'https://{url}'

        print(f'New url: {url}')
    for attempt in range(1, attempts+1):
        try:
            if attempt > 1:
                time.sleep(10)  # 10 seconds wait time between downloads
            with requests.get(url, stream=True) as response:
                response.raise_for_status()
                with open(save_path, 'wb') as out_file:
                    for chunk in response.iter_content(chunk_size=1024*1024):  # 1MB chunks
                        out_file.write(chunk)
                print('Download finished successfully')
                return img_name
        except Exception as ex:
            print(f'Attempt #{attempt} failed with error: {ex}')
    return ''

def img2img(firestore_id, ref_image, prompt, negative_prompt, count, extra_params):
    headers = {'Content-Type': 'application/json'}
    payload = {
        "prompt": prompt,
        "sampler_name": "DPM++ 2M",
        "batch_size": count,
        "n_iter": 1,
        "steps": 80,
        "cfg_scale": 7,
        "init_images": [convert_img_to_base64(ref_image)],
        "width": 512,
        "height": 512,
        "restore_faces": True,
        "negative_prompt": negative_prompt,
        "denoising_strength": extra_params["similarity"],
        "send_images": True,
        "save_images": False,
    }

    response = requests.post(f'{AUTOMATIC1111_URL}sdapi/v1/img2img', headers=headers,
                             data=json.dumps(payload), timeout=900)
    if response.status_code != 200:
        print("Failed to generate image with following error", response.json())
        raise Exception("Failed to generate image")

    images = response.json()['images']

    # Upload images to Firebase Storage
    img_urls = [upload_image(img_url, firestore_id, i, "img2img") for i, img_url in enumerate(images)]
    return img_urls

def calc_scale_factors(value):
    lst = []
    while value >= 2:
        lst.append(2)
        value /= 2
    if value > 1:
        lst.append(value)
    return lst

def upscale(firestore_id, ref_image, extra_params):

    headers = {'Content-Type': 'application/json'}
    prompt = "masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>"
    seed = 1337
    creativity= extra_params["creativity"]

    multipliers = [extra_params["scale_factor"]]
    if extra_params["scale_factor"] > 2:
        multipliers = calc_scale_factors(extra_params["scale_factor"])
        print("Upscale your image " + str(len(multipliers)) + " times")
    base64_image = convert_img_to_base64(ref_image)

    first_iteration = True
    for i, multiplier in enumerate(multipliers):
            print("Iteration number: ", i+1)
            print("Upscaling with scale_factor: ", multiplier)
            if not first_iteration:
                    creativity = creativity * 0.8
                    seed = seed +1
            first_iteration = False
                 # Prepare the payload
            payload = {
                        "init_images": [base64_image],
                        "prompt": prompt,
                        "negative_prompt": "(worst quality, low quality, normal quality:2) JuggernautNegative-neg",
                        "steps": 18,
                        "sampler_name": "DPM++ 3M SDE Karras",
                        "cfg_scale": 6,
                        "denoising_strength": creativity,
                        "width": 1024,
                        "height": 1024,
                        "seed": seed,
                        "override_settings": {
                            "sd_model_checkpoint": "juggernaut_reborn.safetensors [338b85bc4f]",
                            "sd_vae": "vae-ft-mse-840000-ema-pruned.safetensors",
                            "CLIP_stop_at_last_layers": 1,
                        },
                        "alwayson_scripts": {
                            "Tiled Diffusion": {
                                "args": [True, "MultiDiffusion", True, True, 112, 144, 112, 144, 4, 8, "4x-UltraSharp", multiplier, False, 0, 0.0, 3]
                            },
                            "Tiled VAE": {
                                "args": [True, 2048, 192, True, True, True, True]
                            },
                            "controlnet": {"args":[ {
                    "enabled": True,
                    "module": "tile_resample",
                    "model": "control_v11f1e_sd15_tile [a371b31b]",
                    "weight": 0.6,
                    "image": base64_image,
                    "resize_mode": "Crop and Resize",
                    "low_vram": False,
                    "downsample": 1.0,
                    "guidance_start": 0.0,
                    "guidance_end": 1.0,
                    "control_mode": "Balanced",
                    "pixel_perfect": True,
                    "threshold_a": 1,
                    "threshold_b": 0.5,
                    "save_detected_map": False,
                    "processor_res": 512,
                                    }
                                ]   
                            }
                        }
                    }
        # response = requests.post(f'{AUTOMATIC1111_URL}sdapi/v1/extra-single-image', headers=headers,
                            #  data=json.dumps(payload), timeout=900)

            response = requests.post(f"{AUTOMATIC1111_URL}/sdapi/v1/img2img", json=payload)
            response.raise_for_status()
            if response.status_code != 200:
                print("Failed to generate image with following error", response.json())
                raise Exception("Failed to generate image")
            base64_image = response.json()['images'][0]

    img_urls = [upload_image(base64_string, firestore_id, i,"upscale", extra_params["scale_factor"], extra_params["creativity"],  ref_image) for i, base64_string in enumerate([base64_image])]
    return img_urls
    


def layering(firestore_id, ref_image, extra_params):
    temp_folder = pathlib.Path("layering", "runs", "temp")
    if not os.path.exists(temp_folder):
        os.makedirs(temp_folder)
    img_name = download(ref_image, temp_folder, firestore_id)

    # psd_path = perform_layering(temp_folder, img_name, extra_params["dominant_colors"])
    psd_path = perform_layering(temp_folder, img_name, extra_params["n_layers"])
    # Upload images to Firebase Storage
    psd_uploaded_path = upload_psd_from_path(psd_path, firestore_id)
    print(psd_uploaded_path)
    return psd_uploaded_path


def process_task(task_id, task):
    try:
        # Update task state to "processing"
        update_task_state(task_id, 'processing')
        print(f"Processing task {task_id}...", task)

        # Mark the task as running
        task_running_map[task_id].set()

        # Simulate API call
        # dummy_response = simulate_api_call()
        img_urls = []
        if task.get("type") == "text2img":
            img_urls = text2img(task.get("firestore_id"), task.get("prompt"), "blurry, low quality", task.get("count"),
                                task.get("extra_params"))
        elif task.get("type") == "img2img":
            img_urls = img2img(task.get("firestore_id"), task.get("ref_image"), "floral", "blurry, low quality",
                               task.get("count"), task.get("extra_params"))
        elif task.get("type") == "upscale":
            img_urls = upscale(task.get("firestore_id"), task.get("ref_image"), task.get("extra_params"))
        elif task.get("type") == "layering":
            img_urls = [layering(task.get("firestore_id"), task.get("ref_image"), task.get("extra_params"))]
        else:
            raise Exception("unsupported type")

        # Update Realtime Database with image links
        db_ref.child(task_id).child('results').set(img_urls)

        # Update final status in Firestore
        update_final_status_in_firestore(task_id, task.get("firestore_id"), True)

        # Deduct credits from /orgs/{org_id}
        deduct_credits(task.get("org_id"), task.get("credits"))

        print(f"Task {task_id} processed successfully.")
        update_task_state(task_id, 'completed')
    except Exception as e:
        print(f"Error processing task {task_id}: {e}")
        # Update task state to "error" if an error occurs
        update_task_state(task_id, 'failed')
        update_final_status_in_firestore(task_id, task.get("firestore_id"), False)
    finally:
        # Mark the task as finished
        task_running_map[task_id].clear()


# Listen for changes in the /tasks node
def on_task_change(event):
    try:
        task_id, task = get_task_info_from_event(event)
        if task and "status" in task and task["status"] == "queued":
            st = time.time()
            process_task(task_id, task)
            print(f"Task {task_id} processed successfully. Time taken: {time.time() - st}")

    except Exception as e:
        print(f"Error processing task change: {e}")


def get_task_info_from_event(event):
    if len(event.path) == 1:
        task_id = next(iter(event.data))
        task = event.data[task_id]
    else:
        task_id = event.path[1:]
        task = event.data

    return task_id, task


# Listen for changes in the /tasks node
# tasks_stream = db_ref.listen(on_task_change)
import time
import sched

MAX_ACTIVE_TIME = 600  # Maximum active time in seconds (10 minutes)
COOLDOWN_TIME = 60  # Cooldown time in seconds (1 minute)

# Thread-safe map to keep track of whether a task is running
task_running_map = defaultdict(threading.Event)

tasks_stream = None


# Listen for changes in the /tasks node
def listen_for_task_changes(sc):
    global tasks_stream
    if tasks_stream is not None:
        tasks_stream.close()
    print("Listening for task changes...")
    try:
        tasks_stream = db_ref.listen(on_task_change)
    except requests.exceptions.Timeout as e:
        print(f"Error: {e}. Re-establishing connection...")

    # Wait for any task to finish running before scheduling the next listening
    for task_id in task_running_map:
        task_running_map[task_id].wait()


    # Schedule the next listening after the cooldown time
    sc.enter(COOLDOWN_TIME, 1, listen_for_task_changes, (sc,))


# Create a scheduler instance
scheduler = sched.scheduler(time.time, time.sleep)

# Schedule the initial listening
scheduler.enter(0, 1, listen_for_task_changes, (scheduler,))

# Run the scheduler
scheduler.run()

# upload_psd_from_path("/Users/rikenshah/Desktop/Projects/FashionxAI/local-sync-go/scripts/layering/old_runs/outputs/664153a3-596c-437e-812a-7694441e299b.jpeg/output.psd", "temp")

# layering("z5STOLemjohGH5bNySjygSg40W73", "https://firebasestorage.googleapis.com/v0/b/ai-folder.appspot.com/o/search%2Frikenshah.02%40gmail.com%2F101_cutout.png?alt=media&token=d2ad1b0b-2cba-40b0-904b-d9af3c21cae8", {"dominant_colors": [
#     {
#         "alpha": 1,
#         "blue": 160,
#         "green": 178,
#         "red": 220
#     },
#     {
#         "alpha": 1,
#         "blue": 51,
#         "green": 115,
#         "red": 200
#     },
#     {
#         "alpha": 1,
#         "blue": 114,
#         "green": 121,
#         "red": 199
#     },
#     {
#         "alpha": 1,
#         "blue": 118,
#         "green": 136,
#         "red": 146
#     },
#     {
#         "alpha": 1,
#         "blue": 79,
#         "green": 179,
#         "red": 216
#     },
#     {
#         "alpha": 1,
#         "blue": 87,
#         "green": 71,
#         "red": 116
#     },
#     {
#         "alpha": 1,
#         "blue": 220,
#         "green": 228,
#         "red": 247
#     }
# ]})
